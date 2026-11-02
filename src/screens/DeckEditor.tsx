import {useEffect, useMemo, useState} from "react";
import "./DeckEditor.css";
import {api, Card, Deck} from "../api";
import {Session} from "../App";
import {CardView} from "../components/CardView";
import {addToBacklineProblem, addToDeckProblem, BACKLINE_SIZE, byCostThenName, copies, deckProblems, fitsBackline, isToken, MAX_COPIES} from "../deckRules";
import addIcon from "../img/ui/add.png";
import unitBar from "../img/deck/unit.png";
import spellBar from "../img/deck/spell.png";
import structureBar from "../img/deck/structure.png";
import trapBar from "../img/deck/trap.png";
import equipBar from "../img/deck/equip.png";
import abilityBar from "../img/deck/ability.png";

const BARS:Record<string, string> = {unit:unitBar, spell:spellBar, structure:structureBar, trap:trapBar, equip:equipBar, ability:abilityBar};

interface Props{
    session:Session;
    onChange:(session:Session)=>void;
    withToken:<T>(call:(token:string)=>Promise<T>)=>Promise<T>;
    // Told whether the deck being edited has unsaved changes, so the header can ask before leaving
    onUnsaved:(unsaved:boolean)=>void;
}

// The Unity deck editor: first the list of the player's decks, then one deck being edited
export function DeckEditor(props:Props){
    const [editing, setEditing] = useState<Deck>(null);
    if(editing){
        return <EditDeck {...props} deck={editing} onClose={()=>{setEditing(null)}}/>;
    }
    return <DeckList {...props} onOpen={setEditing}/>;
}

//deck list-----------------------------------------------------------------------------------

function DeckList(props:Props & {onOpen:(deck:Deck)=>void}){
    const {session} = props;
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function run(call:()=>Promise<void>){
        setBusy(true);
        setError("");
        try{
            await call();
        }
        catch(e){
            setError(e.message);
        }
        setBusy(false);
    }

    function create(){
        return run(async ()=>{
            let deck = await props.withToken(token => api.createDeck(token));
            props.onChange({...session, decks:session.decks.concat([deck])});
            props.onOpen(deck);
        });
    }

    function activate(deck:Deck){
        return run(async ()=>{
            let answer = await props.withToken(token => api.activeDeck(token, deck._id));
            props.onChange({...session, activeDeck:answer.activeDeck});
        });
    }

    return(
        <div className="decks-page">
            <header className="decks-header">
                <h1>Decks</h1>
            </header>
            {error ? <p className="error decks-error" role="alert">{error}</p> : null}
            <div className="deck-grid">
                {session.decks.map((deck)=>{
                    let active = deck._id === session.activeDeck;
                    let problems = deckProblems(deck, session.meta);
                    return(
                        <div key={deck._id} className={active ? "deck-tile is-active" : "deck-tile"}>
                            <button className="deck-open" onClick={()=>{props.onOpen(deck)}}>
                                <span className="deck-name">{deck.name}</span>
                                <span className={problems.length > 0 ? "deck-size not-ready" : "deck-size"} title={problems.join(" ")}>
                                    {deck.deck.length} cards · {deck.backline.length}/{BACKLINE_SIZE} backline
                                </span>
                            </button>
                            {active ? <span className="deck-active">Active</span> : (
                                <button className="deck-activate" disabled={busy || problems.length > 0}
                                        title={problems.join(" ") || "Play with this deck"} onClick={()=>{activate(deck)}}>
                                    Set active
                                </button>
                            )}
                        </div>
                    )
                })}
                <button className="deck-tile deck-add" disabled={busy} onClick={create} aria-label="New deck">
                    <img src={addIcon} alt=""/>
                    <span>New deck</span>
                </button>
            </div>
        </div>
    )
}

//one deck------------------------------------------------------------------------------------

interface Filters{
    type:string;
    faction:string;
    class:string;
    name:string;
    min:string;
    max:string;
}

const NO_FILTER:Filters = {type:"", faction:"", class:"", name:"", min:"", max:""};

function matches(card:Card, f:Filters):boolean{
    return (!f.type || card.type === f.type)
        && (!f.faction || card.faction === f.faction)
        && (!f.class || card.class === f.class)
        && (!f.name || card.name.toLowerCase().includes(f.name.toLowerCase()))
        && (f.min === "" || card.resources >= parseInt(f.min, 10))
        && (f.max === "" || card.resources <= parseInt(f.max, 10));
}

