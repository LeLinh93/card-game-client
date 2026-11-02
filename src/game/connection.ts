import {io, Socket} from "socket.io-client";
import {endpoint} from "../api";
import type {Mode} from "../screens/Home";

// The match's socket.io connection to card-server: log in with the token, ask for a match, then send
// and receive the game messages. One connection per match; closing it ends a bot match on the server.
export class Connection{
    private socket:Socket;
    private gameID:string = null;

    constructor(){
        this.socket = io(endpoint, {autoConnect:false, transports:["websocket", "polling"]});
    }

    on(event:string, listener:(data:any)=>void){
        this.socket.on(event, listener);
    }

    // Connects and logs in; resolves once the server accepted the token
    login(token:string):Promise<void>{
        return new Promise((resolve, reject)=>{
            this.socket.once("login", (msg)=>{
                msg && msg.status === "success" ? resolve() : reject(new Error("Your login has run out. Please log in again."));
            });
            this.socket.once("connect_error", ()=>{reject(new Error("Couldn't reach the game server."))});
            this.socket.once("connect", ()=>{this.socket.emit("login", {token})});
            this.socket.connect();
        });
    }

    // Asks for a match; resolves with the game id once the server made one (gameReady)
    findMatch(mode:Mode):Promise<string>{
        return new Promise((resolve, reject)=>{
            this.socket.once("gameReady", (msg)=>{
                this.gameID = msg.status;
                resolve(this.gameID);
            });
            this.socket.once("queueInvalid", (msg)=>{reject(new Error(msg.status))});
            if(mode === "bot"){
                this.socket.emit("botMatch", {});
            }
            else if(mode === "free"){
                this.socket.emit("rankQueue", {});
            }
            else{
                reject(new Error("Friend matches aren't ready yet."));
            }
        });
    }

    // A game action, e.g. {type:"clientReady"} or {type:"endTurn"}
    send(type:string, data:Record<string, any> = {}){
        this.socket.emit("gameMesssage", {gameid:this.gameID, type, ...data});
    }

    close(){
        this.socket.removeAllListeners();
        this.socket.disconnect();
    }
}
