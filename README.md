# card-game

The web client for playing the card game, replacing the old Unity client. It talks to
[card-server](../card-server) and draws cards with the same template as card-website.

So far it has the login, a main menu, the deck editor and the friends. Choosing a mode and pressing Play starts
the match (Bot match: card-server's `botMatch`; Free match: the ranked queue; Friend match: an online friend
chosen in the play panel gets an invite, and the match starts once they accept) and loads the 3D play
area with threngine (`src/game/Engine3D.ts`). In the match (`src/game/Board3D.ts`), the back rows are laid out from the decks and the drawn cards
fly to the hands, which are HTML over the 3D canvas. On your turn, drag a hand card onto the sphere to
sacrifice it for a resource, or onto a glowing zone of your field to summon it; the counters by the
decks show both sides' resources. Drag a field card that can attack onto an opponent's card (or
onto their field once it is empty) to attack, hover your face-down structure to Activate it (or a card
whose Active skill can still be used this turn, to use it), and
click END TURN to end your turn. Hover a field card to read it on the left; a card whose skill goes
off shows on the right. When a skill makes you pick cards, pick them where they are (the field or
your hand) or from a list (deck, graveyard...); click a picked card again to let it go, then Confirm.

Spells and abilities that need a target are aimed with a line from the hand (a hint at the top says what
to target); the others are dropped on the board. Any card dropped on the sphere is sacrificed. Traps flip
up when they go off, each deck shows how many cards are left, the skill log (top left) lists every skill
that went off, and Surrender (top right) gives the match to the opponent. Magical damage from a skill
strikes the card with a blue lightning bolt and shakes the view; physical damage from a skill hits it
with three glowing arrows and shakes the card. A card going to a graveyard (from the field, a hand or a
deck) flies there as a blue comet, to its owner's tombstone by their deck; click a tombstone to see
that graveyard. A banished card's comet flies into the sphere, which opens for it (a sacrificed card
just sinks in).

## Friends

On the Friends tab, send a friend request by the player's exact name; they accept or delete it (a red
"!" on the tab means a request is waiting). It lists your friends with who is online. While logged in
the client keeps a socket open for this (`src/game/lobby.ts`), which also carries the match invites.

## Run

threngine comes from Viscircle's GitLab npm registry. Before installing, copy `.npmrc` from
dora-frontend into this folder. It holds the registry login, so git ignores it.

```bash
npm install
npm run dev
```

It opens on http://localhost:5174 and expects card-server on http://localhost:8000. For another
server address, copy `.env.example` to `.env` and change `VITE_API_URL`.

`npm run build` type checks and builds into `dist/`.

## Deck rules

Checked in `src/deckRules.ts`, as in the Unity client:

- A deck holds up to the server's max deck size (60); it needs at least the min (40) to be set active.
- The backline holds exactly 5 traps or structures.
- At most 3 copies of a card across the deck and backline. Tokens can't be added.

In the deck editor, click a card to add it to the deck, right click a trap or structure to add it
to the backline, and click a row in the deck list to take one copy out.
