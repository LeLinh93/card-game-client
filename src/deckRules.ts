import {Card, Deck, Metadata} from "./api";

// From the Unity client's Config.cs; the server checks the same when a deck is saved or set active
export const MAX_COPIES = 3;
export const BACKLINE_SIZE = 5;

function copiesProblem(card:Card):string{
    return "At most " + MAX_COPIES + " copies of " + card.name + ".";
}

export function isToken(card:Card):boolean{
    return (card.attribute || []).includes("token");
}

// Only traps and structures can start the game face down in the backline
export function fitsBackline(card:Card):boolean{
    return card.type === "trap" || card.type === "structure";
}

// Copies of a card in the deck and backline together
export function copies(deck:Deck, cardID:string):number{
    return deck.deck.filter(e => e === cardID).length + deck.backline.filter(e => e === cardID).length;
}

// Why the card can't be added, or "" when it can
export function addToDeckProblem(deck:Deck, card:Card, meta:Metadata):string{
    if(isToken(card)){
        return "Tokens can't be put in a deck.";
    }
    if(deck.deck.length >= meta.maxDeckSize){
        return "The deck is full (" + meta.maxDeckSize + " cards).";
    }
    if(copies(deck, card._id) >= MAX_COPIES){
        return copiesProblem(card);
    }
    return "";
}

export function addToBacklineProblem(deck:Deck, card:Card):string{
    if(!fitsBackline(card)){
        return "Only traps and structures go in the backline.";
    }
    if(deck.backline.length >= BACKLINE_SIZE){
        return "The backline is full (" + BACKLINE_SIZE + " cards).";
    }
    if(copies(deck, card._id) >= MAX_COPIES){
        return copiesProblem(card);
    }
    return "";
}

// What still keeps the deck from being played (the server only lets these decks be set active).
// With the card list, too many copies are found as well.
export function deckProblems(deck:Deck, meta:Metadata, cards:Card[] = []):string[]{
    let problems = [];
    let byID = new Map(cards.map(c => [c._id, c]));
    new Set(deck.deck.concat(deck.backline)).forEach((id)=>{
        let card = byID.get(id);
        if(card && copies(deck, id) > MAX_COPIES){
            problems.push(copiesProblem(card));
        }
    });
    if(deck.deck.length < meta.minDeckSize){
        problems.push("Needs at least " + meta.minDeckSize + " cards in the deck (" + deck.deck.length + " now).");
    }
    if(deck.deck.length > meta.maxDeckSize){
        problems.push("At most " + meta.maxDeckSize + " cards in the deck.");
    }
    if(deck.backline.length !== BACKLINE_SIZE){
        problems.push("Needs exactly " + BACKLINE_SIZE + " backline cards (" + deck.backline.length + " now).");
    }
    return problems;
}

// Deck list order of the Unity client: by cost, then by name
export function byCostThenName(a:Card, b:Card):number{
    return a.resources - b.resources || a.name.localeCompare(b.name);
}
