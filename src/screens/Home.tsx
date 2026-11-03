import {useEffect, useState} from "react";
import "./Home.css";
import {Session} from "../App";
import {Friend} from "../game/lobby";
import title from "../img/ui/title.png";

export type Mode = "free" | "bot" | "friend";

const MODES:{mode:Mode, label:string, about:string}[] = [
    {mode:"free", label:"Free match", about:"Play against another player"},
    {mode:"bot", label:"Bot match", about:"Play against the computer"},
    {mode:"friend", label:"Friend match", about:"Play against a friend"},
];

// The Home page: the first Play opens the play panel to choose a mode, the second starts the match.
// A friend match is with an online friend chosen from the list: Play invites them (onPlay with the friend).
export function Home(props:{session:Session, friends:Friend[], onDecks:()=>void, onFriends:()=>void, onPlay:(mode:Mode, friend?:Friend)=>void}){
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>(null);
    const [friendID, setFriendID] = useState<string>(null);
    const active = props.session.decks.find(d => d._id === props.session.activeDeck);
    const online = (props.friends || []).filter(f => f.online);
    // The chosen friend, while they are still online
    const friend = online.find(f => f.id === friendID) || null;
    const ready = !!mode && !!active && (mode !== "friend" || !!friend);

    useEffect(()=>{
        if(!open){
            return;
        }
        const onKey = (e:KeyboardEvent)=>{if(e.key === "Escape"){close()}};
        window.addEventListener("keydown", onKey);
        return ()=>{window.removeEventListener("keydown", onKey)};
    }, [open]);

    function close(){
        setOpen(false);
    }

    function play(){
        if(!open){
            return setOpen(true);
        }
        props.onPlay(mode, mode === "friend" ? friend : undefined);
    }

    return(
        <div className={open ? "home-page panel-open" : "home-page"}>
            <img className="home-title" src={title} alt="Defender trading card game"/>

            <aside className="play-panel panel" aria-hidden={!open} inert={!open}>
                <div className="play-panel-head">
                    <h2>Play</h2>
                    <button className="play-close" aria-label="Close" title="Close" onClick={close}>✕</button>
                </div>
                <div className="play-modes" role="radiogroup" aria-label="Game mode">
                    {MODES.map(m => (
                        <button key={m.mode} role="radio" aria-checked={mode === m.mode}
                                className={mode === m.mode ? "play-mode selected" : "play-mode"}
                                onClick={()=>{setMode(m.mode)}}>
                            <span className="play-mode-mark" aria-hidden="true"/>
                            <span className="play-mode-text">
                                <span className="play-mode-name">{m.label}</span>
                                <span className="play-mode-about">{m.about}</span>
                            </span>
                        </button>
                    ))}
                </div>
                {mode === "friend" ? (
                    <div className="play-friends">
                        <h3>Online friends</h3>
                        {online.length > 0 ? (
                            <div role="radiogroup" aria-label="Friend to play">
                                {online.map(f => (
                                    <button key={f.id} role="radio" aria-checked={friend === f}
                                            className={friend === f ? "play-friend selected" : "play-friend"}
                                            onClick={()=>{setFriendID(f.id)}}>
                                        <span className="play-friend-dot" aria-hidden="true"/>
                                        {f.name}
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <p className="play-friends-none">
                                {props.friends === null ? "Loading…" : "None of your friends is online."}
                                <button onClick={props.onFriends}>Friends</button>
                            </p>
                        )}
                    </div>
                ) : null}
            </aside>

            <div className="play-dock">
                {open ? (
                    <div className="play-deck">
                        {active ? (
                            <><span className="play-deck-label">Deck</span><span className="play-deck-name">{active.name}</span></>
                        ) : (
                            <button className="play-deck-missing" onClick={props.onDecks}>No active deck: choose one</button>
                        )}
                    </div>
                ) : null}
                <button className="play-button" disabled={open && !ready}
                        title={open && !mode ? "Choose a mode" : open && !active ? "Choose an active deck" : open && !ready ? "Choose an online friend" : undefined}
                        onClick={play}>
                    Play
                </button>
            </div>
        </div>
    )
}
