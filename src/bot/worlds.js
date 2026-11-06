// Dealing the hidden cards: random hands for the other players that fit everything
// the bot has seen (who is out of which suit, shown declarations, the bidding).
import { NO_TRUMP, suitOf, RANKS, makeCard, teamOf } from '../cards.js';
import { canHold } from './knowledge.js';
import { findMelds, bestMeldSet, resolveDeclarations } from '../rules/declarations.js';

// Fill the unknown cards into the other seats. Returns hands[4] of current cards.
export function sampleWorld(k, rng, { biasTries = 6 } = {}) {
  let world = null;
  for (let t = 0; t < biasTries; t++) {
    world = dealOnce(k, rng);
    if (rng() < bidLikelihood(k, world)) return world;
  }
  return world;
}

function dealOnce(k, rng) {
  const others = [0, 1, 2, 3].filter((s) => s !== k.seat);
  const knownAll = new Set(k.known.flat());
  const pool = k.unseen.filter((c) => !knownAll.has(c));
  const need = [0, 0, 0, 0];
  for (const s of others) need[s] = k.remaining[s] - k.known[s].length;

  for (let attempt = 0; attempt < 40; attempt++) {
    const hands = [0, 1, 2, 3].map((s) => (s === k.seat ? k.hand.slice() : k.known[s].slice()));
    const cap = need.slice();
    const cards = rng.shuffle(pool.slice());
    const elig = new Map(cards.map((c) => [c, others.filter((s) => canHold(k, s, c))]));
    cards.sort((a, b) => elig.get(a).length - elig.get(b).length);
    let ok = true;
    for (const c of cards) {
      const opts = elig.get(c).filter((s) => cap[s] > 0);
      if (opts.length === 0) { ok = false; break; }
      const s = weightedPick(opts, cap, rng);
      hands[s].push(c);
      cap[s]--;
    }
    if (ok) return hands;
  }
  // The constraints could not be met (bad input or a misread); deal ignoring them.
  const hands = [0, 1, 2, 3].map((s) => (s === k.seat ? k.hand.slice() : k.known[s].slice()));
  const cap = need.slice();
  for (const c of rng.shuffle(pool.slice())) {
    const s = weightedPick(others.filter((o) => cap[o] > 0), cap, rng);
    hands[s].push(c);
    cap[s]--;
  }
  return hands;
}

function weightedPick(opts, cap, rng) {
  let total = 0;
  for (const s of opts) total += cap[s];
  let r = rng() * total;
  for (const s of opts) {
    r -= cap[s];
    if (r < 0) return s;
  }
  return opts[opts.length - 1];
}

// How well a dealt world fits the bids: a player who named a suit usually holds it.
function bidLikelihood(k, hands) {
  let p = 1;
  const playedBy = (seat) => (k.played || []).filter((x) => x.seat === seat).map((x) => x.card);
  for (const b of k.bids) {
    if (b.type !== 'bid' || b.seat === k.seat) continue;
    const held = hands[b.seat].concat(playedBy(b.seat));
    p *= suitFit(held, b.trump, k);
  }
  return p;
}

function suitFit(cards, trump, k) {
  if (trump === NO_TRUMP) {
    const aces = cards.filter((c) => RANKS[c & 7] === 'A').length;
    return aces >= 2 ? 1 : aces === 1 ? 0.45 : 0.15;
  }
  const inSuit = cards.filter((c) => suitOf(c) === trump);
  const top = inSuit.some((c) => RANKS[c & 7] === 'J' || RANKS[c & 7] === '9');
  if (inSuit.length >= 3 && top) return 1;
  if (inSuit.length >= 3 || (inSuit.length === 2 && top)) return 0.5;
  return inSuit.length >= 1 ? 0.2 : 0.1;
}

// Declaration and bela points per team for a world, as the bot expects them to be scored.
export function worldBonuses(k, hands) {
  const { rules, trump } = k;
  let decl = [0, 0];
  if (k.firstTrick) {
    const melds = [0, 1, 2, 3].map((s) => {
      const playedThisTrick = k.trick.filter((t) => t.seat === s).map((t) => t.card);
      return bestMeldSet(findMelds(hands[s].concat(playedThisTrick), trump, rules), rules);
    });
    decl = resolveDeclarations(melds, trump, rules).points;
  } else if (k.shown.length) {
    for (const d of k.shown) {
      const m = findMelds(d.cards, trump, rules)[0];
      if (m) decl[teamOf(d.seat)] += m.points;
    }
  }
  const bela = [0, 0];
  if (trump !== NO_TRUMP) {
    if (k.belaSeat !== null) bela[teamOf(k.belaSeat)] = rules.belaPoints;
    else {
      const kc = makeCard(trump, RANKS.indexOf('K'));
      const qc = makeCard(trump, RANKS.indexOf('Q'));
      for (let s = 0; s < 4; s++) if (hands[s].includes(kc) && hands[s].includes(qc)) bela[teamOf(s)] = rules.belaPoints;
    }
  }
  return { decl, bela };
}
