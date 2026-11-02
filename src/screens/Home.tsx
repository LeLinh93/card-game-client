import {useEffect, useState} from "react";
import "./Home.css";
import {Session} from "../App";
import title from "../img/ui/title.png";

type Mode = "free" | "bot" | "friend";

const MODES:{mode:Mode, label:string, about:string}[] = [
    {mode:"free", label:"Free match", about:"Play against another player"},
    {mode:"bot", label:"Bot match", about:"Play against the computer"},
    {mode:"friend", label:"Friend match", about:"Play against a friend"},
];

// The Home page: the first Play opens the play panel to choose a mode. Starting a match comes later.
export function Home(props:{session:Session, onDecks:()=>void}){
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState<Mode>(null);
    const [note, setNote] = useState("");
    const active = props.session.decks.find(d => d._id === props.session.activeDeck);

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
        setNote("");
    }

    function play(){
        if(!open){
            return setOpen(true);
        }
        // Entering a match isn't there yet
        setNote("Matches aren't ready yet.");
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
                                onClick={()=>{setMode(m.mode); setNote("")}}>
                            <span className="play-mode-mark" aria-hidden="true"/>
                            <span className="play-mode-text">
                                <span className="play-mode-name">{m.label}</span>
                                <span className="play-mode-about">{m.about}</span>
                            </span>
                        </button>
                    ))}
                </div>
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
                {note ? <p className="play-note" role="status">{note}</p> : null}
                <button className="play-button" disabled={open && (!mode || !active)}
                        title={open && !mode ? "Choose a mode" : open && !active ? "Choose an active deck" : undefined}
                        onClick={play}>
                    Play
                </button>
            </div>
        </div>
    )
}
