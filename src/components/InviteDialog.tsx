import "./InviteDialog.css";

// Friend match invites, over any page: a friend's invite to accept or decline, the player's own
// invite while it waits for the friend (it can be taken back), or what became of it
export function InviteDialog(props:{invite:{id:string, name:string}, inviting:{id:string, name:string}, note:string,
                                    onAnswer:(accept:boolean)=>void, onCancel:()=>void, onClose:()=>void}){
    if(props.invite){
        return(
            <div className="invite-backdrop">
                <div className="invite panel" role="alertdialog" aria-label="Match invite">
                    <p className="invite-text"><strong>{props.invite.name}</strong> invites you to a match.</p>
                    <div className="invite-buttons">
                        <button className="primary" onClick={()=>{props.onAnswer(true)}}>Accept</button>
                        <button onClick={()=>{props.onAnswer(false)}}>Decline</button>
                    </div>
                </div>
            </div>
        )
    }
    if(props.inviting){
        return(
            <div className="invite-backdrop">
                <div className="invite panel" role="dialog" aria-label="Waiting for your friend">
                    <p className="invite-text">Waiting for <strong>{props.inviting.name}</strong> to answer…</p>
                    <div className="invite-buttons">
                        <button onClick={props.onCancel}>Cancel</button>
                    </div>
                </div>
            </div>
        )
    }
    if(props.note){
        return(
            <div className="invite-backdrop" onClick={props.onClose}>
                <div className="invite panel" role="alertdialog" aria-label="Friend match" onClick={(e)=>{e.stopPropagation()}}>
                    <p className="invite-text">{props.note}</p>
                    <div className="invite-buttons">
                        <button onClick={props.onClose}>OK</button>
                    </div>
                </div>
            </div>
        )
    }
    return null;
}
