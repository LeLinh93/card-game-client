import {useEffect, useRef, useState} from "react";
import "./Match.css";
import {Engine3D} from "../game/Engine3D";
import {Board3D, Side} from "../game/Board3D";
import {Connection} from "../game/connection";
import {ActionQueue, wait} from "../game/actionQueue";
import {DrawCardMessage, GameCard, isKnown, PlayerState, StartGameMessage, StateMessage} from "../game/protocol";
import {Hand, handCardRect, HandCard} from "../components/Hand";
import {Mode} from "./Home";

// Time between two cards leaving the deck when several are drawn in a row
const DRAW_GAP = 160;

// The messages whose state replaces what the hands show
const STATE_MESSAGES = ["updateMessage", "sacrificeMessage", "summonMessage", "attackMessage", "destroyMessage"];

type Hands = Record<Side, HandCard[]>;

// A card keeps "arriving" while its 3D card is still flying in
function handFrom(cards:GameCard[], before:HandCard[]):HandCard[]{
    return cards.filter(c => c).map(card => ({card, arriving:before.some(h => h.card.id === card.id && h.arriving)}));
}

// The match: the 3D play area fills the window, the hands are drawn over it in HTML.
// For now it plays the draws: the opening hands, then the cards drawn each turn.
export function Match(props:{mode:Mode, token:string, onLeave:()=>void}){
    const mount = useRef<HTMLDivElement>(null);
    const [loaded, setLoaded] = useState({scene:false, match:false});
    const [error, setError] = useState("");
    const [hands, setHands] = useState<Hands>({player:[], opponent:[]});
    const [backImage, setBackImage] = useState("");
    const [myTurn, setMyTurn] = useState<boolean>(null);

    useEffect(()=>{
        const engine = new Engine3D();
        const board = new Board3D(engine);
        const connection = new Connection();
        const queue = new ActionQueue();
        let left = false;

        const setState = (player:PlayerState, opponent:PlayerState)=>{
            setHands(h => ({player:handFrom(player.hand, h.player), opponent:handFrom(opponent.hand, h.opponent)}));
        };

        // The card takes its place in the hand, hidden, and the 3D card flies there; the next
        // action starts while it is still in the air
        const draw = (side:Side, card:GameCard)=>{
            queue.add(async ()=>{
                setHands(h => h[side].some(c => c.card.id === card.id) ? h : {...h, [side]:h[side].concat([{card, arriving:true}])});
                const face = side === "player" && isKnown(card) ? card : null;
                board.drawCard(side, face, ()=>handCardRect(side, card.id)).then(()=>{
                    setHands(h => ({...h, [side]:h[side].map(c => c.card.id === card.id ? {...c, arriving:false} : c)}));
                });
                await wait(DRAW_GAP);
            });
        };

        // The server drew the opening hands before sending them: they fly in one by one
        connection.on("startGame", (msg:StartGameMessage)=>{
            queue.add(()=>{
                setMyTurn(msg.isTurn);
                setHands({player:[], opponent:[]});
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
        connection.on("drawCardMessage", (msg:DrawCardMessage)=>{
            draw(msg.isTurn ? "player" : "opponent", msg.card);
        });
        connection.on("endTurn", (msg:StartGameMessage)=>{
            queue.add(()=>{
                setMyTurn(msg.isTurn);
                setState(msg.player, msg.opponent);
            });
        });
        STATE_MESSAGES.forEach((name)=>{
            connection.on(name, (msg:StateMessage)=>{
                queue.add(()=>{setState(msg.player, msg.opponent)});
            });
        });
        connection.on("endGameMessage", (msg:{isTurn:boolean})=>{
            queue.add(()=>{setError(msg.isTurn ? "You won!" : "You lost.")});
        });

        const scene = engine.initialize(mount.current).then(()=>board.prepare()).then(()=>{
            if(!left){
                setBackImage(board.backImage);
                setLoaded(l => ({...l, scene:true}));
            }
        });
        const match = connection.login(props.token).then(()=>connection.findMatch(props.mode)).then(()=>{
            if(!left){
                setLoaded(l => ({...l, match:true}));
            }
        });
        // The server starts once this client is ready, so no draw is missed while the scene loads
        Promise.all([scene, match]).then(()=>{
            if(!left){
                connection.send("clientReady");
            }
        }, (e)=>{
            console.log(e);
            if(!left){
                setError(e && e.message ? e.message : "The match couldn't be started.");
            }
        });

        return ()=>{
            left = true;
            queue.stop();
            board.stop();
            engine.stop();
            connection.close();
        };
    }, [props.mode, props.token]);

    const waiting = !loaded.scene ? "Loading the play area…" : !loaded.match ? (props.mode === "free" ? "Looking for an opponent…" : "Starting the match…") : "";

    return(
        <div className="match-page" data-mode={props.mode}>
            <div className="match-scene" ref={mount}/>
            <Hand side="opponent" cards={hands.opponent} backImage={backImage}/>
            <Hand side="player" cards={hands.player} backImage={backImage}/>
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
