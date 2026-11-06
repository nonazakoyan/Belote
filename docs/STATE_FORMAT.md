# State format

The game calls the bot with the situation **as the bot's seat sees it** and gets one move back.
The bot keeps no memory between calls, so every call carries the whole deal so far.

```js
import { decide } from 'bazar-blot-bot';
const move = decide(state);          // or POST the same JSON to /decide
```

## Seats and cards

- Seats are numbers `0`–`3`, in playing order (clockwise by default). Partners are `0 + 2` and `1 + 3`.
- Cards are strings: rank + suit. Ranks `7 8 9 10 J Q K A` (`T` also accepted for 10), suits `S H D C`.
  Examples: `"JH"`, `"10S"`, `"AD"`, `"7C"`.
- Trump suit is one of `"S" "H" "D" "C"`, or `"NT"` for no-trump.

## Input

| Field | Required | Meaning |
| --- | --- | --- |
| `seat` | always | The seat the bot is playing for. |
| `dealer` | always | The dealer of this deal. The seat after the dealer bids first and leads the first trick. |
| `hand` | always | The cards this seat holds **now** (8 during bidding, fewer once cards are played). |
| `bids` | always | Every action in the auction so far, in order (see below). Use `[]` before anyone has bid. |
| `contract` | play phase | The final contract. Optional if `bids` already contains the finished auction. |
| `played` | play phase | Every card played this deal, in order: `{ "seat": 1, "card": "7S" }`. Add `"bela": true` on the card where a player said bela. |
| `declarations` | optional | Declarations that were shown after the first trick: `{ "seat": 2, "cards": ["7S","8S","9S"] }`. |
| `matchScore` | optional | Running match score `[team 0+2, team 1+3]`. |
| `rules` | optional | Rule overrides, see `src/rules/config.js`. |

### Bids

```json
{ "seat": 1, "type": "pass" }
{ "seat": 2, "type": "bid", "value": 9, "suit": "H" }      // 90 points, hearts trump
{ "seat": 3, "type": "bid", "value": 10, "suit": "NT" }    // no-trump
{ "seat": 0, "type": "bid", "kapot": true, "suit": "S" }   // kapot
{ "seat": 3, "type": "contra" }
{ "seat": 0, "type": "recontra" }
```

### Contract

```json
{ "seat": 2, "value": 9, "suit": "H", "kapot": false, "multiplier": 1 }
```

`multiplier` is `1`, `2` after contra, or `4` after recontra.

The bot works out whose turn it is from `dealer`, `bids` and `played`. If that isn't `seat`,
it returns an error instead of guessing.

## Output

During the auction, one of:

```json
{ "type": "pass" }
{ "type": "bid", "value": 8, "suit": "D" }
{ "type": "bid", "kapot": true, "value": 25, "suit": "S" }
{ "type": "contra" }
{ "type": "recontra" }
```

During play:

```json
{ "type": "play", "card": "JH" }
{ "type": "play", "card": "7S", "declarations": [{ "type": "sequence", "cards": ["7S","8S","9S"] }] }
{ "type": "play", "card": "KH", "bela": true }
```

- `declarations` appears only with the bot's first card of the deal.
- `bela: true` appears on the first of the trump K and Q the bot plays.
- With the option `explain: true` the move also has an `explain` field with the average score of each card.

## Options

`decide(state, options)`:

| Option | Default | Meaning |
| --- | --- | --- |
| `level` | `"strong"` | `"strong"` = Monte Carlo bot, `"rules"` = fast rule bot |
| `timeMs` | `400` | Thinking time per card |
| `minSamples` / `maxSamples` | `24` / `1500` | Fewest and most simulated deals per card |
| `bidSamples` | `100` | Simulated deals per trump suit when bidding |
| `seed` | from the state | Fix it for repeatable decisions |
| `rules` | Bazar Blot | Rule overrides |

## Errors

A broken state (wrong turn, duplicate card, unknown card, illegal bid history) throws a
`StateError` with a clear message, and the HTTP server answers `400 { "error": "..." }`.

## Full example (play phase)

Seat 0 dealt and seat 1 took hearts at 8. Seat 0 won trick 1 with KS and led AC; now seat 3 (the bot) must follow clubs:

```json
{
  "seat": 3,
  "dealer": 0,
  "hand": ["JH", "7H", "AS", "10S", "KD", "8C", "9C"],
  "bids": [
    { "seat": 1, "type": "bid", "value": 8, "suit": "H" },
    { "seat": 2, "type": "pass" },
    { "seat": 3, "type": "pass" },
    { "seat": 0, "type": "pass" }
  ],
  "played": [
    { "seat": 1, "card": "7S" }, { "seat": 2, "card": "AD" }, { "seat": 3, "card": "QS" }, { "seat": 0, "card": "KS" },
    { "seat": 0, "card": "AC" }, { "seat": 1, "card": "10C" }, { "seat": 2, "card": "7C" }
  ]
}
```
