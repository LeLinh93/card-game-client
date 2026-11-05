import {lazy, Suspense, useEffect, useRef, useState} from "react";
import {api, Card, Deck, Metadata, UnauthorizedError} from "./api";
import {Login} from "./screens/Login";
import {Home, Mode} from "./screens/Home";
import {Friends} from "./screens/Friends";
import {InviteDialog} from "./components/InviteDialog";
import {Friend, FriendLists, Lobby} from "./game/lobby";
// The 3D engine is big, so it loads when the first match starts
const Match = lazy(() => import("./screens/Match").then(m => ({default:m.Match})));
import {DeckEditor} from "./screens/DeckEditor";
import {Tab, TopNav} from "./components/TopNav";
import {useMenuMusic} from "./menuMusic";

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
    // The match being played (with the friend, in a friend match); the match takes the whole window
    const [match, setMatch] = useState<{mode:Mode, friend?:{id:string, name:string}}>(null);
    // The lobby connection while logged in: friends, requests and match invites
    const lobby = useRef<Lobby>(null);
    const [friends, setFriends] = useState<FriendLists>(null);
    // The server's answer to the last friend action, shown on the Friends page
    const [friendNotice, setFriendNotice] = useState<{ok:boolean, message:string}>(null);
    // A friend's match invite waiting for an answer, the player's own invite waiting for the friend's,
    // and what became of an invite (declined, couldn't be sent...)
    const [invite, setInvite] = useState<{id:string, name:string}>(null);
    const [inviting, setInvitingState] = useState<{id:string, name:string}>(null);
    const invitingNow = useRef<{id:string, name:string}>(null);
    const setInviting = (value:{id:string, name:string})=>{
        invitingNow.current = value;
        setInvitingState(value);
    };
    const [inviteNote, setInviteNote] = useState("");
    // Whether the last friend action was an invite, so its answer shows with the invites
    const invited = useRef(false);
    // Set while a deck has unsaved changes, so the header asks before leaving it
    const unsaved = useRef(false);
    // The menu music plays after login, but not during a match
    useMenuMusic(!!session && !match);

    async function login(username:string, password:string){
        let answer = await api.login(username, password);
        let [cards, meta] = await Promise.all([api.cardList(), api.metadata()]);
        setSession({username, token:answer.token, decks:answer.decks || [], activeDeck:answer.activeDeck || "", cards, meta});
        setTab("home");
        setNotice("");
    }

    // The lobby connects with the login and closes with the logout
    useEffect(()=>{
        if(!session){
            return;
        }
        const l = new Lobby(session.token);
        lobby.current = l;
        l.on("friends", (msg:FriendLists)=>{setFriends(msg)});
        l.on("friendNotice", (msg:{ok:boolean, message:string})=>{
            if(invited.current){
                invited.current = false;
                setInviting(null);
                setInviteNote(msg.message);
            }
            else{
                setFriendNotice(msg);
            }
        });
        l.on("matchInvite", (msg)=>{setInvite(msg)});
        l.on("inviteCancelled", (msg)=>{setInvite(i => i && i.id === msg.id ? null : i)});
        l.on("inviteSent", (msg)=>{
            invited.current = false;
            setInviting(msg);
        });
        l.on("inviteAnswer", (msg)=>{
            const waiting = invitingNow.current;
            if(waiting && waiting.id === msg.id){
                setInviting(null);
                setInviteNote(msg.name ? msg.name + " declined the match." : waiting.name + " went offline.");
            }
        });
        // Both agreed: the match opens, and asks the server for the game with this friend
        l.on("friendMatchStart", (msg:{id:string, name:string})=>{
            unsaved.current = false;
            setInvite(null);
            setInviting(null);
            setInviteNote("");
            setMatch({mode:"friend", friend:msg});
        });
        return ()=>{
            l.close();
            lobby.current = null;
            setFriends(null);
            setFriendNotice(null);
            setInvite(null);
            setInviting(null);
            setInviteNote("");
        };
    }, [session ? session.token : null]);

    function logout(message = ""){
        unsaved.current = false;
        setSession(null);
        setNotice(message);
    }

    function play(mode:Mode, friend?:Friend){
        if(mode !== "friend"){
            return setMatch({mode});
        }
        invited.current = true;
        setInviteNote("");
        lobby.current.inviteFriend(friend.id);
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
        return <Suspense><Match mode={match.mode} friend={match.friend} token={session.token} onLeave={()=>{setMatch(null)}}/></Suspense>;
    }
    const requests = friends ? friends.requests.length : 0;
    return(
        <div className="app-shell">
            <TopNav tab={tab} username={session.username}
                    alerts={requests > 0 ? {friends:requests === 1 ? "1 friend request" : requests + " friend requests"} : undefined}
                    onTab={(t)=>{if(canLeave()){setTab(t)}}}
                    onLogout={()=>{if(canLeave()){logout()}}}/>
            <main className="app-main">
                {tab === "decks" ? (
                    <DeckEditor session={session} onChange={setSession} withToken={withToken}
                                onUnsaved={(value)=>{unsaved.current = value}}/>
                ) : tab === "friends" ? (
                    <Friends lists={friends} notice={friendNotice}
                             onAdd={(name)=>{setFriendNotice(null); lobby.current.addFriend(name)}}
                             onAccept={(id)=>{lobby.current.acceptFriend(id)}}
                             onDecline={(id)=>{lobby.current.declineFriend(id)}}/>
                ) : (
                    <Home session={session} friends={friends ? friends.friends : null}
                          onDecks={()=>{setTab("decks")}} onFriends={()=>{setTab("friends")}} onPlay={play}/>
                )}
            </main>
            <InviteDialog invite={invite} inviting={inviting} note={inviteNote}
                          onAnswer={(accept)=>{lobby.current.answerInvite(invite.id, accept); setInvite(null)}}
                          onCancel={()=>{lobby.current.cancelInvite(); setInviting(null)}}
                          onClose={()=>{setInviteNote("")}}/>
        </div>
    )
}
