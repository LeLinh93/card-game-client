import "./Hand.css";
import {useState} from "react";
import type {PointerEvent} from "react";
import {CardView} from "./CardView";
import {GameCard, isKnown} from "../game/protocol";
import type {Side} from "../game/Board3D";

export interface HandCard{
    card:GameCard;
    // Still flying in from the deck: its place is kept, but it shows once the 3D card lands
    arriving:boolean;
}

// How much bigger the hovered card is shown, and how far above the bottom of the screen
const PREVIEW_SCALE = 1.9;
const PREVIEW_MARGIN = 20;

// A hand drawn over the 3D play area: the player's cards face up along the bottom, the opponent's
// backs along the top. Each card is marked with its id so a drawn card can fly to its place.
// heldID: the card being dragged or played, which shows on the board instead.
// Hovering a card of the player's hides it and shows a bigger copy above it, as in Unity: the copy
// takes no mouse events, so the pointer goes straight on to the next card.
// While a skill makes the player pick cards from their hand, "pick" lists the ones they may pick and
// the ones picked; clicking a card picks it or lets it go, and nothing can be dragged.
export function Hand(props:{side:Side, cards:HandCard[], backImage:string, heldID?:string, onCardPointerDown?:(card:GameCard, e:PointerEvent)=>void,
                            pick?:{pickable:string[], picked:string[], onToggle:(card:GameCard)=>void}}){
    const [hovered, setHovered] = useState<{card:GameCard, left:number, width:number}>(null);
    const preview = hovered && hovered.card.id !== props.heldID && props.cards.some(c => c.card.id === hovered.card.id && !c.arriving) ? hovered : null;

    function enter(card:GameCard, e:PointerEvent<HTMLDivElement>){
        if(props.side !== "player" || !isKnown(card)){
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const width = rect.width * PREVIEW_SCALE;
        // Centred over the card, but kept on screen
        const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), window.innerWidth - width - 8);
        setHovered({card, left, width});
    }

    return(
        <div className={"hand hand-" + props.side} data-hand={props.side}>
            {props.cards.map(({card, arriving})=>{
                const hidden = arriving || card.id === props.heldID;
                const pickable = props.pick ? props.pick.pickable.includes(card.id) : false;
                const className = "hand-card" + (hidden ? " arriving" : "") + (preview && preview.card.id === card.id ? " previewed" : "")
                    + (props.pick ? (pickable ? " pickable" : " unpickable") : "") + (props.pick && props.pick.picked.includes(card.id) ? " picked" : "");
                return(
                    <div key={card.id} className={className} data-card-id={card.id}
                         onPointerEnter={(e)=>{enter(card, e)}}
                         onPointerLeave={()=>{setHovered(h => h && h.card.id === card.id ? null : h)}}
                         onPointerDown={props.pick ? (pickable ? ()=>{props.pick.onToggle(card)} : undefined)
                             : props.onCardPointerDown && !arriving ? (e)=>{props.onCardPointerDown(card, e)} : undefined}>
                        {props.side === "player" && isKnown(card)
                            ? <CardView card={card} scale={0.34}/>
                            : <img className="hand-back" src={props.backImage} alt="" draggable={false}/>}
                    </div>
                )
            })}
            {preview ? (
                <div className="hand-preview" style={{left:preview.left, bottom:PREVIEW_MARGIN}} aria-hidden="true">
                    <CardView card={preview.card} scale={preview.width / 400}/>
                </div>
            ) : null}
        </div>
    )
}

// The place a card of this hand is shown at, for the 3D card flying there
export function handCardRect(side:Side, cardID:string):DOMRect{
    const el = document.querySelector('[data-hand="' + side + '"] [data-card-id="' + CSS.escape(cardID) + '"]');
    return el ? el.getBoundingClientRect() : null;
}
