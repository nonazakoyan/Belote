// Exact endgame solver: with every hand known, finds the best play for both teams
// (alpha-beta search). Returns the final card points of `team`, counting kapot,
// and -1 when the other team takes every trick (so that is the worst outcome).
import { teamOf, cardStrength } from '../cards.js';

export function solve(sim, team, alpha = -Infinity, beta = Infinity) {
  if (sim.done) return terminalValue(sim, team);
  const seat = sim.turn;
  const moves = sim.legal();
  if (moves.length > 1) moves.sort((a, b) => cardStrength(b, sim.trump, sim.rules) - cardStrength(a, sim.trump, sim.rules));
  const maximizing = teamOf(seat) === team;
  let best = maximizing ? -Infinity : Infinity;
  for (const c of moves) {
    sim.play(c);
    const v = solve(sim, team, alpha, beta);
    sim.undo();
    if (maximizing) {
      if (v > best) best = v;
      if (best > alpha) alpha = best;
    } else {
      if (v < best) best = v;
      if (best < beta) beta = best;
    }
    if (alpha >= beta) break;
  }
  return best;
}

export function terminalValue(sim, team) {
  if (sim.tricksWon[1 - team] === sim.totalTricks) return -1;
  return sim.finalPoints(team);
}
