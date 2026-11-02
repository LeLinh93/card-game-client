import "./Hand.css";
import {CardView} from "./CardView";
import {GameCard, isKnown} from "../game/protocol";
import type {Side} from "../game/Board3D";

export interface HandCard{
    card:GameCard;
    // Still flying in from the deck: its place is kept, but it shows once the 3D card lands
    arriving:boolean;
}

// A hand drawn over the 3D play area: the player's cards face up along the bottom, the opponent's
// backs along the top. Each card is marked with its id so a drawn card can fly to its place.
export function Hand(props:{side:Side, cards:HandCard[], backImage:string}){
    return(
        <div className={"hand hand-" + props.side} data-hand={props.side}>
            {props.cards.map(({card, arriving})=>(
                <div key={card.id} className={arriving ? "hand-card arriving" : "hand-card"} data-card-id={card.id}>
                    {props.side === "player" && isKnown(card)
                        ? <CardView card={card} scale={0.4}/>
                        : <img className="hand-back" src={props.backImage} alt="" draggable={false}/>}
                </div>
            ))}
        </div>
    )
}

// The place a card of this hand is shown at, for the 3D card flying there
export function handCardRect(side:Side, cardID:string):DOMRect{
    const el = document.querySelector('[data-hand="' + side + '"] [data-card-id="' + CSS.escape(cardID) + '"]');
    return el ? el.getBoundingClientRect() : null;
}
