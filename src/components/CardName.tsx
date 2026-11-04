import {useLayoutEffect, useRef} from "react";

// The smallest the name gets, in px of the 400px wide template
const MIN_SIZE = 10;

// The card's name on one line of the banner: a name too long for it gets a smaller font, just enough
// to fit. It is measured again once the card font has loaded, since the fallback font is narrower.
export function CardName(props:{name:string}){
    const ref = useRef<HTMLSpanElement>(null);
    useLayoutEffect(()=>{
        const el = ref.current;
        if(!el){
            return;
        }
        const fit = ()=>{
            el.style.fontSize = "";
            const room = el.clientWidth, full = el.scrollWidth;
            if(room > 0 && full > room){
                const size = parseFloat(getComputedStyle(el).fontSize);
                el.style.fontSize = Math.max(MIN_SIZE, Math.floor(size * room / full * 10) / 10) + "px";
            }
        };
        fit();
        let current = true;
        document.fonts.ready.then(()=>{
            if(current){
                fit();
            }
        });
        return ()=>{current = false};
    }, [props.name]);
    return <span ref={ref} className="card-name">{props.name}</span>;
}
