import {FormEvent, useState} from "react";
import "./Friends.css";
import {FriendLists} from "../game/lobby";

// The Friends page: add a friend by their exact name, answer the friend requests, and the friends
// with who is online. The lists come from the lobby connection (App), which also sends the actions.
export function Friends(props:{lists:FriendLists, notice:{ok:boolean, message:string},
                                onAdd:(name:string)=>void, onAccept:(id:string)=>void, onDecline:(id:string)=>void}){
    const [name, setName] = useState("");
    const lists = props.lists;

    function add(e:FormEvent){
        e.preventDefault();
        if(name.trim()){
            props.onAdd(name.trim());
            setName("");
        }
    }

    const online = lists ? lists.friends.filter(f => f.online).length : 0;
    return(
        <div className="friends-page menu-backdrop">
            <section className="friends-box panel">
                <h2>Add a friend</h2>
                <form className="friends-add" onSubmit={add}>
                    <input type="text" placeholder="The player's exact name" aria-label="Player name" value={name}
                           maxLength={60} onChange={(e)=>{setName(e.target.value)}}/>
                    <button className="primary" type="submit" disabled={!name.trim()}>Send request</button>
                </form>
                {props.notice ? <p className={props.notice.ok ? "friends-notice" : "friends-notice error"} role="status">{props.notice.message}</p> : null}
            </section>

            {lists && lists.requests.length > 0 ? (
                <section className="friends-box panel">
                    <h2>Friend requests <span className="friends-count">{lists.requests.length}</span></h2>
                    <ul className="friends-list">
                        {lists.requests.map(r => (
                            <li key={r.id} className="friends-row">
                                <span className="friends-name">{r.name}</span>
                                <span className="friends-actions">
                                    <button className="primary" onClick={()=>{props.onAccept(r.id)}}>Accept</button>
                                    <button onClick={()=>{props.onDecline(r.id)}}>Delete</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            ) : null}

            <section className="friends-box panel">
                <h2>Friends {lists ? <span className="friends-count">{online} online</span> : null}</h2>
                {!lists ? <p className="friends-empty">Loading…</p> : lists.friends.length <= 0 ? (
                    <p className="friends-empty">No friends yet. Add one by their name above.</p>
                ) : (
                    <ul className="friends-list">
                        {lists.friends.map(f => (
                            <li key={f.id} className={f.online ? "friends-row online" : "friends-row"}>
                                <span className="friends-dot" aria-hidden="true"/>
                                <span className="friends-name">{f.name}</span>
                                <span className="friends-status">{f.online ? "Online" : "Offline"}</span>
                            </li>
                        ))}
                    </ul>
                )}
                {lists && lists.sent.length > 0 ? (
                    <>
                        <h3>Waiting for an answer</h3>
                        <ul className="friends-list">
                            {lists.sent.map(s => (
                                <li key={s.id} className="friends-row">
                                    <span className="friends-name">{s.name}</span>
                                    <span className="friends-status">Request sent</span>
                                </li>
                            ))}
                        </ul>
                    </>
                ) : null}
            </section>
        </div>
    )
}
