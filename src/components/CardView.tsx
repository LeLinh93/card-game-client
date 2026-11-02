import "./card.css";
import {Card, imageUrl} from "../api";
import unit from "../img/frame/unit.png";
import spell from "../img/frame/spell.png";
import structure from "../img/frame/structure.png";
import trap from "../img/frame/trap.png";
import equip from "../img/frame/equip.png";
import ability from "../img/frame/ability.png";

const FRAMES:Record<string, string> = {unit, spell, structure, trap, equip, ability};

// Card types with attack, defense and health
export const HAS_STATS = ["unit", "structure", "equip"];

// The attribute line and each skill on its own line, spaced apart (as on card-website)
function CardDescription(props:{text:string}){
    const lines = (props.text || "").split("\n").filter(l => l.trim() !== "");
    return(
        <span className="card-description">
            {lines.map((l, i) => <span key={i} className="card-description-line">{l}</span>)}
        </span>
    )
}

// What the template shows; a card from the card list or one in a match
export type CardFace = Pick<Card, "name" | "type" | "resources" | "description" | "header" | "attack" | "defense" | "health" | "imagePath">;

// A card drawn on the card-website template. It is 400px wide; shrink it with the "scale" prop.
export function CardView(props:{card:CardFace, scale?:number}){
    const card = props.card;
    const stats = HAS_STATS.includes(card.type);
    return(
        <div className="card-scale" style={{zoom:props.scale || 1}}>
            <div className="card-rep-holder">
                <img className="card-rep" src={FRAMES[card.type] || spell} alt=""/>
                <img className="card-image" src={imageUrl(card.imagePath)} alt=""/>
                <span className="card-name">{card.name}</span>
                <span className="card-header">{card.header}</span>
                <CardDescription text={card.description}/>
                <span className="card-resources">{card.resources}</span>
                {stats ? <span className="card-attack">{card.attack}</span> : null}
                {stats ? <span className="card-defense">{card.defense}</span> : null}
                {stats ? <span className="card-health">{card.health}</span> : null}
            </div>
        </div>
    )
}
