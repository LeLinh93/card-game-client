import {PointerEvent, useEffect, useRef, useState} from "react";
import "./Match.css";
import {Engine3D} from "../game/Engine3D";
import {Board3D, DropTarget, Row, Side} from "../game/Board3D";
import {Connection} from "../game/connection";
import {ActionQueue, wait} from "../game/actionQueue";
import {DrawCardMessage, GameCard, isKnown, PlayerState, StartGameMessage, StateMessage} from "../game/protocol";
import {Hand, handCardRect, HandCard} from "../components/Hand";
import {CardView} from "../components/CardView";
import {Mode} from "./Home";

// Time between two cards leaving the deck when several are drawn in a row
const DRAW_GAP = 160;
// How long to wait for the server's answer to a sacrifice or summon before taking the card back
const ANSWER_TIMEOUT = 5000;

// The messages whose state replaces what the board and the hands show
const STATE_MESSAGES = ["updateMessage", "attackMessage", "destroyMessage"];

type Hands = Record<Side, HandCard[]>;

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

// The match: the 3D play area fills the window, the hands are drawn over it in HTML.
// Cards are drawn from the decks; the player drags a hand card onto the sphere to sacrifice it
// for a resource, or onto a zone of their field to summon it.
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

        // The board and the hands take the server's state
        const setState = (me:PlayerState, them:PlayerState)=>{
            player.current = me;
            opponent.current = them;
            opponentHand = them.hand;
            setHands(h => ({player:handFrom(me.hand, h.player), opponent:handFrom(them.hand, h.opponent)}));
            b.setResources("player", me.resources);
            b.setResources("opponent", them.resources);
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
                player.current = msg.player;
                opponent.current = msg.opponent;
                setHands({player:[], opponent:[]});
                b.setResources("player", msg.player.resources);
                b.setResources("opponent", msg.opponent.resources);
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
        c.on("endTurn", (msg:StartGameMessage)=>{
            queue.add(async ()=>{
                setMyTurn(msg.isTurn);
                turn.current = msg.isTurn;
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
        c.on("actionFail", (msg:{action:string, cardID:string})=>{
            queue.add(()=>{
                if(pending.current && pending.current.cardID === msg.cardID){
                    b.cancelHeld();
                    answered(msg.cardID);
                }
            });
        });
        STATE_MESSAGES.forEach((name)=>{
            c.on(name, (msg:StateMessage)=>{
                queue.add(async ()=>{await setState(msg.player, msg.opponent)});
            });
        });
        c.on("endGameMessage", (msg:{isTurn:boolean})=>{
            queue.add(()=>{setError(msg.isTurn ? "You won!" : "You lost.")});
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
        if(e.button !== 0 || !turn.current || pending.current || heldID || !loaded.scene || error){
            return;
        }
        e.preventDefault();
        const b = board.current;
        b.startDrag(card, e.clientX, e.clientY);
        setHeldID(card.id);
        const move = (ev:globalThis.PointerEvent)=>{
            b.moveDrag(ev.clientX, ev.clientY, (row, index)=>canPlace(player.current, card, row, index));
        };
        const up = ()=>{
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
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
        const action = target.kind === "sphere" ? "sacrifice" : target.row === "front" ? "summonFront" : "summonBack";
        // No answer at all: take the card back
        const timer = window.setTimeout(()=>{
            if(pending.current && pending.current.cardID === card.id){
                board.current.cancelHeld();
                pending.current = null;
                setHeldID(null);
            }
        }, ANSWER_TIMEOUT);
        pending.current = {action, cardID:card.id, timer};
        connection.current.send(action, target.kind === "zone" ? {cardID:card.id, index:target.index} : {cardID:card.id});
    }

    // Over a field card the player may read: face up, or their own face-down card
    function inspect(e:PointerEvent){
        if(!loaded.scene || heldID){
            return setInspected(null);
        }
        const hit = board.current.fieldCardAt(e.clientX, e.clientY);
        const state = hit ? (hit.side === "player" ? player.current : opponent.current) : null;
        const card = state ? state.frontline.concat(state.backline).find(c => c && c.id === hit.cardID) : null;
        const readable = card && isKnown(card) && (!card.isHidden || hit.side === "player") ? card : null;
        setInspected(readable);
    }

    const waiting = !loaded.scene ? "Loading the play area…" : !loaded.match ? (props.mode === "free" ? "Looking for an opponent…" : "Starting the match…") : "";

    return(
        <div className="match-page" data-mode={props.mode}>
            <div className="match-scene" ref={mount} onPointerMove={inspect} onPointerLeave={()=>{setInspected(null)}}/>
            {inspected ? <div className="match-inspect" aria-live="polite"><CardView card={inspected} scale={0.75}/></div> : null}
            <Hand side="opponent" cards={hands.opponent} backImage={backImage}/>
            <Hand side="player" cards={hands.player} backImage={backImage} heldID={heldID} onCardPointerDown={startDrag}/>
            {waiting || error ? (
                <div className="match-status" role="status">
                    {error ? <span className={error.startsWith("You") ? "" : "error"}>{error}</span> : waiting}
                </div>
            ) : null}
            {myTurn !== null && !error ? <div className="match-turn">{myTurn ? "Your turn" : "Opponent's turn"}</div> : null}
            <button className="match-leave" onClick={props.onLeave}>Leave</button>
        </div>
    )
}