function EditDeck(props:Props & {deck:Deck, onClose:()=>void}){
    const {session} = props;
    const meta = session.meta;
    const [draft, setDraft] = useState<Deck>(props.deck);
    const [filters, setFilters] = useState<Filters>(NO_FILTER);
    const [showBackline, setShowBackline] = useState(true);
    const [preview, setPreview] = useState<Card>(null);
    const [message, setMessage] = useState({text:"", error:false});
    const [busy, setBusy] = useState(false);

    const cardsByID = useMemo(()=>new Map(session.cards.map(c => [c._id, c])), [session.cards]);
    const shown = session.cards.filter(c => matches(c, filters));
    const saved = session.decks.find(d => d._id === draft._id) || props.deck;
    const changed = JSON.stringify(saved) !== JSON.stringify(draft);
    const {onUnsaved} = props;
    useEffect(()=>{
        onUnsaved(changed);
        return ()=>{onUnsaved(false)};
    }, [changed, onUnsaved]);

    const say = (text:string, error = false)=>{setMessage({text, error})};
    const setFilter = (key:keyof Filters, value:string)=>{setFilters({...filters, [key]:value})};

    // Unity: left click puts the card in the deck, right click in the backline
    function add(card:Card, where:"deck" | "backline"){
        let problem = where === "deck" ? addToDeckProblem(draft, card, meta) : addToBacklineProblem(draft, card);
        if(problem){
            return say(problem, true);
        }
        setDraft({...draft, [where]:draft[where].concat([card._id])});
        say("");
    }

    function remove(cardID:string, where:"deck" | "backline"){
        let list = draft[where].slice();
        list.splice(list.indexOf(cardID), 1);
        setDraft({...draft, [where]:list});
        say("");
    }

    async function save(){
        setBusy(true);
        try{
            let deck = await props.withToken(token => api.editDeck(token, {...draft, name:draft.name.trim() || "new deck"}));
            setDraft(deck);
            props.onChange({...session, decks:session.decks.map(d => d._id === deck._id ? deck : d)});
            say("Saved.");
        }
        catch(e){
            say("Couldn't save: " + e.message, true);
        }
        setBusy(false);
    }

    function close(){
        if(changed && !window.confirm("Leave without saving the changes to this deck?")){
            return;
        }
        props.onClose();
    }

    // The deck as rows of "cost, name, copies", sorted by cost then name; the backline one row per card
    const deckRows = groupRows(draft.deck, cardsByID);
    const backlineRows = draft.backline.map(id => ({id, card:cardsByID.get(id), amount:1}));
    const problems = deckProblems(draft, meta);

    return(
        <div className="editor-page">
            <section className="editor-cards">
                <div className="filter-bar">
                    <input type="text" placeholder="Search..." aria-label="Search by name" value={filters.name}
                           onChange={(e)=>{setFilter("name", e.target.value)}}/>
                    <FilterSelect label="types" value={filters.type} options={meta.types} onChange={(v)=>{setFilter("type", v)}}/>
                    <FilterSelect label="factions" value={filters.faction} options={meta.factions} onChange={(v)=>{setFilter("faction", v)}}/>
                    <FilterSelect label="classes" value={filters.class} options={meta.classes} onChange={(v)=>{setFilter("class", v)}}/>
                    <span className="cost-range">
                        Cost
                        <input type="number" min={0} placeholder="min" aria-label="Cost min" value={filters.min} onChange={(e)=>{setFilter("min", e.target.value)}}/>
                        –
                        <input type="number" min={0} placeholder="max" aria-label="Cost max" value={filters.max} onChange={(e)=>{setFilter("max", e.target.value)}}/>
                    </span>
                    {JSON.stringify(filters) !== JSON.stringify(NO_FILTER) ? <button onClick={()=>{setFilters(NO_FILTER)}}>Reset</button> : null}
                    <span className="filter-hint">Click: add to deck · Right click: add to backline</span>
                </div>
                <div className="card-grid">
                    {shown.map((card)=>{
                        let count = copies(draft, card._id);
                        let token = isToken(card);
                        return(
                            <div key={card._id} className={token ? "card-tile is-token" : "card-tile"}
                                 title={token ? "Tokens can't be put in a deck" : fitsBackline(card) ? "Click: deck · Right click: backline" : "Click: add to deck"}
                                 onClick={()=>{add(card, "deck")}}
                                 onContextMenu={(e)=>{e.preventDefault(); add(card, "backline")}}>
                                <CardView card={card} scale={0.5}/>
                                {count > 0 ? <span className="card-count">{count}/{MAX_COPIES}</span> : null}
                            </div>
                        )
                    })}
                    {shown.length === 0 ? <p className="card-empty">No cards match the filter.</p> : null}
                </div>
            </section>

            <aside className="editor-panel panel">
                <input className="deck-name-input" type="text" aria-label="Deck name" maxLength={40}
                       value={draft.name} onChange={(e)=>{setDraft({...draft, name:e.target.value})}}/>

                <div className="deck-section-title">
                    <span>Deck</span>
                    <span className={draft.deck.length < meta.minDeckSize ? "count low" : "count"}>{draft.deck.length}/{meta.maxDeckSize}</span>
                </div>
                <div className="deck-rows">
                    {deckRows.map(row => <DeckRow key={row.id} row={row} onRemove={()=>{remove(row.id, "deck")}} onPreview={setPreview}/>)}
                    {deckRows.length === 0 ? <p className="rows-empty">Click cards to add them.</p> : null}
                </div>

                <button className="deck-section-title backline-toggle" aria-expanded={showBackline} onClick={()=>{setShowBackline(!showBackline)}}>
                    <span>{showBackline ? "▾" : "▸"} Backline</span>
                    <span className={draft.backline.length !== BACKLINE_SIZE ? "count low" : "count"}>{draft.backline.length}/{BACKLINE_SIZE}</span>
                </button>
                {showBackline ? (
                    <div className="deck-rows backline-rows">
                        {backlineRows.map((row, i) => <DeckRow key={i} row={row} onRemove={()=>{remove(row.id, "backline")}} onPreview={setPreview}/>)}
                        {backlineRows.length === 0 ? <p className="rows-empty">Right click traps or structures to add them.</p> : null}
                    </div>
                ) : null}

                <div className="editor-footer">
                    {problems.length > 0 ? <p className="deck-problems">{problems.join(" ")}</p> : null}
                    {message.text ? <p className={message.error ? "error" : "saved"} role="status">{message.text}</p> : null}
                    <div className="editor-buttons">
                        <button onClick={close}>Back</button>
                        <button className="primary" disabled={busy || !changed} onClick={save}>{busy ? "Saving…" : "Save"}</button>
                    </div>
                </div>
            </aside>

            {preview ? <div className="row-preview"><CardView card={preview} scale={0.6}/></div> : null}
        </div>
    )
}

