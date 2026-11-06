// Bazar Blot bot. One call: decide(state) -> move.
// See docs/STATE_FORMAT.md for the exact input and output.
import { NO_TRUMP, RANKS, cardName, makeCard, suitOf, teamOf } from './cards.js';
import { buildKnowledge, StateError } from './bot/knowledge.js';
import { pimcCard } from './bot/pimc.js';
import { heuristicCard } from './bot/heuristic.js';
import { monteCarloBid, ruleBid } from './bot/bidding.js';
import { findMelds, bestMeldSet } from './rules/declarations.js';
import { makeRng, hashString } from './rng.js';

export { BAZAR_BLOT, resolveRules } from './rules/config.js';
export { StateError } from './bot/knowledge.js';

/**
 * Pick a move for the seat in `state`.
 * @param {object} state   what the seat can see (docs/STATE_FORMAT.md)
 * @param {object} [options]
 *   level: 'strong' (default, Monte Carlo) or 'rules' (fast rule bot)
 *   timeMs: thinking time per card, default 400
 *   seed: number for repeatable decisions (default: derived from the state)
 *   rules: rule overrides (see src/rules/config.js)
 *   explain: true to add a short "why" to the move
 */
export function decide(state, options = {}) {
  const k = buildKnowledge(state, options.rules);
  const level = options.level ?? 'strong';
  const rng = makeRng(options.seed ?? hashString(JSON.stringify(state)));

  if (k.phase === 'bidding') {
    return level === 'rules' ? ruleBid(k) : monteCarloBid(k, rng, options);
  }

  let card;
  let info = null;
  if (level === 'rules') {
    card = heuristicCard({
      hand: k.hand, trick: k.trick, trump: k.trump, seat: k.seat, rules: k.rules, played: k.playedSet, bidderTeam: teamOf(k.contract.seat),
    });
  } else {
    try {
      info = pimcCard(k, rng, options);
      card = info.card;
    } catch (e) {
      // Never leave the table hanging: fall back to the rule bot.
      card = heuristicCard({
        hand: k.hand, trick: k.trick, trump: k.trump, seat: k.seat, rules: k.rules, played: k.playedSet, bidderTeam: teamOf(k.contract.seat),
      });
      info = null;
      if (options.onError) options.onError(e);
    }
  }
  return playMove(k, card, options.explain ? info : null);
}

function playMove(k, card, info) {
  const move = { type: 'play', card: cardName(card) };

  // Announce declarations with our first card.
  if (k.firstTrick && k.hand.length === k.rules.cardsPerPlayer) {
    const melds = bestMeldSet(findMelds(k.hand, k.trump, k.rules), k.rules);
    if (melds.length) move.declarations = melds.map((m) => ({ type: m.kind, cards: m.cards.map(cardName) }));
  }

  // Bela: say it when the first of trump K and Q goes down.
  if (k.trump !== NO_TRUMP && suitOf(card) === k.trump) {
    const kc = makeCard(k.trump, RANKS.indexOf('K'));
    const qc = makeCard(k.trump, RANKS.indexOf('Q'));
    if ((card === kc && k.hand.includes(qc)) || (card === qc && k.hand.includes(kc))) move.bela = true;
  }

  if (info && info.scores) {
    move.explain = {
      samples: info.samples,
      ms: Math.round(info.ms),
      averages: Object.fromEntries(Object.entries(info.scores).map(([c, v]) => [cardName(Number(c)), Math.round(v)])),
    };
  }
  return move;
}

export function isStateError(e) {
  return e instanceof StateError;
}
