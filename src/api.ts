// The card-server endpoints the game uses. Like the Unity client, the requests are sent as form
// data with the login token in the body; the server answers errors with status 500 and a text.

export const endpoint:string = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface Deck{
    _id:string;
    name:string;
    deck:string[];
    backline:string[];
}

export interface Card{
    _id:string;
    name:string;
    type:string;
    resources:number;
    faction:string;
    class?:string;
    hero?:boolean;
    description:string;
    header:string;
    attribute:string[];
    attack?:number;
    defense?:number;
    health?:number;
    imagePath:string;
}

export interface Metadata{
    types:string[];
    factions:string[];
    classes:string[];
    maxDeckSize:number;
    minDeckSize:number;
}

export interface LoginAnswer{
    token:string;
    activeDeck:string;
    decks:Deck[];
}

// Thrown when the server refuses the token (e.g. it ran out after an hour): log in again
export class UnauthorizedError extends Error{}

async function send(path:string, init:RequestInit = {}):Promise<any>{
    const res = await fetch(endpoint + path, init);
    const text = await res.text();
    if(!res.ok){
        if(text === "Unauthorized"){
            throw new UnauthorizedError(text);
        }
        throw new Error(text || path + " failed with " + res.status);
    }
    try{
        return JSON.parse(text);
    }
    catch{
        return text;
    }
}

function post(path:string, fields:Record<string, string>):Promise<any>{
    return send(path, {method:"POST", body:new URLSearchParams(fields)});
}

export function imageUrl(imagePath:string):string{
    return endpoint + "/" + imagePath;
}

export const api = {
    login(username:string, password:string):Promise<LoginAnswer>{
        return post("/loginGame", {username, password});
    },
    metadata():Promise<Metadata>{
        return send("/metadataGame");
    },
    cardList():Promise<Card[]>{
        return send("/cardList");
    },
    createDeck(token:string):Promise<Deck>{
        return post("/createDeck", {token});
    },
    editDeck(token:string, deck:Deck):Promise<Deck>{
        return post("/editDeck", {
            token,
            _id:deck._id,
            name:deck.name,
            deck:JSON.stringify(deck.deck),
            backline:JSON.stringify(deck.backline)
        });
    },
    activeDeck(token:string, deckID:string):Promise<{activeDeck:string}>{
        return post("/activeDeck", {token, _id:deckID});
    }
};
