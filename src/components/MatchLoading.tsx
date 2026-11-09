import {useEffect, useState} from "react";
import "./MatchLoading.css";

// The pictures shown while a match loads (public/image/loadingGame), one after another
const PICTURES = [
    "/image/loadingGame/menu_clash_FINAL.png",
    "/image/loadingGame/menu_ridge2_facefix.png",
    "/image/loadingGame/menu_versus_FINAL.png",
];
const PICTURE_SECONDS = 2.5;

const TIPS = [
    "You can activate your face-down structure card during your turn",
    "Activate effect has the same summoning sickness as attack",
    "Killing a Hero enemy earn you 2 resources instead of 1",
    "Unit with Range won't take counter damage when attack",
];
const TIP_SECONDS = 5;

// How long the screen takes to fade away once the match starts (see Match)
export const LOADING_FADE = 500;

// The screen over a match until it starts: the loading pictures fading from one to the next, a
// spinner, what is happening now ("status", e.g. looking for an opponent) and a game tip.
// "leaving" fades it out.
export function MatchLoading(props:{status?:string, leaving?:boolean}){
    const [picture, setPicture] = useState(0);
    const [tip, setTip] = useState(()=>Math.floor(Math.random() * TIPS.length));

    useEffect(()=>{
        // Load every picture now so each one is ready when its turn comes
        PICTURES.forEach((src)=>{new Image().src = src});
        const pictures = window.setInterval(()=>{setPicture(p => (p + 1) % PICTURES.length)}, PICTURE_SECONDS * 1000);
        const tips = window.setInterval(()=>{setTip(t => (t + 1) % TIPS.length)}, TIP_SECONDS * 1000);
        return ()=>{
            window.clearInterval(pictures);
            window.clearInterval(tips);
        };
    }, []);

    return(
        <div className={props.leaving ? "match-loading leaving" : "match-loading"} role="status" aria-live="polite"
             style={{transitionDuration:LOADING_FADE + "ms"}}>
            {PICTURES.map((src, i) => (
                <img key={src} className={i === picture ? "match-loading-picture shown" : "match-loading-picture"} src={src} alt=""/>
            ))}
            <div className="match-loading-shade"/>
            <div className="match-loading-bar">
                <span className="match-loading-spinner" aria-hidden="true"/>
                <div className="match-loading-text">
                    {props.status ? <span className="match-loading-status">{props.status}</span> : null}
                    <span key={tip} className="match-loading-tip"><b>Tip:</b> {TIPS[tip]}</span>
                </div>
            </div>
        </div>
    )
}
