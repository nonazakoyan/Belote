import { NO_TRUMP, suitOf, cardStrength, partnerOf } from '../cards.js';

// Does card a beat card b, given the suit that was led?
export function beats(a, b, led, trump, rules) {
  const sa = suitOf(a);
  const sb = suitOf(b);
  if (sa === sb) return cardStrength(a, trump, rules) > cardStrength(b, trump, rules);
  if (trump !== NO_TRUMP) {
    if (sa === trump) return true;
    if (sb === trump) return false;
  }
  return sa === led;
}

// trick: array of { seat, card } in play order. Returns the index of the winning entry.
export function trickWinnerIndex(trick, trump, rules) {
  const led = suitOf(trick[0].card);
  let best = 0;
  for (let i = 1; i < trick.length; i++) {
    if (beats(trick[i].card, trick[best].card, led, trump, rules)) best = i;
  }
  return best;
}

// The cards `seat` may play from `hand` onto the current `trick`.
export function legalCards(hand, trick, trump, seat, rules) {
  if (trick.length === 0) return hand.slice();
  const led = suitOf(trick[0].card);
  const best = trick[trickWinnerIndex(trick, trump, rules)];
  const bestCard = best.card;

  const follow = rules.mustFollowSuit ? hand.filter((c) => suitOf(c) === led) : [];
  if (follow.length > 0) {
    if (led === trump && rules.mustOvertrumpWhenTrumpLed) {
      const higher = follow.filter((c) => beats(c, bestCard, led, trump, rules));
      if (higher.length > 0) return higher;
    }
    return follow;
  }

  if (trump === NO_TRUMP || !rules.mustTrump) return hand.slice();
  const trumps = hand.filter((c) => suitOf(c) === trump);
  if (trumps.length === 0) return hand.slice();
  if (rules.partnerWinningFreesDiscard && best.seat === partnerOf(seat)) return hand.slice();

  if (rules.mustOvertrump && suitOf(bestCard) === trump) {
    const higher = trumps.filter((c) => beats(c, bestCard, led, trump, rules));
    if (higher.length > 0) return higher;
  }
  return trumps;
}

export function isLegal(card, hand, trick, trump, seat, rules) {
  return legalCards(hand, trick, trump, seat, rules).includes(card);
}
