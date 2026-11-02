import "./SkillLog.css";
import {useState} from "react";

export interface SkillLogEntry{
    // The player's card, or the opponent's
    yours:boolean;
    card:string;
    // The skill as written on the card
    skill:string;
}

// Every skill that went off in the match, from the server's log. Minimised it shows whose card and
// which card went off last; opened, the whole list with the skills, latest first.
export function SkillLog(props:{entries:SkillLogEntry[]}){
    const [open, setOpen] = useState(false);
    const latest = props.entries[props.entries.length - 1];
    return(
        <div className={open ? "skill-log open" : "skill-log"}>
            <button className="skill-log-head" aria-expanded={open} onClick={()=>{setOpen(!open)}}
                    title={open ? "Minimise the skill log" : "Show every skill that went off"}>
                <span className="skill-log-title">Skills ({props.entries.length})</span>
                <span className="skill-log-toggle" aria-hidden="true">{open ? "▴" : "▾"}</span>
            </button>
            {open ? (
                <ol className="skill-log-list">
                    {props.entries.slice().reverse().map((entry, i)=>(
                        <li key={props.entries.length - i}><Entry entry={entry}/></li>
                    ))}
                    {props.entries.length <= 0 ? <li className="skill-log-empty">No skill has gone off yet.</li> : null}
                </ol>
            ) : latest ? (
                <div className="skill-log-latest"><Entry entry={latest} short/></div>
            ) : null}
        </div>
    )
}

function Entry(props:{entry:SkillLogEntry, short?:boolean}){
    const {entry} = props;
    return(
        <div className="skill-log-entry">
            <span className={entry.yours ? "skill-log-side yours" : "skill-log-side theirs"}>{entry.yours ? "You" : "Opponent"}</span>
            <span className="skill-log-card">{entry.card}</span>
            {entry.skill && !props.short ? <span className="skill-log-skill">{entry.skill}</span> : null}
        </div>
    )
}
