import {useEffect} from "react";

// The music played on the menus after login, on a loop (public/music)
const MENU_MUSIC = "/music/menu.flac";
const VOLUME = 1;

// One player for the whole page, kept on window so a dev-server reload of this file reuses it
// instead of starting a second copy over the first
const page = window as unknown as {menuMusic?:HTMLAudioElement};

// Plays the menu music while "on" is true and pauses it otherwise; it picks up where it stopped.
// If the browser blocks playing before the player has clicked anything, it starts on the next click or key.
export function useMenuMusic(on:boolean){
    useEffect(()=>{
        if(!on){
            return;
        }
        if(!page.menuMusic){
            page.menuMusic = new Audio(MENU_MUSIC);
            page.menuMusic.loop = true;
        }
        const audio = page.menuMusic;
        audio.volume = VOLUME;
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
