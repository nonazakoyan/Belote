# Bazar Blot bot

A bot for **Armenian Bazar Blot** that takes over a player's seat when they leave the game
and picks the best legal move from the cards it can see. It's plain JavaScript (Node.js 20+)
with no dependencies.

- **Bidding and contra:** for each trump suit (and no-trump) the bot deals the hidden cards
  at random many times, plays the deal out, and bids the highest value it reaches in at least
  60% of the deals. It says contra when the opponents fail in at least 70% of them.
- **Card play:** Monte Carlo search (PIMC). For each legal card the bot deals the hidden cards
  in ways that fit everything it has seen: who is out of which suit, who couldn't overtrump,
  shown declarations, bela and the bidding. It plays each deal to the end (rule bot for the
  middle tricks, an exact solver for the last 3) and scores it with the real scoring rules.
  Then it plays the card with the best average result.
- **Declarations and bela** are announced automatically with the first card.
- **Fair play:** the bot only uses what a human in that seat could see.
- **Never illegal:** every move comes from the rules engine's legal-move list.
  If anything goes wrong inside the search, it falls back to the rule bot.

## Quick start

```bash
npm test                      # 45 unit tests
npm run simulate -- --deals 100 --samples 60      # strong bot vs rule bot
PORT=8080 npm run serve       # optional HTTP service: POST /decide
```

```js
import { decide } from './src/index.js';

const move = decide({
  seat: 1,
  dealer: 0,
  hand: ['JH', '9H', 'AH', '10H', 'KH', 'AS', 'AD', 'AC'],
  bids: [],
});
// -> { type: 'bid', value: 8, suit: 'NT' }   (four aces are worth 190 in no-trump)
```

The input and output formats are described in **[docs/STATE_FORMAT.md](docs/STATE_FORMAT.md)**.

## Plugging it into the game (takeover and hand-back)

The bot is stateless, so taking over and handing back is entirely on the game's side:

```js
import { decide } from 'bazar-blot-bot';

const botSeats = new Set();

function onPlayerDisconnected(seat) {
  botSeats.add(seat);
  if (table.turn === seat) playBotTurn(seat);
}

function onPlayerReconnected(seat) {
  botSeats.delete(seat); // the player continues from the current position
}

function onTurn(seat) {
  if (botSeats.has(seat)) playBotTurn(seat);
}

function playBotTurn(seat) {
  const view = table.viewFor(seat);      // build the JSON from docs/STATE_FORMAT.md
  const move = decide(view, { timeMs: 400 });
  table.apply(seat, move);               // same path as a human move
}
```

`decide` is synchronous and takes about `timeMs` per card (bids take about 0.1–0.3 s).
If the game server must stay responsive, run it in a worker thread or use the HTTP server.

`src/engine/deal.js` is a complete reference implementation of a deal (auction, play,
declarations, scoring), and `Deal.viewFor(seat)` shows exactly how to build the bot's input.

## Rules

All rules live in **[src/rules/config.js](src/rules/config.js)**, as agreed in the plan.
Change a value there, or pass overrides per call: `decide(state, { rules: { targetScore: 151 } })`.

Some rules weren't spelled out in the plan, so these interpretations need confirming:

1. **No-trump doubles** every team's points for that deal.
2. **Contra / recontra** multiply the score of the side that wins the contract (×2 / ×4).
3. After a contra, the next player (on the bidding team) may recontra or pass, then the auction ends.
4. **Four of a kind beats a sequence** worth the same points.
5. A card can be used in only one declaration, and an unbroken run counts as one sequence.
6. If both teams' best declarations are exactly equal (same length, same top card, neither in trump), nobody scores declarations.
7. On a failed contract, bela still counts for the team that holds it.
8. A contract is made when the bidding team's points (cards + declarations + bela) reach the bid.
9. If all four pass, the next dealer deals again.
10. The game target (301) is in rounded points, the same units written on the score sheet.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | `decide(state, options)` |
| `src/rules/` | Rules config, legal moves, declarations, bidding, scoring |
| `src/bot/knowledge.js` | Reads and checks the input state; works out voids and trump limits |
| `src/bot/worlds.js` | Deals hidden cards consistent with what's known |
| `src/bot/pimc.js` | Monte Carlo card play |
| `src/bot/solver.js` | Exact solver for the last tricks |
| `src/bot/heuristic.js` | Rule bot (fallback, playout policy, test opponent) |
| `src/bot/bidding.js` | Monte Carlo bidding and the rule bot's bidding |
| `src/engine/` | Reference game engine and match runner |
| `src/server.js` | Optional HTTP wrapper |
| `scripts/simulate.js` | Bot-vs-bot arena |
| `test/` | Unit tests (`node --test`) |
