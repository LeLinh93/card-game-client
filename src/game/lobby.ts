import {io, Socket} from "socket.io-client";
import {endpoint} from "../api";

// The friends of the logged-in player, from card-server's friends.ts
export interface Friend{
    id:string;
    name:string;
    online:boolean;
}

export interface FriendLists{
    friends:Friend[];
    // Friend requests waiting for this player's answer, and the ones they sent
    requests:{id:string, name:string}[];
    sent:{id:string, name:string}[];
}

// The socket.io connection kept while the player is logged in (a match has its own, see
// connection.ts): it keeps them online for their friends, carries the friend lists and requests,
// and the match invites. It logs in again by itself after a reconnect.
export class Lobby{
    private socket:Socket;

    constructor(token:string){
        this.socket = io(endpoint, {transports:["websocket", "polling"]});
        this.socket.on("connect", ()=>{this.socket.emit("login", {token})});
        this.socket.on("login", (msg)=>{
            if(msg && msg.status === "success"){
                this.socket.emit("friends");
            }
        });
    }

    // Listens to a server message (friends, friendNotice, matchInvite...); returns the way to stop
    on(event:string, listener:(data:any)=>void):()=>void{
        this.socket.on(event, listener);
        return ()=>{this.socket.off(event, listener)};
    }

    addFriend(name:string){
        this.socket.emit("addFriend", {name});
    }

    acceptFriend(id:string){
        this.socket.emit("acceptFriend", {id});
    }

    // Deletes a friend request the player got
    declineFriend(id:string){
        this.socket.emit("declineFriend", {id});
    }

    inviteFriend(id:string){
        this.socket.emit("inviteFriend", {id});
    }

    cancelInvite(){
        this.socket.emit("cancelInvite");
    }

    answerInvite(id:string, accept:boolean){
        this.socket.emit("answerInvite", {id, accept});
    }

    close(){
        this.socket.removeAllListeners();
        this.socket.disconnect();
    }
}
