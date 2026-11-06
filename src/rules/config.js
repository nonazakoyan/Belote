// Armenian Bazar Blot rules, as agreed in the plan document.
// Every rule the bot and the engine follow lives here, so a house rule is a
// one-line change. Pass overrides to decide(state, { rules: {...} }) or put a
// "rules" object in the state.

export const BAZAR_BLOT = Object.freeze({
  name: 'bazar-blot',

  // Seats are numbered 0..3. Partners are 0+2 and 1+3.
  // 'clockwise' means the next seat is seat + 1.
  direction: 'clockwise',
  cardsPerPlayer: 8,

  // Card order, highest first, and points per card.
  trumpOrder: ['J', '9', 'A', '10', 'K', 'Q', '8', '7'],
  plainOrder: ['A', '10', 'K', 'Q', 'J', '9', '8', '7'],
  noTrumpOrder: ['A', '10', 'K', 'Q', 'J', '9', '8', '7'],
  trumpPoints: { J: 20, 9: 14, A: 11, 10: 10, K: 4, Q: 3, 8: 0, 7: 0 },
  plainPoints: { A: 11, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 },
  noTrumpPoints: { A: 19, 10: 10, K: 4, Q: 3, J: 2, 9: 0, 8: 0, 7: 0 },
  lastTrickBonus: 10,

  // Bidding (the bazar). Bids are in tens: 8 means 80 points.
  minBid: 8,
  maxBid: 24,
  kapotBidValue: 25, // a kapot bid outranks every number bid
  noTrumpAllowed: true,
  contraAllowed: true,
  recontraAllowed: true,
  redealIfAllPass: true,

  // Declarations.
  sequenceOrder: ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
  sequencePoints: { 3: 20, 4: 50, 5: 100 }, // 5 or more cards = 100
  fourOfAKindTrump: { J: 200, 9: 140, A: 100, 10: 100, K: 100, Q: 100 },
  fourOfAKindNoTrump: { A: 190, 10: 100, K: 100, Q: 100, J: 100 },
  sequencesInNoTrump: true,
  meldsMayShareCards: false,
  // When both teams' best declarations are exactly equal, nobody scores them.
  declarationTie: 'none',
  belaPoints: 20,
  belaInNoTrump: false,

  // Trick play.
  mustFollowSuit: true,
  mustTrump: true,
  mustOvertrump: true,
  mustOvertrumpWhenTrumpLed: true,
  // If your partner is winning the trick you don't have to trump.
  partnerWinningFreesDiscard: true,

  // Scoring.
  kapotPoints: 250,
  noTrumpMultiplier: 2,
  contraMultiplier: 2,
  recontraMultiplier: 4,
  failedContractOpponentsGetBid: true,
  // Rounding to tens: the last digit at or above this rounds up (87 -> 9, 86 -> 8).
  roundUpFrom: 7,
  targetScore: 301,
});

export function resolveRules(overrides) {
  if (!overrides || overrides === 'bazar-blot') return BAZAR_BLOT;
  if (typeof overrides !== 'object') throw new Error(`Unknown rules: ${overrides}`);
  return Object.freeze({ ...BAZAR_BLOT, ...overrides });
}