interface Row{
    id:string;
    card:Card;
    amount:number;
}

function groupRows(ids:string[], cardsByID:Map<string, Card>):Row[]{
    let rows:Row[] = [];
    ids.forEach((id)=>{
        let row = rows.find(r => r.id === id);
        if(row){
            row.amount++;
        }
        else{
            rows.push({id, card:cardsByID.get(id), amount:1});
        }
    })
    // Cards that no longer exist on the server go last
    return rows.sort((a, b) => !a.card ? 1 : !b.card ? -1 : byCostThenName(a.card, b.card));
}

// One line of the deck list (the Unity deckcard prefab): cost on the flag, name, copies in the circle
function DeckRow(props:{row:Row, onRemove:()=>void, onPreview:(card:Card)=>void}){
    const card = props.row.card;
    return(
        <button className="deck-row" style={{backgroundImage:"url(" + (card ? BARS[card.type] || spellBar : spellBar) + ")"}}
                title="Click to take one out" onClick={()=>{props.onPreview(null); props.onRemove()}}
                onMouseEnter={()=>{props.onPreview(card || null)}} onMouseLeave={()=>{props.onPreview(null)}}
                onFocus={()=>{props.onPreview(card || null)}} onBlur={()=>{props.onPreview(null)}}>
            <span className="row-cost">{card ? card.resources : "?"}</span>
            <span className="row-name">{card ? card.name : "Unknown card"}</span>
            <span className="row-amount">{props.row.amount}</span>
        </button>
    )
}

function FilterSelect(props:{label:string, value:string, options:string[], onChange:(v:string)=>void}){
    return(
        <select className={props.value ? "filter-select on" : "filter-select"} aria-label={props.label}
                value={props.value} onChange={(e)=>{props.onChange(e.target.value)}}>
            <option value="">{"All " + props.label}</option>
            {(props.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    )
}
