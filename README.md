# card-game

The web client for playing the card game, replacing the old Unity client. It talks to
[card-server](../card-server) and draws cards with the same template as card-website.

So far it has the login, a main menu and the deck editor. Playing a match comes next.

## Run

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
