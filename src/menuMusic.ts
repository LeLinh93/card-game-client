import {useEffect} from "react";

// The music played on the menus after login, on a loop (public/music)
const MENU_MUSIC = "/music/menu.flac";
const VOLUME = 0.5;

let audio:HTMLAudioElement = null;

// Plays the menu music while "on" is true and pauses it otherwise; it picks up where it stopped.
// If the browser blocks playing before the player has clicked anything, it starts on the next click or key.
export function useMenuMusic(on:boolean){
    useEffect(()=>{
        if(!on){
            return;
        }
        if(!audio){
            audio = new Audio(MENU_MUSIC);
            audio.loop = true;
            audio.volume = VOLUME;
        }
        const start = ()=>{
            audio.play().catch(()=>{});
        };
        start();
        window.addEventListener("pointerdown", start, {once:true});
        window.addEventListener("keydown", start, {once:true});
        return ()=>{
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("keydown", start);
            audio.pause();
        };
    }, [on]);
}
