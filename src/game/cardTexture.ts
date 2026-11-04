import {createElement} from "react";
import {createRoot} from "react-dom/client";
import {flushSync} from "react-dom";
import {toCanvas} from "html-to-image";
import {CardFace, CardView} from "../components/CardView";
import {imageUrl} from "../api";

// The card template's size in px (components/card.css)
export const CARD_WIDTH = 400;
export const CARD_HEIGHT = 710;
// The side of the square pictures of the cards on the field
const SQUARE_SIZE = 256;

const cache = new Map<string, Promise<HTMLCanvasElement>>();

// Each picture is drawn once; a failed one (e.g. the picture didn't load) is tried again next time
function cached(key:string, draw:()=>Promise<HTMLCanvasElement>):Promise<HTMLCanvasElement>{
    if(!cache.has(key)){
        const drawing = draw();
        drawing.catch(()=>{cache.delete(key)});
        cache.set(key, drawing);
    }
    return cache.get(key);
}

// The card drawn with the same template as the hand (CardView), as a canvas for a 3D texture.
// The stats are part of the key, so a changed card is drawn again.
export function cardCanvas(card:CardFace):Promise<HTMLCanvasElement>{
    const key = JSON.stringify([card.name, card.type, card.imagePath, card.resources, card.attack, card.defense, card.health, card.description, card.header]);
    return cached(key, ()=>draw(card));
}

// A card on the field shows only its picture, cut to a square (the SquareCard model)
export function squareCanvas(imagePath:string):Promise<HTMLCanvasElement>{
    return cached("square:" + imagePath, async ()=>{
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = imageUrl(imagePath);
        await img.decode();
        return squareFrom(img);
    });
}

// A card on the field: its square picture, for a unit or structure with its attack, defense and health
// along the bottom, as they are now, and a red X in the top left corner when its effects are negated
export function fieldSquareCanvas(imagePath:string, stats:{attack:number, defense:number, health:number}, negated = false):Promise<HTMLCanvasElement>{
    return cached("field:" + imagePath + ":" + (stats ? [stats.attack, stats.defense, stats.health].join("/") : "") + (negated ? ":negated" : ""), async ()=>{
        const picture = await squareCanvas(imagePath);
        await document.fonts.ready;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = SQUARE_SIZE;
        const g = canvas.getContext("2d");
        g.drawImage(picture, 0, 0);
        if(negated){
            drawNegated(g);
        }
        if(!stats){
            return canvas;
        }
        const bar = Math.round(SQUARE_SIZE * 0.24);
        g.fillStyle = "rgba(10, 12, 16, 0.78)";
        g.fillRect(0, SQUARE_SIZE - bar, SQUARE_SIZE, bar);
        // Attack, defense, health: each a coloured disc with its value
        const discs:[number, string][] = [[stats.attack, "#d9822b"], [stats.defense, "#3f7fbf"], [stats.health, "#c0392b"]];
        const y = SQUARE_SIZE - bar / 2;
        discs.forEach(([value, color], i)=>{
            const x = SQUARE_SIZE * (i + 0.5) / 3;
            g.fillStyle = color;
            g.beginPath();
            g.arc(x, y, bar * 0.42, 0, Math.PI * 2);
            g.fill();
            g.font = "bold " + Math.round(bar * 0.55) + "px GWENT, Georgia, serif";
            g.textAlign = "center";
            g.textBaseline = "middle";
            g.lineWidth = 5;
            g.strokeStyle = "#000";
            g.fillStyle = "#fff";
            g.strokeText(String(value ?? 0), x, y + 2);
            g.fillText(String(value ?? 0), x, y + 2);
        });
        return canvas;
    });
}

// A red X with a dark edge in the top left corner
function drawNegated(g:CanvasRenderingContext2D){
    const from = SQUARE_SIZE * 0.06, to = SQUARE_SIZE * 0.2;
    g.lineCap = "round";
    [["rgba(0, 0, 0, 0.85)", 14], ["#e0322b", 8]].forEach(([color, width])=>{
        g.strokeStyle = color as string;
        g.lineWidth = width as number;
        g.beginPath();
        g.moveTo(from, from);
        g.lineTo(to, to);
        g.moveTo(to, from);
        g.lineTo(from, to);
        g.stroke();
    });
}

// The middle square of a picture
export function squareFrom(img:CanvasImageSource & {width:number, height:number}):HTMLCanvasElement{
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SQUARE_SIZE;
    const side = Math.min(img.width, img.height);
    canvas.getContext("2d").drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SQUARE_SIZE, SQUARE_SIZE);
    return canvas;
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
