import {FormEvent, useState} from "react";
import "./Login.css";
import title from "../img/ui/title.png";

// The Unity login scene: the title art with a username, a password and a login button
export function Login(props:{onLogin:(username:string, password:string)=>Promise<void>, notice:string}){
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");

    async function submit(e:FormEvent){
        e.preventDefault();
        setBusy(true);
        setError("");
        try{
            await props.onLogin(username.trim(), password);
        }
        catch(err){
            // The server answers a wrong name or password with "Unauthorized"
            setError(err.message === "Unauthorized" ? "Wrong username or password." : "Can't reach the server: " + err.message);
            setBusy(false);
        }
    }

    return(
        <div className="login-page">
            <img className="login-title" src={title} alt="Defender trading card game"/>
            <form className="login-form" onSubmit={submit}>
                {props.notice ? <p className="login-notice">{props.notice}</p> : null}
                <input type="text" placeholder="Username" aria-label="Username" autoComplete="username" autoFocus
                       value={username} onChange={(e)=>{setUsername(e.target.value)}}/>
                <input type="password" placeholder="Password" aria-label="Password" autoComplete="current-password"
                       value={password} onChange={(e)=>{setPassword(e.target.value)}}/>
                <button className="primary" type="submit" disabled={busy || !username.trim() || !password}>
                    {busy ? "Logging in…" : "Login"}
                </button>
                {error ? <p className="error" role="alert">{error}</p> : null}
            </form>
        </div>
    )
}
