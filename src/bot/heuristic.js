// The baseline rule bot: simple expert rules for card play.
// It is the fallback when time runs out, the playout policy inside the Monte Carlo search,
// and the opponent the stronger bot is tested against.
import { NO_TRUMP, suitOf, cardPoints, cardStrength, partnerOf, teamOf } from '../cards.js';
import { legalCards, beats, trickWinnerIndex } from '../rules/play.js';

// ctx: { hand, trick, trump, seat, rules, played (Uint8Array 32), bidderTeam }
export function heuristicCard(ctx, legal = legalCards(ctx.hand, ctx.trick, ctx.trump, ctx.seat, ctx.rules)) {
  if (legal.length === 1) return legal[0];
  return ctx.trick.length === 0 ? chooseLead(ctx, legal) : chooseFollow(ctx, legal);
}

// Is c the highest card left in its suit (ignoring our own hand)?
function isMaster(c, ctx) {
  const s = suitOf(c);
  const str = cardStrength(c, ctx.trump, ctx.rules);
  for (let r = 0; r < 8; r++) {
    const o = s * 8 + r;
    if (o === c || ctx.played[o] || ctx.hand.includes(o)) continue;
    if (cardStrength(o, ctx.trump, ctx.rules) > str) return false;
  }
  return true;
}

function trumpsOutstanding(ctx) {
  if (ctx.trump === NO_TRUMP) return 0;
  let n = 0;
  for (let r = 0; r < 8; r++) {
    const o = ctx.trump * 8 + r;
    if (!ctx.played[o] && !ctx.hand.includes(o)) n++;
  }
  return n;
}

const pts = (c, ctx) => cardPoints(c, ctx.trump, ctx.rules);
const str = (c, ctx) => cardStrength(c, ctx.trump, ctx.rules);
const isTrump = (c, ctx) => ctx.trump !== NO_TRUMP && suitOf(c) === ctx.trump;

function lowest(cards, ctx) {
  // Cheapest card to give away: fewest points, then weakest, keeping trumps if possible.
  let best = cards[0];
  let bestKey = Infinity;
  for (const c of cards) {
    const key = (isTrump(c, ctx) ? 1000 : 0) + pts(c, ctx) * 10 + str(c, ctx);
    if (key < bestKey) { bestKey = key; best = c; }
  }
  return best;
}

function chooseLead(ctx, legal) {
  const ourContract = teamOf(ctx.seat) === ctx.bidderTeam;
  const trumps = legal.filter((c) => isTrump(c, ctx));
  const outstanding = trumpsOutstanding(ctx);

  // Pull the opponents' trumps when we own the contract.
  if (ourContract && trumps.length > 0 && outstanding > 0) {
    const masterTrump = trumps.find((c) => isMaster(c, ctx));
    if (masterTrump !== undefined) return masterTrump;
    if (trumps.length >= 3) return lowest(trumps, ctx);
  }

  // Cash side-suit masters, the most valuable first.
  const masters = legal.filter((c) => !isTrump(c, ctx) && isMaster(c, ctx));
  if (masters.length > 0 && (outstanding === 0 || ourContract || masters.some((c) => pts(c, ctx) >= 10))) {
    return masters.reduce((a, b) => (pts(b, ctx) > pts(a, ctx) ? b : a));
  }

  // Otherwise lead a low card from a side suit, avoiding unguarded tens.
  const side = legal.filter((c) => !isTrump(c, ctx));
  if (side.length > 0) {
    const safe = side.filter((c) => pts(c, ctx) < 10);
    return lowest(safe.length ? safe : side, ctx);
  }
  return lowest(legal, ctx);
}

function chooseFollow(ctx, legal) {
  const { trick, trump, rules } = ctx;
  const led = suitOf(trick[0].card);
  const best = trick[trickWinnerIndex(trick, trump, rules)];
  const last = trick.length === 3;
  const partnerWinning = best.seat === partnerOf(ctx.seat);
  const trickPts = trick.reduce((s, t) => s + pts(t.card, ctx), 0);

  if (partnerWinning) {
    const secure = last || (isMaster(best.card, ctx) && (isTrump(best.card, ctx) || trumpsOutstanding(ctx) === 0 || suitOf(best.card) === led && trick.length === 2));
    if (secure) {
      // Give points to the partner, but keep master cards and big trumps.
      const give = legal.filter((c) => !isTrump(c, ctx) && !(isMaster(c, ctx) && suitOf(c) !== led));
      const pool = give.length ? give : legal.filter((c) => !isTrump(c, ctx));
      if (pool.length) return pool.reduce((a, b) => (pts(b, ctx) > pts(a, ctx) ? b : a));
    }
    return lowest(legal, ctx);
  }

  const winners = legal.filter((c) => beats(c, best.card, led, trump, rules));
  if (winners.length === 0) return lowest(legal, ctx);

  if (last) {
    // Win as cheaply as possible, preferring not to spend a trump.
    const nonTrump = winners.filter((c) => !isTrump(c, ctx));
    const pool = nonTrump.length ? nonTrump : winners;
    if (trickPts === 0 && pool === winners && isTrump(pool[0], ctx) && legal.some((c) => !winners.includes(c))) return lowest(legal, ctx);
    return pool.reduce((a, b) => (str(b, ctx) < str(a, ctx) ? b : a));
  }

  // Not last: win with a master if we have one, otherwise go low.
  const masterWin = winners.filter((c) => isMaster(c, ctx));
  if (masterWin.length) {
    if (isTrump(masterWin[0], ctx) && trickPts < 10 && legal.some((c) => !winners.includes(c))) return lowest(legal, ctx);
    return masterWin.reduce((a, b) => (pts(b, ctx) > pts(a, ctx) ? b : a));
  }
  if (winners.some((c) => isTrump(c, ctx)) && suitOf(best.card) !== trump && led !== trump) {
    // Ruff with the lowest trump that wins.
    return winners.filter((c) => isTrump(c, ctx)).reduce((a, b) => (str(b, ctx) < str(a, ctx) ? b : a));
  }
  return lowest(legal, ctx);
}
