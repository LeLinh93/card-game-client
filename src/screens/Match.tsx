import {useEffect, useRef, useState} from "react";
import "./Match.css";
import {Engine3D} from "../game/Engine3D";
import {Mode} from "./Home";

// The match: the 3D play area fills the window. Playing the match comes later.
export function Match(props:{mode:Mode, onLeave:()=>void}){
    const mount = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "failed">("loading");

    useEffect(()=>{
        const engine = new Engine3D();
        engine.initialize(mount.current).then(
            ()=>{setStatus("ready")},
            (e)=>{console.log(e); setStatus("failed")}
        );
        return ()=>{engine.stop()};
    }, []);

    return(
        <div className="match-page" data-mode={props.mode}>
            <div className="match-scene" ref={mount}/>
            {status !== "ready" ? (
                <div className="match-status" role="status">
                    {status === "loading" ? "Loading the play area…" : <span className="error">The play area couldn't be loaded.</span>}
                </div>
            ) : null}
            <button className="match-leave" onClick={props.onLeave}>Leave</button>
        </div>
    )
}
