import { Deal, dealHands } from './deal.js';
import { nextSeat } from '../cards.js';
import { makeRng } from '../rng.js';

// players: array of 4 functions (view) => move. Partners are seats 0+2 and 1+3.
// Returns the finished deal, or null when everyone passed.
export function playDeal({ players, dealer, rules, rng, matchScore = [0, 0], hands, onMove }) {
  const deal = new Deal({ dealer, hands: hands || dealHands(rng, rules), rules, matchScore });
  while (deal.phase === 'bidding' || deal.phase === 'play') {
    const seat = deal.turn;
    const view = deal.viewFor(seat);
    const t0 = performance.now();
    const move = players[seat](view);
    const ms = performance.now() - t0;
    if (onMove) onMove({ seat, view, move, ms, phase: deal.phase });
    deal.apply(seat, move);
  }
  return deal.phase === 'redeal' ? { deal, redeal: true } : { deal, redeal: false };
}

export function playMatch({ players, rules, seed = 1, dealer = 0, targetScore = rules.targetScore, maxDeals = 200, onMove, onDeal }) {
  const rng = makeRng(seed);
  const score = [0, 0];
  let deals = 0;
  let d = dealer;
  while (deals < maxDeals) {
    const { deal, redeal } = playDeal({ players, dealer: d, rules, rng, matchScore: score, onMove });
    d = nextSeat(d, rules);
    if (redeal) continue;
    deals++;
    score[0] += deal.result.units[0];
    score[1] += deal.result.units[1];
    if (onDeal) onDeal(deal, score.slice());
    if ((score[0] >= targetScore || score[1] >= targetScore) && score[0] !== score[1]) break;
  }
  return { score, deals, winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1 };
}
