import {useEffect} from "react";
import "./CardPicker.css";
import {CardView} from "./CardView";
import {GameCard} from "../game/protocol";

// The cards in a graveyard, latest first, in a row like a skill's pick. Close, Escape or a click
// beside the box shuts it.
export function GraveyardList(props:{title:string, cards:GameCard[], onClose:()=>void}){
    const cards = props.cards.filter(c => c).reverse();
    const {onClose} = props;

    useEffect(()=>{
        const key = (e:KeyboardEvent)=>{
            if(e.key === "Escape"){
                onClose();
            }
        };
        window.addEventListener("keydown", key);
        return ()=>{window.removeEventListener("keydown", key)};
    }, [onClose]);

    return(
        <div className="picker-backdrop" onClick={onClose}>
            <div className="picker panel" role="dialog" aria-modal="true" aria-label={props.title} onClick={(e)=>{e.stopPropagation()}}>
                <p className="picker-message">{props.title} ({cards.length})</p>
                <div className="picker-row">
                    {cards.map(card => <div key={card.id} className="graveyard-card"><CardView card={card} scale={0.45}/></div>)}
                    {cards.length <= 0 ? <p className="picker-empty">No card has gone to this graveyard yet.</p> : null}
                </div>
                <div className="picker-footer">
                    <button onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    )
}
