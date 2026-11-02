// What card-server sends during a match (src/core/game/card.ts, player.ts and socketConenction.ts)

// A card in play. The opponent's face-down cards (their hand, their face-down backline) come with
// only the id and isHidden set.
export interface GameCard{
    id:string;
    name:string;
    type:string;
    resources:number;
    description:string;
    header:string;
    attack:number;
    defense:number;
    health:number;
    maxHealth:number;
    attribute:string[];
    imagePath:string;
    isHidden:boolean;
    isAttack:boolean;
    activeLeft:number[];
    summonSick:boolean;
    buffs:{name:string, source:string, [key:string]:any}[];
}

export interface PlayerState{
    deckAmount:number;
    resources:number;
    hand:GameCard[];
    frontline:GameCard[];
    backline:GameCard[];
    graveyard:GameCard[];
}

// Every game message carries "order", the server's count of actions; they arrive in that order
export interface StateMessage{
    player:PlayerState;
    opponent:PlayerState;
    order:number;
}

export interface StartGameMessage extends StateMessage{
    isTurn:boolean;
}

// isTurn: the card was drawn by this player (it is shown), or by the opponent (hidden)
export interface DrawCardMessage{
    card:GameCard;
    isTurn:boolean;
    order:number;
}

// A card the opponent can see: their hidden cards have no name
export function isKnown(card:GameCard):boolean{
    return !!card && !!card.name;
}
