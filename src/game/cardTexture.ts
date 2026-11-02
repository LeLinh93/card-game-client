import {createElement} from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {toCanvas} from "html-to-image";
import {CardFace, CardView} from "../components/CardView";

// The card template's size in px (components/card.css)
export const CARD_WIDTH = 400;
export const CARD_HEIGHT = 710;

const cache = new Map<string, Promise<HTMLCanvasElement>>();

// The card drawn with the same template as the hand (CardView), as a canvas for a 3D texture.
// Each look is drawn once; the stats are part of the key, so a changed card is drawn again.
export function cardCanvas(card:CardFace):Promise<HTMLCanvasElement>{
    const key = JSON.stringify([card.name, card.type, card.imagePath, card.resources, card.attack, card.defense, card.health, card.description, card.header]);
    if(!cache.has(key)){
        const drawing = draw(card);
        // A failed drawing (e.g. the picture didn't load) is tried again next time
        drawing.catch(()=>{cache.delete(key)});
        cache.set(key, drawing);
    }
    return cache.get(key);
}

async function draw(card:CardFace):Promise<HTMLCanvasElement>{
    // Rendered out of sight, at full size, then copied to a canvas
    const holder = document.createElement("div");
    holder.style.cssText = "position:fixed; left:-10000px; top:0; width:" + CARD_WIDTH + "px; height:" + CARD_HEIGHT + "px; pointer-events:none";
    document.body.appendChild(holder);
    const root = createRoot(holder);
    try{
        flushSync(()=>{root.render(createElement(CardView, {card}))});
        await Promise.all(Array.from(holder.querySelectorAll("img")).map(img => img.decode().catch(()=>{})));
        await document.fonts.ready;
        return await toCanvas(holder.firstElementChild as HTMLElement, {width:CARD_WIDTH, height:CARD_HEIGHT, pixelRatio:1, cacheBust:false});
    }
    finally{
        root.unmount();
        holder.remove();
    }
}
