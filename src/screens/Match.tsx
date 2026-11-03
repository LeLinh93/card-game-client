import {PointerEvent, useEffect, useRef, useState} from "react";
import "./Match.css";
import {Engine3D} from "../game/Engine3D";
import {Board3D, DragKind, DropTarget, Row, Side} from "../game/Board3D";
import {Connection} from "../game/connection";
import {ActionQueue, wait} from "../game/actionQueue";
import {DrawCardMessage, GameCard, isKnown, PlayerState, SelectionMessage, SkillDamageMessage, StartGameMessage, StateMessage} from "../game/protocol";
import {Hand, handCardRect, HandCard} from "../components/Hand";
import {CardView} from "../components/CardView";
import {CardPicker} from "../components/CardPicker";
import {SkillLog, SkillLogEntry} from "../components/SkillLog";
import {Mode} from "./Home";

// Time between two cards leaving the deck when several are drawn in a row
const DRAW_GAP = 160;
// How long to wait for the server's answer to a sacrifice or summon before taking the card back
const ANSWER_TIMEOUT = 5000;

// The messages whose state replaces what the board and the hands show
const STATE_MESSAGES = ["updateMessage", "attackMessage", "destroyMessage"];

type Hands = Record<Side, HandCard[]>;

// A skill's card pick: on the field (the zones show which cards), in the player's hand, or from a
// list of the cards for other places (deck, graveyard...)
interface Pick{
    cards:GameCard[];
    amount:number;
    message:string;
    mode:"field" | "hand" | "list";
    picked:string[];
}

function pickMode(msg:SelectionMessage, me:PlayerState, them:PlayerState):Pick["mode"]{
    if(msg.where === "myField" || msg.where === "oppoField" || msg.where === "field"){
        return "field";
    }
    if(msg.where === "hand"){
        return "hand";
    }
    if(msg.where){
        return "list";
    }
    // An older server doesn't say where: look for the cards
    const onField = (c:GameCard) => [me, them].some(state => state && state.frontline.concat(state.backline).some(f => f && f.id === c.id));
    if(msg.selection.length > 0 && msg.selection.every(onField)){
        return "field";
    }
    return me && msg.selection.length > 0 && msg.selection.every(c => me.hand.some(h => h.id === c.id)) ? "hand" : "list";
}

// A card keeps "arriving" while its 3D card is still flying in
function handFrom(cards:GameCard[], before:HandCard[]):HandCard[]{
    return cards.filter(c => c).map(card => ({card, arriving:before.some(h => h.card.id === card.id && h.arriving)}));
}

// Whether the player may put this card from the hand on that zone: units go in the front row (or
// the back row with Take cover), structures and traps in the back row; the zone is free and the
// card paid for. The server checks again.
function canPlace(state:PlayerState, card:GameCard, row:Row, index:number):boolean{
    if(!state || state.resources < card.resources){
        return false;
    }
    if((row === "front" ? state.frontline : state.backline)[index]){
        return false;
    }
    if(card.type === "unit"){
        return row === "front" || (card.attribute || []).indexOf("takecover") >= 0;
    }
    return (card.type === "structure" || card.type === "trap") && row === "back";
}

// Whether a card of the player's field can attack now: face up, a unit or structure with attack,
// that hasn't attacked (and isn't summon sick) this turn
function canAttack(card:GameCard):boolean{
    return !!card && !card.isHidden && (card.type === "unit" || card.type === "structure") && !card.isAttack && card.attack > 0;
}

// A face-down structure can be turned face up; a face-up card can use its Active skill while it has
// uses left this turn and wasn't just summoned (the server checks the cost)
function canActivate(card:GameCard):boolean{
    if(!card){
        return false;
    }
    if(card.isHidden){
        return card.type === "structure";
    }
    return !card.summonSick && (card.activeLeft || [])[0] > 0;
}

// The opponent can be attacked directly once nothing is left on their field
function fieldEmpty(state:PlayerState):boolean{
    return !!state && state.frontline.concat(state.backline).every(c => !c);
}

