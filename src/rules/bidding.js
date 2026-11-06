import { NO_TRUMP, parseSuit, suitName, teamOf, nextSeat } from '../cards.js';

// Internal bid: { seat, type: 'pass' | 'bid' | 'contra' | 'recontra', value, trump, kapot }
export function normalizeBid(b, rules) {
  if (!b || typeof b !== 'object') throw new Error('Each bid must be an object');
  const seat = b.seat;
  const type = b.type;
  if (type === 'bid') {
    const kapot = !!b.kapot || b.value === 'kapot';
    const trump = parseSuit(b.suit ?? b.trump);
    const value = kapot ? rules.kapotBidValue : Number(b.value);
    if (!Number.isInteger(value)) throw new Error(`Bid value must be a whole number, got ${JSON.stringify(b.value)}`);
    return { seat, type, value, trump, kapot };
  }
  if (type === 'pass' || type === 'contra' || type === 'recontra') return { seat, type };
  throw new Error(`Unknown bid type "${type}"`);
}

export function bidToJSON(b) {
  if (b.type !== 'bid') return { type: b.type };
  const out = { type: 'bid', value: b.value, suit: suitName(b.trump) };
  if (b.kapot) out.kapot = true;
  return out;
}

// Replays the auction. Throws on an illegal bid.
// Returns { turn, high, multiplier, done, allPassed }.
export function replayBidding(bids, dealer, rules) {
  let turn = nextSeat(dealer, rules);
  let high = null;
  let multiplier = 1;
  let passesInRow = 0;
  let done = false;
  let allPassed = false;

  for (const b of bids) {
    if (done) throw new Error('Bid after the auction ended');
    if (b.seat !== turn) throw new Error(`Seat ${b.seat} bid out of turn (expected seat ${turn})`);
    const err = bidError(b, { turn, high, multiplier }, rules);
    if (err) throw new Error(err);
    if (b.type === 'pass') {
      passesInRow++;
      if (multiplier > 1) done = true;
      else if (high && passesInRow >= 3) done = true;
      else if (!high && passesInRow >= 4) { done = true; allPassed = true; }
    } else if (b.type === 'bid') {
      high = b;
      passesInRow = 0;
      if (b.value >= rules.kapotBidValue && !rules.contraAllowed) done = true;
    } else if (b.type === 'contra') {
      multiplier = rules.contraMultiplier;
      if (!rules.recontraAllowed) done = true;
    } else if (b.type === 'recontra') {
      multiplier = rules.recontraMultiplier;
      done = true;
    }
    turn = nextSeat(turn, rules);
  }
  return { turn, high, multiplier, done, allPassed };
}

function bidError(b, st, rules) {
  const { high, multiplier } = st;
  switch (b.type) {
    case 'pass':
      return null;
    case 'bid': {
      if (multiplier > 1) return 'No new bids after contra';
      if (b.trump === NO_TRUMP && !rules.noTrumpAllowed) return 'No-trump bids are not allowed';
      if (!b.kapot && (b.value < rules.minBid || b.value > rules.maxBid)) return `Bid must be between ${rules.minBid} and ${rules.maxBid}`;
      if (high && b.value <= high.value) return `Bid ${b.value} must be higher than ${high.value}`;
      return null;
    }
    case 'contra':
      if (!rules.contraAllowed) return 'Contra is not allowed';
      if (!high) return 'Nothing to contra';
      if (multiplier > 1) return 'Already doubled';
      if (teamOf(high.seat) === teamOf(b.seat)) return "Can't contra your own team";
      return null;
    case 'recontra':
      if (!rules.recontraAllowed) return 'Recontra is not allowed';
      if (multiplier !== rules.contraMultiplier) return 'Recontra needs a contra first';
      if (teamOf(high.seat) !== teamOf(b.seat)) return 'Only the bidding team can recontra';
      return null;
    default:
      return `Unknown bid type ${b.type}`;
  }
}

// Every legal action for the seat to move: { pass, minBid, maxBid, contra, recontra }.
export function legalBidOptions(auction, seat, rules) {
  const { high, multiplier, done } = auction;
  if (done) return null;
  const opts = { pass: true, bid: false, minBid: null, maxBid: rules.maxBid, kapot: false, contra: false, recontra: false };
  if (multiplier === 1) {
    const min = high ? high.value + 1 : rules.minBid;
    if (min <= rules.maxBid) { opts.bid = true; opts.minBid = Math.max(min, rules.minBid); }
    opts.kapot = !high || high.value < rules.kapotBidValue;
    if (rules.contraAllowed && high && teamOf(high.seat) !== teamOf(seat)) opts.contra = true;
  } else if (multiplier === rules.contraMultiplier && rules.recontraAllowed && high && teamOf(high.seat) === teamOf(seat)) {
    opts.recontra = true;
  }
  return opts;
}

export function isBidLegal(bid, auction, rules) {
  if (auction.done || bid.seat !== auction.turn) return false;
  return bidError(bid, auction, rules) === null;
}

export function contractFromAuction(auction) {
  if (!auction.done || !auction.high) return null;
  const h = auction.high;
  return { seat: h.seat, value: h.value, trump: h.trump, kapot: !!h.kapot, multiplier: auction.multiplier };
}
