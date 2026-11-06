// Cards are small integers inside the bot: id = suit * 8 + rank.
// Outside the bot they are strings like "JH", "10S", "AD" (rank + suit).

export const SUITS = ['S', 'H', 'D', 'C']; // spades, hearts, diamonds, clubs
export const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const NO_TRUMP = -1;

export const suitOf = (id) => id >> 3;
export const rankOf = (id) => id & 7;
export const makeCard = (suit, rank) => suit * 8 + rank;
export const ALL_CARDS = Array.from({ length: 32 }, (_, i) => i);

export function parseCard(text) {
  if (typeof text !== 'string') throw new Error(`Card must be a string, got ${JSON.stringify(text)}`);
  const s = text.trim().toUpperCase();
  const suit = SUITS.indexOf(s.slice(-1));
  let rankText = s.slice(0, -1);
  if (rankText === 'T') rankText = '10';
  const rank = RANKS.indexOf(rankText);
  if (suit < 0 || rank < 0) throw new Error(`Unknown card "${text}"`);
  return makeCard(suit, rank);
}

export const cardName = (id) => RANKS[rankOf(id)] + SUITS[suitOf(id)];

export function parseSuit(text) {
  if (text === 'NT' || text === 'nt' || text === null) return NO_TRUMP;
  const suit = SUITS.indexOf(String(text).toUpperCase());
  if (suit < 0) throw new Error(`Unknown suit "${text}" (use S, H, D, C or NT)`);
  return suit;
}

export const suitName = (suit) => (suit === NO_TRUMP ? 'NT' : SUITS[suit]);

// Per-rules lookup tables: strength (higher wins) and points by card id.
const cache = new WeakMap();

export function tables(rules) {
  let t = cache.get(rules);
  if (t) return t;
  const strengthFrom = (order) => RANKS.map((r) => order.length - order.indexOf(r));
  const pointsFrom = (pts) => RANKS.map((r) => pts[r] ?? 0);
  t = {
    trumpStrength: strengthFrom(rules.trumpOrder),
    plainStrength: strengthFrom(rules.plainOrder),
    noTrumpStrength: strengthFrom(rules.noTrumpOrder),
    trumpPoints: pointsFrom(rules.trumpPoints),
    plainPoints: pointsFrom(rules.plainPoints),
    noTrumpPoints: pointsFrom(rules.noTrumpPoints),
  };
  cache.set(rules, t);
  return t;
}

export function cardPoints(id, trump, rules) {
  const t = tables(rules);
  if (trump === NO_TRUMP) return t.noTrumpPoints[rankOf(id)];
  return suitOf(id) === trump ? t.trumpPoints[rankOf(id)] : t.plainPoints[rankOf(id)];
}

export function cardStrength(id, trump, rules) {
  const t = tables(rules);
  if (trump === NO_TRUMP) return t.noTrumpStrength[rankOf(id)];
  return suitOf(id) === trump ? t.trumpStrength[rankOf(id)] : t.plainStrength[rankOf(id)];
}

export const partnerOf = (seat) => (seat + 2) % 4;
export const teamOf = (seat) => seat % 2;

export function nextSeat(seat, rules) {
  return rules.direction === 'counterclockwise' ? (seat + 3) % 4 : (seat + 1) % 4;
}
