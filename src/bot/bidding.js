// Bidding (the bazar). The strong bot rates each possible trump by dealing the other
// hands at random many times and playing them out; the rule bot uses a quick point count.
import { NO_TRUMP, ALL_CARDS, RANKS, suitOf, rankOf, teamOf, cardPoints, nextSeat, makeCard } from '../cards.js';
import { legalBidOptions } from '../rules/bidding.js';
import { findMelds, bestMeldSet, resolveDeclarations } from '../rules/declarations.js';
import { Sim } from './sim.js';
import { solve, terminalValue } from './solver.js';
import { heuristicCard } from './heuristic.js';

export const DEFAULT_BID_OPTIONS = {
  bidSamples: 100,
  confidence: 0.6, // bid a value only if we reach it this often in the simulations
  contraConfidence: 0.7, // say contra if the opponents fail this often
  recontraConfidence: 0.75,
  kapotConfidence: 0.85,
  endgameTricks: 3,
};

const trumpOptions = (rules) => (rules.noTrumpAllowed ? [0, 1, 2, 3, NO_TRUMP] : [0, 1, 2, 3]);

// ---------- Simulation ----------

function dealOthers(k, rng) {
  const pool = ALL_CARDS.filter((c) => !k.hand.includes(c));
  const best = { hands: null, w: -1 };
  for (let t = 0; t < 6; t++) {
    rng.shuffle(pool);
    const hands = [[], [], [], []];
    hands[k.seat] = k.hand.slice();
    let i = 0;
    for (let s = 0; s < 4; s++) {
      if (s === k.seat) continue;
      hands[s] = pool.slice(i, i + k.rules.cardsPerPlayer);
      i += k.rules.cardsPerPlayer;
    }
    const w = bidFit(k, hands);
    if (rng() < w) return hands;
    if (w > best.w) { best.hands = hands; best.w = w; }
  }
  return best.hands;
}

// A player who named a suit usually holds it.
function bidFit(k, hands) {
  let p = 1;
  for (const b of k.bids) {
    if (b.type !== 'bid' || b.seat === k.seat) continue;
    const h = hands[b.seat];
    if (b.trump === NO_TRUMP) {
      const aces = h.filter((c) => RANKS[rankOf(c)] === 'A').length;
      p *= aces >= 2 ? 1 : aces === 1 ? 0.4 : 0.1;
    } else {
      const s = h.filter((c) => suitOf(c) === b.trump);
      const top = s.some((c) => ['J', '9'].includes(RANKS[rankOf(c)]));
      p *= s.length >= 3 && top ? 1 : s.length >= 3 || (s.length === 2 && top) ? 0.4 : 0.1;
    }
  }
  return p;
}

// Play one deal out with `bidderSeat` holding trump `trump`. Returns the bidder team's total.
function simulateDeal(k, hands, bidderSeat, trump, endgameTricks) {
  const { rules } = k;
  const bidderTeam = teamOf(bidderSeat);
  const sim = new Sim({ rules, trump, hands, leader: nextSeat(k.dealer, rules) });
  while (!sim.done && sim.tricksLeft > endgameTricks) {
    const seat = sim.turn;
    sim.play(heuristicCard({ hand: sim.hands[seat], trick: sim.trick, trump, seat, rules, played: sim.played, bidderTeam }, sim.legal()));
  }
  const v = sim.done ? terminalValue(sim, bidderTeam) : solve(sim, bidderTeam);
  const cards = v === -1 ? 0 : v;
  const melds = hands.map((h) => bestMeldSet(findMelds(h, trump, rules), rules));
  const decl = resolveDeclarations(melds, trump, rules).points[bidderTeam];
  let bela = 0;
  if (trump !== NO_TRUMP) {
    const kc = makeCard(trump, RANKS.indexOf('K'));
    const qc = makeCard(trump, RANKS.indexOf('Q'));
    for (let s = 0; s < 4; s++) if (teamOf(s) === bidderTeam && hands[s].includes(kc) && hands[s].includes(qc)) bela = rules.belaPoints;
  }
  return { total: cards + decl + bela, kapot: v === rules.kapotPoints };
}

function evaluate(k, worlds, bidderSeat, trump, opts) {
  return worlds.map((h) => simulateDeal(k, h, bidderSeat, trump, opts.endgameTricks));
}

// Highest bid value reached in at least `confidence` of the simulated deals.
function safeValue(results, confidence, rules) {
  const totals = results.map((r) => r.total).sort((a, b) => b - a);
  const idx = Math.min(totals.length - 1, Math.floor(totals.length * confidence) - 1);
  return Math.min(rules.maxBid, Math.floor(totals[Math.max(0, idx)] / 10));
}

