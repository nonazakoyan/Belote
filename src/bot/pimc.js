// Monte Carlo card play (Perfect Information Monte Carlo).
// For each legal card: deal the hidden cards many times in ways that fit what we know,
// play the deal out (rule bot for the middle, exact solver for the last tricks),
// score it with the real scoring rules, and pick the card with the best average.
import { cardPoints, teamOf, cardStrength } from '../cards.js';
import { legalCards } from '../rules/play.js';
import { scoreDeal, dealTotal } from '../rules/scoring.js';
import { Sim } from './sim.js';
import { solve, terminalValue } from './solver.js';
import { heuristicCard } from './heuristic.js';
import { sampleWorld, worldBonuses } from './worlds.js';

export const DEFAULT_PLAY_OPTIONS = {
  timeMs: 400, // stop sampling after this long...
  minSamples: 24, // ...but always look at least at this many deals
  maxSamples: 1500,
  endgameTricks: 3, // solve the last N tricks exactly
};

export function playoutValue(sim, k, endgameTricks, bonuses) {
  const bidderTeam = teamOf(k.contract.seat);
  while (!sim.done && sim.tricksLeft > endgameTricks) {
    const seat = sim.turn;
    const card = heuristicCard({
      hand: sim.hands[seat], trick: sim.trick, trump: sim.trump, seat, rules: sim.rules, played: sim.played, bidderTeam,
    }, sim.legal());
    sim.play(card);
  }
  const v = sim.done ? terminalValue(sim, bidderTeam) : solve(sim, bidderTeam);
  return scoreFromObjective(v, k, bidderTeam, bonuses);
}

// Score the finished deal from our team's point of view (our raw points minus theirs).
function scoreFromObjective(v, k, bidderTeam, bonuses) {
  const { rules, contract } = k;
  const points = [0, 0];
  let kapotTeam = null;
  if (v === -1) { kapotTeam = 1 - bidderTeam; points[kapotTeam] = rules.kapotPoints; }
  else if (v === rules.kapotPoints) { kapotTeam = bidderTeam; points[bidderTeam] = v; }
  else { points[bidderTeam] = v; points[1 - bidderTeam] = dealTotal(contract.trump, rules) - v; }
  const res = scoreDeal(contract, { points, kapotTeam }, bonuses.decl, bonuses.bela, rules);
  const me = teamOf(k.seat);
  return res.raw[me] - res.raw[1 - me];
}

export function simFromWorld(k, hands) {
  const points = [0, 0];
  const tricksWon = [0, 0];
  for (const t of k.tricks) {
    const team = teamOf(t.winner);
    tricksWon[team]++;
    for (const c of t.cards) points[team] += cardPoints(c, k.trump, k.rules);
  }
  return new Sim({
    rules: k.rules, trump: k.trump, hands, leader: k.leader, trick: k.trick, points, tricksWon, played: k.playedSet,
  });
}

export function pimcCard(k, rng, options = {}) {
  const opts = { ...DEFAULT_PLAY_OPTIONS, ...options };
  const legal = legalCards(k.hand, k.trick, k.trump, k.seat, k.rules);
  if (legal.length === 1) return { card: legal[0], samples: 0, scores: null };

  const totals = new Float64Array(legal.length);
  const start = performance.now();
  let n = 0;
  while (n < opts.maxSamples && (n < opts.minSamples || performance.now() - start < opts.timeMs)) {
    const hands = sampleWorld(k, rng);
    const bonuses = worldBonuses(k, hands);
    for (let i = 0; i < legal.length; i++) {
      const sim = simFromWorld(k, hands);
      sim.play(legal[i]);
      totals[i] += playoutValue(sim, k, opts.endgameTricks, bonuses);
    }
    n++;
  }

  // Best average; on a tie keep the cheaper, weaker card.
  let best = 0;
  for (let i = 1; i < legal.length; i++) {
    const d = totals[i] - totals[best];
    if (d > 1e-9 || (Math.abs(d) <= 1e-9 && cheaper(legal[i], legal[best], k))) best = i;
  }
  const scores = {};
  legal.forEach((c, i) => { scores[c] = totals[i] / n; });
  return { card: legal[best], samples: n, scores, ms: performance.now() - start };
}

function cheaper(a, b, k) {
  const pa = cardPoints(a, k.trump, k.rules);
  const pb = cardPoints(b, k.trump, k.rules);
  if (pa !== pb) return pa < pb;
  return cardStrength(a, k.trump, k.rules) < cardStrength(b, k.trump, k.rules);
}