// Whether the attacker can strike this card of the opponent's: a backline card behind a frontline
// card can only be hit with Markmanship (face down) or Siege (face up). (Duel, once a turn, is left
// to the server: the client isn't told whether a card was attacked this turn.)
function canTarget(attacker:GameCard, target:GameCard, state:PlayerState):boolean{
    if(!target){
        return false;
    }
    const back = state.backline.findIndex(c => c && c.id === target.id);
    if(back < 0 || !state.frontline[back]){
        return true;
    }
    return (attacker.attribute || []).indexOf(target.isHidden ? "markmanship" : "siege") >= 0;
}

// The match: the 3D play area fills the window, the hands are drawn over it in HTML.
// Cards are drawn from the decks; the player drags a hand card onto the sphere to sacrifice it
// for a resource, or onto a zone of their field to summon it, drags a field card onto an opponent's
// card to attack it, and activates their face-down structures.
export function Match(props:{mode:Mode, token:string, onLeave:()=>void}){
    const mount = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState({scene:false, match:false});
    const [error, setError] = useState("");
    const [hands, setHands] = useState<Hands>({player:[], opponent:[]});
    const [backImage, setBackImage] = useState("");
    const [myTurn, setMyTurn] = useState<boolean>(null);
    // The card being dragged, or played and waiting for the server; it shows on the board
    const [heldID, setHeldID] = useState<string>(null);
    // The field card the pointer is over, shown large on the left so it can be read
    const [inspected, setInspected] = useState<GameCard>(null);
    // The player's face-down structure under the pointer, with its Activate button
    const [activatable, setActivatable] = useState<{card:GameCard, rect:DOMRect}>(null);
    // The attack line, from the attacker to the pointer, while a field card is dragged
    const [aim, setAim] = useState<{from:{x:number, y:number}, to:{x:number, y:number}, valid:boolean}>(null);
    // The card whose skill just went off, shown on the right
    const [effect, setEffect] = useState<{card:GameCard, key:number}>(null);
    // A skill is making the player pick cards; the game waits until they confirm
    const [pick, setPick] = useState<Pick>(null);
    // While a spell or ability is aimed: what to target
    const [aimHint, setAimHint] = useState("");
    // Every skill that went off, from the server's log
    const [skillLog, setSkillLog] = useState<SkillLogEntry[]>([]);
    // The match is over: won or lost
    const [result, setResult] = useState<"won" | "lost">(null);
    // A skill summons a card: the player chooses a free zone for it, on their field or the opponent's
    const [placing, setPlacing] = useState<{card:GameCard, side:Side, zones:{row:Row, index:number}[]}>(null);
    const placeDone = useRef<()=>void>(null);
    const pickDone = useRef<()=>void>(null);

    const board = useRef<Board3D>(null);
    const connection = useRef<Connection>(null);
    const player = useRef<PlayerState>(null);
    const opponent = useRef<PlayerState>(null);
    const turn = useRef(false);
    const pending = useRef<{action:string, cardID:string, timer:number}>(null);

    useEffect(()=>{
        const engine = new Engine3D();
        const b = new Board3D(engine, (side)=>{
            const el = document.querySelector('[data-hand="' + side + '"]');
            return el ? el.getBoundingClientRect() : null;
        });
        const c = new Connection();
        board.current = b;
        connection.current = c;
        const queue = new ActionQueue();
        let left = false;
        // The opponent's hand as last known, to tell when a card left it
        let opponentHand:GameCard[] = [];
        let effectTimer:number = null;
        const sideOf = (isTurn:boolean):Side => isTurn ? "player" : "opponent";
        const otherSide = (side:Side):Side => side === "player" ? "opponent" : "player";

        // The board and the hands take the server's state
        const setState = (me:PlayerState, them:PlayerState)=>{
            player.current = me;
            opponent.current = them;
            opponentHand = them.hand;
            setHands(h => ({player:handFrom(me.hand, h.player), opponent:handFrom(them.hand, h.opponent)}));
            b.setResources("player", me.resources);
            b.setResources("opponent", them.resources);
            b.setDeckCount("player", me.deckAmount);
            b.setDeckCount("opponent", them.deckAmount);
            b.setPortalOpen(turn.current && fieldEmpty(them));
            return Promise.all([b.syncField("player", me.frontline, me.backline), b.syncField("opponent", them.frontline, them.backline)]);
        };

        // The answer to the player's sacrifice or summon has come
        const answered = (cardID:string)=>{
            if(pending.current && pending.current.cardID === cardID){
                clearTimeout(pending.current.timer);
                pending.current = null;
                setHeldID(null);
            }
        };

        // The card takes its place in the hand, hidden, and the 3D card flies there; the next
        // action starts while it is still in the air
        const draw = (side:Side, card:GameCard)=>{
            queue.add(async ()=>{
                if(side === "opponent" && !opponentHand.some(x => x.id === card.id)){
                    opponentHand = opponentHand.concat([card]);
                }
                setHands(h => h[side].some(x => x.card.id === card.id) ? h : {...h, [side]:h[side].concat([{card, arriving:true}])});
                const face = side === "player" && isKnown(card) ? card : null;
                b.takeFromDeck(side);
                b.drawCard(side, face, ()=>handCardRect(side, card.id)).then(()=>{
                    setHands(h => ({...h, [side]:h[side].map(x => x.card.id === card.id ? {...x, arriving:false} : x)}));
                });
                await wait(DRAW_GAP);
            });
        };

        // The server drew the opening hands before sending them: the back rows are laid out from the
        // decks first, then the hands fly in one by one
        c.on("startGame", (msg:StartGameMessage)=>{
            queue.add(async ()=>{
                setMyTurn(msg.isTurn);
                turn.current = msg.isTurn;
                b.setEndTurnButton(msg.isTurn, true);
                player.current = msg.player;
                opponent.current = msg.opponent;
                setHands({player:[], opponent:[]});
                b.setResources("player", msg.player.resources);
                b.setResources("opponent", msg.opponent.resources);
                // The opening hands were drawn before the counts were taken: they leave the decks as they fly
                b.setDeckCount("player", msg.player.deckAmount + msg.player.hand.length);
                b.setDeckCount("opponent", msg.opponent.deckAmount + msg.opponent.hand.length);
                await Promise.all([
                    b.syncField("player", msg.player.frontline, msg.player.backline, true),
                    b.syncField("opponent", msg.opponent.frontline, msg.opponent.backline, true),
                ]);
            });
            const mine = msg.player.hand, theirs = msg.opponent.hand;
            for(let i = 0; i < Math.max(mine.length, theirs.length); i++){
                if(mine[i]){
                    draw("player", mine[i]);
                }
                if(theirs[i]){
                    draw("opponent", theirs[i]);
                }
            }
        });
        c.on("drawCardMessage", (msg:DrawCardMessage)=>{
            draw(msg.isTurn ? "player" : "opponent", msg.card);
        });
        // The button flipped over when the player ended their turn; it turns back when the opponent ends theirs
        c.on("endTurn", (msg:StartGameMessage)=>{
            queue.add(async ()=>{
                setMyTurn(msg.isTurn);
                turn.current = msg.isTurn;
                b.setEndTurnButton(msg.isTurn);
                b.setPortalOpen(msg.isTurn && fieldEmpty(msg.opponent));
                await setState(msg.player, msg.opponent);
            });
        });
        // The player's held card sinks into the sphere; for the opponent, a card from their hand does
        c.on("sacrificeMessage", (msg:StateMessage)=>{
            queue.add(async ()=>{
                const mine = pending.current && pending.current.action === "sacrifice" && !msg.player.hand.some(h => h.id === pending.current.cardID);
                if(mine){
                    const cardID = pending.current.cardID;
                    await b.sacrificeHeld();
                    answered(cardID);
                }
                else if(msg.opponent.hand.length < opponentHand.length){
                    await b.sacrificeFrom("opponent");
                }
                await setState(msg.player, msg.opponent);
            });
        });
        // A summoned card moves onto its zone: the player's from where it was dropped
        c.on("summonMessage", (msg:StateMessage)=>{
            queue.add(async ()=>{
                const done = setState(msg.player, msg.opponent);
                if(pending.current && !msg.player.hand.some(h => h.id === pending.current.cardID)){
                    answered(pending.current.cardID);
                }
                await done;
            });
        });
        // An attack: the attacker lifts, then strikes; the damage shows once it is back
        c.on("beginAttackMessage", (msg:{attacker:string, isTurn:boolean})=>{
            queue.add(()=>b.liftAttacker(sideOf(msg.isTurn), msg.attacker));
        });
        c.on("attackMessage", (msg:StateMessage & {attacker:string, target:string, isTurn:boolean})=>{
            queue.add(async ()=>{
                const side = sideOf(msg.isTurn);
                await b.slam(side, msg.attacker, {side:otherSide(side), cardID:msg.target});
                answered(msg.attacker);
                await setState(msg.player, msg.opponent);
            });
        });
        c.on("attackFailMessage", (msg:{attacker:string, isTurn:boolean})=>{
            queue.add(async ()=>{
                await b.landAttacker(sideOf(msg.isTurn), msg.attacker);
                answered(msg.attacker);
            });
        });
        c.on("attackPlayerMessage", (msg:{attacker:string, isTurn:boolean})=>{
            queue.add(async ()=>{
                await b.slam(sideOf(msg.isTurn), msg.attacker, "player");
                answered(msg.attacker);
            });
        });
        // A skill went off: a face-down card (a trap) turns face up first, then the card flashes on the
        // field and is shown on the right for a moment. A trap is then taken off the field by the next state.
        c.on("cardEffectMessage", (msg:{card:GameCard, isTurn:boolean, skill?:string})=>{
            queue.add(async ()=>{
                setSkillLog(l => l.concat([{yours:msg.isTurn, card:msg.card.name, skill:msg.skill || ""}]));
                await b.reveal(sideOf(msg.isTurn), msg.card);
                clearTimeout(effectTimer);
                setEffect({card:msg.card, key:Date.now()});
                effectTimer = window.setTimeout(()=>{setEffect(null)}, 2200);
                await Promise.all([b.flash(sideOf(msg.isTurn), msg.card.id), wait(700)]);
            });
        });
        // A skill's damage: lightning or arrows hit the cards before their new health shows
        c.on("skillDamageMessage", (msg:SkillDamageMessage)=>{
            queue.add(()=>b.skillDamage(msg.kind, msg.targets.map(t => t.id)));
        });
        // A skill summons a card: the queue waits until the player has chosen its zone
        c.on("specialSummonMessage", (msg:{card:GameCard, isTurn:boolean})=>{
            queue.add(()=>new Promise<void>((resolve)=>{
                const side:Side = msg.isTurn ? "player" : "opponent";
                const state = side === "player" ? player.current : opponent.current;
                const zones:{row:Row, index:number}[] = [];
                (["front", "back"] as Row[]).forEach((row)=>{
                    for(let i = 0; i < 5; i++){
                        const free = state && !(row === "front" ? state.frontline : state.backline)[i];
                        const fits = msg.card.type === "unit" ? row === "front" || (msg.card.attribute || []).indexOf("takecover") >= 0 : row === "back";
                        if(free && fits){
                            zones.push({row, index:i});
                        }
                    }
                });
                setInspected(null);
                setActivatable(null);
                setPlacing({card:msg.card, side, zones});
                placeDone.current = resolve;
            }));
        });
        // The queue waits here until the player confirms their pick
        c.on("selectionMessage", (msg:SelectionMessage)=>{
            queue.add(()=>new Promise<void>((resolve)=>{
                const amount = Math.max(0, Math.min(msg.amount, msg.selection.length));
                // Nothing to pick: the skill goes on without it
                if(amount <= 0){
                    c.send("cardSelect", {selection:""});
                    return resolve();
                }
                setInspected(null);
                setActivatable(null);
                setPick({cards:msg.selection, amount, message:msg.message, mode:pickMode(msg, player.current, opponent.current), picked:[]});
                pickDone.current = resolve;
            }));
        });
        c.on("actionFail", (msg:{action:string, cardID:string})=>{
            queue.add(()=>{
                if(pending.current && pending.current.cardID === msg.cardID){
                    if(pending.current.action === "attackCard" || pending.current.action === "attackPlayer"){
                        b.landAttacker("player", msg.cardID);
                    }
                    else{
                        b.cancelHeld();
                    }
                    answered(msg.cardID);
                }
            });
        });
        STATE_MESSAGES.forEach((name)=>{
            c.on(name, (msg:StateMessage)=>{
                queue.add(async ()=>{
                    // The first state after playing a spell or ability means it was played
                    if(name === "updateMessage" && pending.current && pending.current.action === "playSpell"){
                        const cardID = pending.current.cardID;
                        await b.castHeld();
                        answered(cardID);
                    }
                    await setState(msg.player, msg.opponent);
                });
            });
        });
        c.on("endGameMessage", (msg:{isTurn:boolean})=>{
            queue.add(()=>{
                setResult(msg.isTurn ? "won" : "lost");
                setPick(null);
                setPlacing(null);
            });
        });

        const scene = engine.initialize(mount.current).then(()=>b.prepare()).then(()=>{
            if(!left){
                setBackImage(b.backImage);
                setLoaded(l => ({...l, scene:true}));
            }
        });
        const match = c.login(props.token).then(()=>c.findMatch(props.mode)).then(()=>{
            if(!left){
                setLoaded(l => ({...l, match:true}));
            }
        });
        // The server starts once this client is ready, so nothing is missed while the scene loads
        Promise.all([scene, match]).then(()=>{
            if(!left){
                c.send("clientReady");
            }
        }, (e)=>{
            console.log(e);
            if(!left){
                setError(e && e.message ? e.message : "The match couldn't be started.");
            }
        });

        return ()=>{
            left = true;
            clearTimeout(effectTimer);
            pickDone.current = null;
            placeDone.current = null;
            if(pending.current){
                clearTimeout(pending.current.timer);
                pending.current = null;
            }
            queue.stop();
            b.stop();
            engine.stop();
            c.close();
        };
    }, [props.mode, props.token]);

    // Dragging a card from the hand, on the player's turn: over the sphere it is sacrificed, over a
    // zone it can go to it is summoned there; let go anywhere else, it goes back to the hand
    function startDrag(card:GameCard, e:PointerEvent){
        if(e.button !== 0 || !turn.current || pending.current || heldID || !loaded.scene || error || result || pick || placing){
            return;
        }
        e.preventDefault();
        const b = board.current;
        // Spells and abilities with a target are aimed with a line from the hand; without one they are
        // dropped on the board
        const spell = card.type === "spell" || card.type === "ability";
        const kind:DragKind = !spell ? "summon" : card.needsTarget ? "aim" : "cast";
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        b.startDrag(card, e.clientX, e.clientY, kind, card.targets || [], {x:rect.left + rect.width / 2, y:rect.top + rect.height * 0.3});
        setHeldID(card.id);
        if(kind === "aim"){
            setAimHint(card.targetHint || "Target a card");
        }
        const move = (ev:globalThis.PointerEvent)=>{
            b.moveDrag(ev.clientX, ev.clientY, (row, index)=>canPlace(player.current, card, row, index));
        };
        const up = ()=>{
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            setAimHint("");
            play(card, b.dropDrag());
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
    }

    function play(card:GameCard, target:DropTarget){
        if(!target){
            setHeldID(null);
            return;
        }
        let action:string;
        let data:Record<string, any> = {cardID:card.id};
        if(target.kind === "sphere"){
            action = "sacrifice";
        }
        else if(target.kind === "zone"){
            action = target.row === "front" ? "summonFront" : "summonBack";
            data.index = target.index;
        }
        else{
            action = "playSpell";
            if(target.kind === "card"){
                data.target = target.cardID;
            }
        }
        // No answer at all: take the card back
        const timer = window.setTimeout(()=>{
            if(pending.current && pending.current.cardID === card.id){
                board.current.cancelHeld();
                pending.current = null;
                setHeldID(null);
            }
        }, ANSWER_TIMEOUT);
        pending.current = {action, cardID:card.id, timer};
        connection.current.send(action, data);
    }

    // The zones show which field cards can be picked, and which are
    useEffect(()=>{
        if(!board.current || !loaded.scene){
            return;
        }
        board.current.markPick(pick && pick.mode === "field" ? new Set(pick.cards.map(c => c.id)) : null, new Set(pick ? pick.picked : []));
    }, [pick, loaded.scene]);

    useEffect(()=>{
        if(board.current && loaded.scene && !pick){
            board.current.markZones(placing ? placing.side : "player", placing ? placing.zones : null, null);
        }
    }, [placing, loaded.scene]);

    // The summoned card goes on the zone clicked, if it can go there
    function place(x:number, y:number){
        const zone = board.current.zoneAt(placing.side, x, y);
        if(!zone || !placing.zones.some(z => z.row === zone.row && z.index === zone.index)){
            return;
        }
        connection.current.send("specialSummon", {selection:zone.row + "/" + zone.index});
        setPlacing(null);
        const done = placeDone.current;
        placeDone.current = null;
        if(done){
            done();
        }
    }

    // Clicking a card picks it, clicking it again lets it go. With all picked, another click swaps
    // the card when only one is picked, and does nothing otherwise.
    function togglePick(card:GameCard){
        setPick((p)=>{
            if(!p || !p.cards.some(c => c.id === card.id)){
                return p;
            }
            if(p.picked.includes(card.id)){
                return {...p, picked:p.picked.filter(id => id !== card.id)};
            }
            if(p.picked.length < p.amount){
                return {...p, picked:p.picked.concat([card.id])};
            }
            return p.amount === 1 ? {...p, picked:[card.id]} : p;
        });
    }

    function confirmPick(){
        if(!pick || pick.picked.length !== pick.amount){
            return;
        }
        connection.current.send("cardSelect", {selection:pick.picked.join("/")});
        setPick(null);
        const done = pickDone.current;
        pickDone.current = null;
        if(done){
            done();
        }
    }

    // Clicking the End Turn button on the player's turn ends it; the button flips over
    function endTurn(){
        if(!turn.current || pending.current || heldID || pick || placing){
            return;
        }
        turn.current = false;
        board.current.setEndTurnButton(false);
        board.current.setPortalOpen(false);
        connection.current.send("endTurn");
    }

    // The field card under a point of the screen, with its side
    function fieldCardAt(x:number, y:number):{side:Side, card:GameCard}{
        const hit = loaded.scene ? board.current.fieldCardAt(x, y) : null;
        const state = hit ? (hit.side === "player" ? player.current : opponent.current) : null;
        const card = state ? state.frontline.concat(state.backline).find(c => c && c.id === hit.cardID) : null;
        return card ? {side:hit.side, card} : null;
    }

    // Over a field card the player may read (face up, or their own face-down card) it shows on the
    // left. On the player's turn an Activate button shows on their face-down structures (to turn them
    // face up) and on their cards whose Active skill can still be used this turn
    function inspect(e:PointerEvent){
        if(heldID || aim){
            return;
        }
        if(placing){
            const zone = board.current.zoneAt(placing.side, e.clientX, e.clientY);
            const can = !!zone && placing.zones.some(z => z.row === zone.row && z.index === zone.index);
            board.current.markZones(placing.side, placing.zones, can ? zone : null);
            (e.currentTarget as HTMLElement).style.cursor = can ? "pointer" : "default";
            return;
        }
        if(pick){
            const hit = pick.mode === "field" ? fieldCardAt(e.clientX, e.clientY) : null;
            (e.currentTarget as HTMLElement).style.cursor = hit && pick.cards.some(c => c.id === hit.card.id) ? "pointer" : "default";
            setInspected(hit && isKnown(hit.card) && (!hit.card.isHidden || hit.side === "player") ? hit.card : null);
            return;
        }
        // The End Turn button can be pressed on the player's turn
        (e.currentTarget as HTMLElement).style.cursor = loaded.scene && turn.current && board.current.endTurnButtonAt(e.clientX, e.clientY) ? "pointer" : "";
        const hit = fieldCardAt(e.clientX, e.clientY);
        const readable = hit && isKnown(hit.card) && (!hit.card.isHidden || hit.side === "player") ? hit.card : null;
        setInspected(readable);
        if(hit && hit.side === "player" && canActivate(hit.card) && turn.current && !pending.current){
            if(!activatable || activatable.card.id !== hit.card.id){
                setActivatable({card:hit.card, rect:board.current.cardScreenRect("player", hit.card.id)});
            }
        }
        else if(activatable){
            setActivatable(null);
        }
    }

    function activate(card:GameCard){
        setActivatable(null);
        if(card.isHidden){
            connection.current.send("flipStructure", {cardID:card.id});
        }
        else{
            // A card has at most one Active skill
            connection.current.send("activeSkill", {cardID:card.id, index:0});
        }
    }

    // Dragging a field card that can attack draws a line to the pointer; let go over a card it can
    // strike (or over the opponent's portal once their field is empty) to attack
    function startAttack(e:PointerEvent){
        if(e.button !== 0 || !loaded.scene){
            return;
        }
        // While placing a summoned card, a click on the field only chooses its zone
        if(placing){
            return place(e.clientX, e.clientY);
        }
        // While picking, a click on the field only picks
        if(pick){
            const hit = pick.mode === "field" ? fieldCardAt(e.clientX, e.clientY) : null;
            if(hit){
                togglePick(hit.card);
            }
            return;
        }
        if(!turn.current || pending.current || heldID || error || result){
            return;
        }
        if(board.current.endTurnButtonAt(e.clientX, e.clientY)){
            return endTurn();
        }
        const hit = fieldCardAt(e.clientX, e.clientY);
        if(!hit || hit.side !== "player" || !canAttack(hit.card)){
            return;
        }
        e.preventDefault();
        const b = board.current;
        const attacker = hit.card;
        const from = b.cardScreenPoint("player", attacker.id);
        setInspected(null);
        setActivatable(null);
        let target:{side:Side, cardID:string} | "player" = null;
        const move = (ev:globalThis.PointerEvent)=>{
            const over = fieldCardAt(ev.clientX, ev.clientY);
            if(over && over.side === "opponent" && canTarget(attacker, over.card, opponent.current)){
                target = {side:"opponent", cardID:over.card.id};
            }
            else if(fieldEmpty(opponent.current) && b.overPortal(ev.clientX, ev.clientY)){
                target = "player";
            }
            else{
                target = null;
            }
            b.aimAt(target);
            setAim({from, to:{x:ev.clientX, y:ev.clientY}, valid:!!target});
        };
        const up = ()=>{
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            b.aimAt(null);
            setAim(null);
            if(target){
                attack(attacker, target);
            }
        };
        setAim({from, to:{x:e.clientX, y:e.clientY}, valid:false});
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
    }

    function attack(attacker:GameCard, target:{side:Side, cardID:string} | "player"){
        const action = target === "player" ? "attackPlayer" : "attackCard";
        const timer = window.setTimeout(()=>{
            if(pending.current && pending.current.cardID === attacker.id){
                pending.current = null;
            }
        }, ANSWER_TIMEOUT);
        pending.current = {action, cardID:attacker.id, timer};
        connection.current.send(action, target === "player" ? {attacker:attacker.id} : {attacker:attacker.id, target:target.cardID});
    }

    // Giving up a running match makes the opponent win; before it started (or once it is over) the
    // button just leaves
    function surrender(){
        if(!loaded.match || result || error){
            return props.onLeave();
        }
        if(window.confirm("Surrender this match? Your opponent wins.")){
            connection.current.send("surrender");
        }
    }

    const waiting = !loaded.scene ? "Loading the play area…" : !loaded.match ? (props.mode === "free" ? "Looking for an opponent…" : "Starting the match…") : "";

    return(
        <div className="match-page" data-mode={props.mode}>
            <div className="match-scene" ref={mount} onPointerMove={inspect} onPointerDown={startAttack}
                 onPointerLeave={(e)=>{
                     // Moving onto the Activate button keeps it, and the card shown on the left
                     if(!(e.relatedTarget instanceof Element && e.relatedTarget.closest(".match-activate"))){
                         setInspected(null);
                         setActivatable(null);
                     }
                 }}/>
            {inspected ? <div className="match-inspect" aria-live="polite"><CardView card={inspected} scale={0.75}/></div> : null}
            {activatable && activatable.rect ? (
                <button className="match-activate" style={{left:activatable.rect.left + activatable.rect.width / 2, top:activatable.rect.top + activatable.rect.height / 2}}
                        onPointerLeave={(e)=>{
                            if(!(e.relatedTarget instanceof Element && e.relatedTarget.closest(".match-scene"))){
                                setActivatable(null);
                                setInspected(null);
                            }
                        }}
                        onClick={()=>{activate(activatable.card)}}>
                    Activate
                </button>
            ) : null}
            {aim ? (
                <svg className="match-aim" aria-hidden="true">
                    <defs>
                        <marker id="aim-head" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" className={aim.valid ? "aim-valid" : ""}/>
                        </marker>
                    </defs>
                    <line x1={aim.from.x} y1={aim.from.y} x2={aim.to.x} y2={aim.to.y} className={aim.valid ? "aim-valid" : ""} markerEnd="url(#aim-head)"/>
                </svg>
            ) : null}
            {aimHint ? <div className="match-pick match-aim-hint" role="status">{aimHint}</div> : null}
            {placing ? (
                <div className="match-pick" role="status">
                    {placing.zones.length > 0
                        ? "Choose a zone " + (placing.side === "player" ? "on your field" : "on your opponent's field") + " for " + placing.card.name
                        : "No free zone for " + placing.card.name}
                    {/* An out of range slot makes the server skip the summon */}
                    {placing.zones.length <= 0 ? <button onClick={()=>{const done = placeDone.current; placeDone.current = null; setPlacing(null); connection.current.send("specialSummon", {selection:"back/99"}); if(done){done()}}}>OK</button> : null}
                </div>
            ) : null}
            {pick && pick.mode !== "list" ? (
                <div className="match-pick" role="dialog" aria-label={pick.message}>
                    <span>{pick.message}</span>
                    <button className="primary" disabled={pick.picked.length !== pick.amount} onClick={confirmPick}>
                        Confirm ({pick.picked.length}/{pick.amount})
                    </button>
                </div>
            ) : null}
            {pick && pick.mode === "list" ? (
                <CardPicker message={pick.message} cards={pick.cards} picked={pick.picked} amount={pick.amount} onToggle={togglePick} onConfirm={confirmPick}/>
            ) : null}
            {effect ? (
                <div key={effect.key} className="match-effect" role="status">
                    <span className="match-effect-label">Skill activated</span>
                    <CardView card={effect.card} scale={0.6}/>
                </div>
            ) : null}
            <Hand side="opponent" cards={hands.opponent} backImage={backImage}/>
            <Hand side="player" cards={hands.player} backImage={backImage} heldID={heldID} onCardPointerDown={startDrag}
                  pick={pick && pick.mode === "hand" ? {pickable:pick.cards.map(c => c.id), picked:pick.picked, onToggle:togglePick} : undefined}/>
            {waiting || error || result ? (
                <div className={result ? "match-status match-result" : "match-status"} role="status">
                    {result ? (
                        <div className="match-result-box panel">
                            <span className={"match-result-text " + result}>{result === "won" ? "Victory" : "Defeat"}</span>
                            <button className="primary" onClick={props.onLeave}>Back to menu</button>
                        </div>
                    ) : error ? <span className="error">{error}</span> : waiting}
                </div>
            ) : null}
            {myTurn !== null && !error && !result ? <div className="match-turn">{myTurn ? "Your turn" : "Opponent's turn"}</div> : null}
            {loaded.match ? <SkillLog entries={skillLog}/> : null}
            <button className="match-leave" onClick={surrender}>{loaded.match && !result && !error ? "Surrender" : "Leave"}</button>
        </div>
    )
}
