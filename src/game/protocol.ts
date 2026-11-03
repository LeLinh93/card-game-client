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
    hero?:boolean;
    buffs:{name:string, source:string, [key:string]:any}[];
    // Spell and ability cards in the player's hand: whether playing it needs a target, the ids of the
    // field cards it can target now, and what to target ("Target an enemy Unit card")
    needsTarget?:boolean;
    targets?:string[];
    targetHint?:string;
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

// Whether a card of the player's field can attack now: face up, a unit or structure with attack,
// that hasn't attacked (and isn't summon sick) this turn
export function canAttack(card:GameCard):boolean{
    return !!card && !card.isHidden && (card.type === "unit" || card.type === "structure") && !card.isAttack && card.attack > 0;
}

// A face-up card can use its Active skill while it has uses left this turn and wasn't just summoned
// (the server checks the cost)
export function canUseActive(card:GameCard):boolean{
    return !!card && !card.isHidden && !card.summonSick && (card.activeLeft || [])[0] > 0;
}

// A card the opponent can see: their hidden cards have no name
export function isKnown(card:GameCard):boolean{
    return !!card && !!card.name;
}

// A skill asks the player to pick "amount" of these cards. "where" says where they are: myField,
// oppoField, field (both), hand, deck or graveyard. The answer is a cardSelect message.
export interface SelectionMessage{
    selection:GameCard[];
    amount:number;
    message:string;
    where?:string;
    order:number;
}

// A skill dealt damage ("physical" or "magical") to these cards, each with the damage it took. The
// new health comes with the updateMessage after it.
export interface SkillDamageMessage{
    kind:string;
    targets:{id:string, damage:number}[];
    order:number;
}
