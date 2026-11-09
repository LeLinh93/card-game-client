import "./TopNav.css";

export type Tab = "home" | "decks" | "friends";

const TABS:{tab:Tab, label:string}[] = [{tab:"home", label:"Home"}, {tab:"decks", label:"Decks"}, {tab:"friends", label:"Friends"}];

// The header menu on every page after login, like card-website's: the tabs on the left,
// the player and the log out button on the right. alerts: tabs with something waiting for the
// player (friend requests), marked with a red "!"
export function TopNav(props:{tab:Tab, username:string, alerts?:Partial<Record<Tab, string>>, onTab:(tab:Tab)=>void, onLogout:()=>void}){
    return(
        <nav className="topnav">
            {TABS.map(({tab, label})=>(
                <button key={tab} className={tab === props.tab ? "nav-button active" : "nav-button"}
                        aria-current={tab === props.tab ? "page" : undefined}
                        onClick={()=>{if(tab !== props.tab){props.onTab(tab)}}}>
                    {label}
                    {props.alerts && props.alerts[tab] ? <span className="nav-alert" role="img" aria-label={props.alerts[tab]} title={props.alerts[tab]}>!</span> : null}
                </button>
            ))}
            <div className="topnav-right">
                <span className="topnav-user">{props.username}</span>
                <button className="logout-button" title="Log out" aria-label="Log out" onClick={props.onLogout}>
                    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2"
                         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                </button>
            </div>
        </nav>
    )
}
