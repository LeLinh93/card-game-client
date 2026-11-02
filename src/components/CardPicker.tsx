import "./CardPicker.css";
import {CardView} from "./CardView";
import {GameCard} from "../game/protocol";

// A skill's card pick from a place that isn't on screen (the deck, the graveyard...): the cards in a
// row that scrolls from left to right. Clicking a card picks it, clicking it again lets it go.
export function CardPicker(props:{message:string, cards:GameCard[], picked:string[], amount:number, onToggle:(card:GameCard)=>void, onConfirm:()=>void}){
    const ready = props.picked.length === Math.min(props.amount, props.cards.length);
    return(
        <div className="picker-backdrop">
            <div className="picker panel" role="dialog" aria-modal="true" aria-label={props.message}>
                <p className="picker-message">{props.message}</p>
                <div className="picker-row">
                    {props.cards.map((card)=>{
                        const picked = props.picked.includes(card.id);
                        return(
                            <button key={card.id} className={picked ? "picker-card picked" : "picker-card"} aria-pressed={picked}
                                    onClick={()=>{props.onToggle(card)}}>
                                <CardView card={card} scale={0.45}/>
                            </button>
                        )
                    })}
                    {props.cards.length <= 0 ? <p className="picker-empty">There is no card to pick.</p> : null}
                </div>
                <div className="picker-footer">
                    <button className="primary" disabled={!ready} onClick={props.onConfirm}>
                        Confirm ({props.picked.length}/{Math.min(props.amount, props.cards.length)})
                    </button>
                </div>
            </div>
        </div>
    )
}