const share = (results, pred) => results.filter(pred).length / results.length;
const mean = (results) => results.reduce((s, r) => s + r.total, 0) / results.length;

export function monteCarloBid(k, rng, options = {}) {
  const opts = { ...DEFAULT_BID_OPTIONS, ...options };
  const { rules, auction, seat } = k;
  const legal = legalBidOptions(auction, seat, rules);
  const high = auction.high;
  const worlds = Array.from({ length: opts.bidSamples }, () => dealOthers(k, rng));

  if (legal.recontra) {
    const res = evaluate(k, worlds, high.seat, high.trump, opts);
    const made = share(res, (r) => (high.kapot ? r.kapot : r.total >= high.value * 10));
    return made >= opts.recontraConfidence ? { type: 'recontra' } : { type: 'pass' };
  }

  // Our best trump, if we were to take the contract.
  let best = null;
  for (const trump of trumpOptions(rules)) {
    const res = evaluate(k, worlds, seat, trump, opts);
    const value = safeValue(res, opts.confidence, rules);
    const m = mean(res) * (trump === NO_TRUMP ? rules.noTrumpMultiplier : 1);
    const kapot = share(res, (r) => r.kapot);
    if (!best || value > best.value || (value === best.value && m > best.mean)) best = { trump, value, mean: m, kapot };
  }

  const ourTeam = teamOf(seat);
  if (high && teamOf(high.seat) === ourTeam) {
    // Partner holds the contract: only take over with a clearly better suit of our own.
    if (legal.bid && best.trump !== high.trump && best.value >= high.value + 3) return bid(legal.minBid, best.trump);
    return { type: 'pass' };
  }

  if (high && legal.contra) {
    const res = evaluate(k, worlds, high.seat, high.trump, opts);
    const fail = share(res, (r) => (high.kapot ? !r.kapot : r.total < high.value * 10));
    if (fail >= opts.contraConfidence) return { type: 'contra' };
  }

  if (legal.bid && best.value >= legal.minBid) return bid(legal.minBid, best.trump);
  if (legal.kapot && high && best.kapot >= opts.kapotConfidence) return { type: 'bid', kapot: true, value: rules.kapotBidValue, suit: suitText(best.trump) };
  return { type: 'pass' };
}

// ---------- Rule bot ----------

// A quick estimate of what our team takes with this trump: our own cards plus an
// average contribution from partner.
export function handEstimate(hand, trump, rules) {
  let est = 22; // partner's average help
  const melds = bestMeldSet(findMelds(hand, trump, rules), rules);
  for (const m of melds) est += m.points * 0.8;
  if (trump === NO_TRUMP) {
    for (const c of hand) {
      est += cardPoints(c, trump, rules);
      if (RANKS[rankOf(c)] === 'A') est += 6;
    }
    return est - 15;
  }
  const trumps = hand.filter((c) => suitOf(c) === trump);
  for (const c of trumps) est += cardPoints(c, trump, rules) + 4;
  for (const c of hand) {
    if (suitOf(c) === trump) continue;
    const r = RANKS[rankOf(c)];
    if (r === 'A') est += 15;
    if (r === '10' && hand.includes(makeCard(suitOf(c), RANKS.indexOf('A')))) est += 9;
  }
  const kc = makeCard(trump, RANKS.indexOf('K'));
  const qc = makeCard(trump, RANKS.indexOf('Q'));
  if (hand.includes(kc) && hand.includes(qc)) est += rules.belaPoints;
  if (trumps.length < 3) est -= 25;
  return est;
}

export function ruleBid(k) {
  const { rules, auction, seat } = k;
  const legal = legalBidOptions(auction, seat, rules);
  const high = auction.high;
  if (legal.recontra) return { type: 'pass' };
  let best = null;
  for (const trump of trumpOptions(rules)) {
    const value = Math.min(rules.maxBid, Math.floor(handEstimate(k.hand, trump, rules) / 10));
    if (!best || value > best.value) best = { trump, value };
  }
  if (high && teamOf(high.seat) === teamOf(seat)) return { type: 'pass' };
  if (legal.bid && best.value >= legal.minBid) return bid(legal.minBid, best.trump);
  return { type: 'pass' };
}

const suitText = (t) => (t === NO_TRUMP ? 'NT' : 'SHDC'[t]);
const bid = (value, trump) => ({ type: 'bid', value, suit: suitText(trump) });
