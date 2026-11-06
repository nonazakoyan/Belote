import { NO_TRUMP, RANKS, SUITS, suitOf, rankOf, makeCard, teamOf, tables } from '../cards.js';

// A meld (declaration) is { kind: 'sequence' | 'four', cards: [ids], points, ... }.

function sequencePoints(length, rules) {
  const sp = rules.sequencePoints;
  const max = Math.max(...Object.keys(sp).map(Number));
  return sp[Math.min(length, max)] ?? 0;
}

export function findMelds(hand, trump, rules) {
  const melds = [];
  const orderIndex = RANKS.map((r) => rules.sequenceOrder.indexOf(r));
  const minLen = Math.min(...Object.keys(rules.sequencePoints).map(Number));

  if (trump !== NO_TRUMP || rules.sequencesInNoTrump) {
    for (let s = 0; s < 4; s++) {
      const present = new Array(rules.sequenceOrder.length).fill(null);
      for (const c of hand) if (suitOf(c) === s) present[orderIndex[rankOf(c)]] = c;
      let run = [];
      const flush = (endPos) => {
        if (run.length >= minLen) {
          melds.push({
            kind: 'sequence',
            suit: s,
            cards: run.slice(),
            length: run.length,
            top: endPos,
            points: sequencePoints(run.length, rules),
          });
        }
        run = [];
      };
      for (let p = 0; p < present.length; p++) {
        if (present[p] !== null) run.push(present[p]);
        else flush(p - 1);
      }
      flush(present.length - 1);
    }
  }

  const fourTable = trump === NO_TRUMP ? rules.fourOfAKindNoTrump : rules.fourOfAKindTrump;
  for (let r = 0; r < RANKS.length; r++) {
    const pts = fourTable[RANKS[r]] ?? 0;
    if (pts <= 0) continue;
    const cards = [0, 1, 2, 3].map((s) => makeCard(s, r));
    if (cards.every((c) => hand.includes(c))) melds.push({ kind: 'four', rank: r, cards, points: pts });
  }
  return melds;
}

// The set of melds worth the most points, without reusing a card (unless the rules allow it).
export function bestMeldSet(melds, rules) {
  if (rules.meldsMayShareCards || melds.length <= 1) return melds.slice();
  let best = [];
  let bestPts = 0;
  const n = melds.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const used = new Set();
    let ok = true;
    let pts = 0;
    for (let i = 0; i < n && ok; i++) {
      if (!(mask & (1 << i))) continue;
      for (const c of melds[i].cards) {
        if (used.has(c)) { ok = false; break; }
        used.add(c);
      }
      pts += melds[i].points;
    }
    if (ok && pts > bestPts) { bestPts = pts; best = melds.filter((_, i) => mask & (1 << i)); }
  }
  return best;
}

// > 0 when meld a beats meld b, 0 for an exact tie.
export function compareMelds(a, b, trump, rules) {
  if (a.points !== b.points) return a.points - b.points;
  if (a.kind !== b.kind) return a.kind === 'four' ? 1 : -1; // four of a kind beats an equal sequence
  if (a.kind === 'four') {
    const t = tables(rules);
    const str = (m) => (trump === NO_TRUMP ? t.noTrumpStrength : t.trumpStrength)[m.rank];
    return str(a) - str(b);
  }
  if (a.length !== b.length) return a.length - b.length;
  if (a.top !== b.top) return a.top - b.top;
  const at = a.suit === trump ? 1 : 0;
  const bt = b.suit === trump ? 1 : 0;
  return at - bt;
}

// meldsBySeat: [melds of seat 0, 1, 2, 3]. Only the team holding the single best meld
// scores its declarations; the other team scores none.
export function resolveDeclarations(meldsBySeat, trump, rules) {
  const bestOfTeam = [null, null];
  for (let seat = 0; seat < 4; seat++) {
    for (const m of meldsBySeat[seat] || []) {
      const t = teamOf(seat);
      if (!bestOfTeam[t] || compareMelds(m, bestOfTeam[t], trump, rules) > 0) bestOfTeam[t] = m;
    }
  }
  const points = [0, 0];
  let team = null;
  if (bestOfTeam[0] && !bestOfTeam[1]) team = 0;
  else if (bestOfTeam[1] && !bestOfTeam[0]) team = 1;
  else if (bestOfTeam[0] && bestOfTeam[1]) {
    const cmp = compareMelds(bestOfTeam[0], bestOfTeam[1], trump, rules);
    if (cmp > 0) team = 0;
    else if (cmp < 0) team = 1;
    else team = rules.declarationTie === 'none' ? null : 0;
  }
  if (team !== null) {
    for (let seat = 0; seat < 4; seat++) {
      if (teamOf(seat) !== team) continue;
      for (const m of meldsBySeat[seat] || []) points[team] += m.points;
    }
  }
  return { team, points };
}

// Checks that `cards` form one valid meld for this hand. Returns the meld or null.
export function validateMeld(cards, hand, trump, rules) {
  if (!cards.every((c) => hand.includes(c))) return null;
  const sorted = cards.slice().sort((a, b) => a - b);
  for (const m of findMelds(cards, trump, rules)) {
    const ms = m.cards.slice().sort((a, b) => a - b);
    if (ms.length === sorted.length && ms.every((c, i) => c === sorted[i])) return m;
  }
  return null;
}

export function describeMeld(m) {
  if (m.kind === 'four') return `four ${RANKS[m.rank]}`;
  return `${m.length}-card sequence in ${SUITS[m.suit]}`;
}

export function hasBela(hand, trump, rules) {
  if (trump === NO_TRUMP) return false;
  const k = makeCard(trump, RANKS.indexOf('K'));
  const q = makeCard(trump, RANKS.indexOf('Q'));
  return hand.includes(k) && hand.includes(q);
}

