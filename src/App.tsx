import {useState} from "react";
import {api, Card, Deck, Metadata, UnauthorizedError} from "./api";
import {Login} from "./screens/Login";
import {MainMenu} from "./screens/MainMenu";
import {DeckEditor} from "./screens/DeckEditor";

// What the player gets when logging in, plus the card data loaded right after
// (the Unity client's Loading scene, minus the picture download: pictures load from the server)
export interface Session{
    username:string;
    token:string;
    decks:Deck[];
    activeDeck:string;
    cards:Card[];
    meta:Metadata;
}

type Screen = "menu" | "decks";

export function App(){
    const [session, setSession] = useState<Session>(null);
    const [screen, setScreen] = useState<Screen>("menu");
    const [notice, setNotice] = useState("");

    async function login(username:string, password:string){
        let answer = await api.login(username, password);
        let [cards, meta] = await Promise.all([api.cardList(), api.metadata()]);
        setSession({username, token:answer.token, decks:answer.decks || [], activeDeck:answer.activeDeck || "", cards, meta});
        setScreen("menu");
        setNotice("");
    }

    function logout(message = ""){
        setSession(null);
        setNotice(message);
    }

    // Runs a server call; when the login has run out, goes back to the login screen
    async function withToken<T>(call:(token:string)=>Promise<T>):Promise<T>{
        try{
            return await call(session.token);
        }
        catch(e){
            if(e instanceof UnauthorizedError){
                logout("Your login has run out. Please log in again.");
            }
            throw e;
        }
    }

    if(!session){
        return <Login onLogin={login} notice={notice}/>;
    }
    if(screen === "decks"){
        return <DeckEditor session={session} onChange={setSession} withToken={withToken} onBack={()=>{setScreen("menu")}}/>;
    }
    return <MainMenu session={session} onDecks={()=>{setScreen("decks")}} onLogout={()=>{logout()}}/>;
}
