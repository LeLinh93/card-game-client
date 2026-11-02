import "./MainMenu.css";
import {Session} from "../App";
import title from "../img/ui/title.png";

// The Unity main menu: play and the deck editor in a side panel. Playing comes later.
export function MainMenu(props:{session:Session, onDecks:()=>void, onLogout:()=>void}){
    const active = props.session.decks.find(d => d._id === props.session.activeDeck);
    return(
        <div className="menu-page">
            <img className="menu-title" src={title} alt="Defender trading card game"/>
            <nav className="menu-panel panel">
                <div className="menu-user">{props.session.username}</div>
                <div className="menu-deck">Active deck: {active ? active.name : "none"}</div>
                <button className="primary" disabled title="Coming soon">Play</button>
                <button onClick={props.onDecks}>Deck editor</button>
                <button onClick={props.onLogout}>Log out</button>
            </nav>
        </div>
    )
}
