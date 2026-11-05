import {useEffect} from "react";

// The music played on the menus after login, on a loop (public/music)
const MENU_MUSIC = "/music/menu.flac";
const VOLUME = 1;

// The song is decoded into memory once and looped there, so it loops without a gap: the plain
// <audio> loop jumps back in the file and stalls on a big FLAC. Pausing suspends the audio, so it
// picks up where it stopped. Kept on window so a dev-server reload of this file reuses it instead of
// starting a second copy over the first.
interface MenuMusic{
    context:AudioContext;
    ready:Promise<void>;
}
const page = window as unknown as {menuMusic?:MenuMusic};

function menuMusic():MenuMusic{
    if(!page.menuMusic){
        const context = new AudioContext();
        const ready = fetch(MENU_MUSIC)
            .then(answer => answer.arrayBuffer())
            .then(data => context.decodeAudioData(data))
            .then((song)=>{
                const volume = context.createGain();
                volume.gain.value = VOLUME;
                volume.connect(context.destination);
                const source = context.createBufferSource();
                source.buffer = song;
                source.loop = true;
                source.connect(volume);
                source.start();
            });
        ready.catch(e => console.warn("The menu music couldn't load", e));
        page.menuMusic = {context, ready};
    }
    return page.menuMusic;
}

// Plays the menu music while "on" is true and pauses it otherwise.
// If the browser blocks playing before the player has clicked anything, it starts on the next click or key.
export function useMenuMusic(on:boolean){
    useEffect(()=>{
        if(!on){
            return;
        }
        const music = menuMusic();
        let playing = true;
        const start = ()=>{
            if(playing){
                music.context.resume().catch(()=>{});
            }
        };
        start();
        window.addEventListener("pointerdown", start, {once:true});
        window.addEventListener("keydown", start, {once:true});
        return ()=>{
            playing = false;
            window.removeEventListener("pointerdown", start);
            window.removeEventListener("keydown", start);
            music.context.suspend().catch(()=>{});
        };
    }, [on]);
}
