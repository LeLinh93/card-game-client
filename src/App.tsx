import {lazy, Suspense, useRef, useState} from "react";
import {api, Card, Deck, Metadata, UnauthorizedError} from "./api";
import {Login} from "./screens/Login";
import {Home, Mode} from "./screens/Home";
// The 3D engine is big, so it loads when the first match starts
const Match = lazy(() => import("./screens/Match").then(m => ({default:m.Match})));
import {DeckEditor} from "./screens/DeckEditor";
import {Tab, TopNav} from "./components/TopNav";

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

export function App(){
    const [session, setSession] = useState<Session>(null);
    const [tab, setTab] = useState<Tab>("home");
    const [notice, setNotice] = useState("");
    // The mode of the match being played; the match takes the whole window
    const [match, setMatch] = useState<Mode>(null);
    // Set while a deck has unsaved changes, so the header asks before leaving it
    const unsaved = useRef(false);

    async function login(username:string, password:string){
        let answer = await api.login(username, password);
        let [cards, meta] = await Promise.all([api.cardList(), api.metadata()]);
        setSession({username, token:answer.token, decks:answer.decks || [], activeDeck:answer.activeDeck || "", cards, meta});
        setTab("home");
        setNotice("");
    }

    function logout(message = ""){
        unsaved.current = false;
        setSession(null);
        setNotice(message);
    }

    function canLeave(){
        return !unsaved.current || window.confirm("Leave without saving the changes to this deck?");
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
    if(match){
        return <Suspense><Match mode={match} onLeave={()=>{setMatch(null)}}/></Suspense>;
    }
    return(
        <div className="app-shell">
            <TopNav tab={tab} username={session.username}
                    onTab={(t)=>{if(canLeave()){setTab(t)}}}
                    onLogout={()=>{if(canLeave()){logout()}}}/>
            <main className="app-main">
                {tab === "decks" ? (
                    <DeckEditor session={session} onChange={setSession} withToken={withToken}
                                onUnsaved={(value)=>{unsaved.current = value}}/>
                ) : (
                    <Home session={session} onDecks={()=>{setTab("decks")}} onPlay={setMatch}/>
                )}
            </main>
        </div>
    )
}
