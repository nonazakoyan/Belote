// Turns the JSON state from the game into what the bot knows, and checks it for mistakes.
// The bot only ever uses what a human in that seat could see.
import {
  NO_TRUMP, RANKS, parseCard, parseSuit, suitOf, makeCard, partnerOf, cardStrength, nextSeat, ALL_CARDS,
} from '../cards.js';
import { resolveRules } from '../rules/config.js';
import { normalizeBid, replayBidding, contractFromAuction } from '../rules/bidding.js';
import { beats, trickWinnerIndex } from '../rules/play.js';

export class StateError extends Error {}

function check(cond, msg) {
  if (!cond) throw new StateError(msg);
}

function parseSeat(v, name) {
  check(Number.isInteger(v) && v >= 0 && v <= 3, `"${name}" must be a seat number 0-3, got ${JSON.stringify(v)}`);
  return v;
}

function parseCards(list, name) {
  check(Array.isArray(list), `"${name}" must be an array of cards`);
  const out = [];
  for (const t of list) {
    let c;
    try { c = parseCard(t); } catch (e) { throw new StateError(`${name}: ${e.message}`); }
    check(!out.includes(c), `${name}: card ${t} appears twice`);
    out.push(c);
  }
  return out;
}

export function buildKnowledge(state, rulesOverride) {
  check(state && typeof state === 'object', 'State must be a JSON object');
  let rules;
  try { rules = resolveRules(rulesOverride ?? state.rules); } catch (e) { throw new StateError(e.message); }
  const seat = parseSeat(state.seat, 'seat');
  const dealer = parseSeat(state.dealer, 'dealer');
  const hand = parseCards(state.hand ?? [], 'hand');

  let bids;
  let auction;
  try {
    bids = (state.bids ?? []).map((b) => normalizeBid(b, rules));
    auction = replayBidding(bids, dealer, rules);
  } catch (e) {
    throw new StateError(`bids: ${e.message}`);
  }

  let contract = null;
  if (state.contract) {
    const c = state.contract;
    let trump;
    try { trump = parseSuit(c.suit ?? c.trump); } catch (e) { throw new StateError(`contract: ${e.message}`); }
    const kapot = !!c.kapot || c.value === 'kapot';
    contract = {
      seat: parseSeat(c.seat, 'contract.seat'),
      value: kapot ? rules.kapotBidValue : Number(c.value),
      trump,
      kapot,
      multiplier: Number(c.multiplier ?? c.contra ?? auction.multiplier ?? 1) || 1,
    };
    check(Number.isInteger(contract.value), 'contract.value must be a whole number');
  } else if (auction.done && auction.high) {
    contract = contractFromAuction(auction);
  }

  const k = {
    rules, seat, dealer, hand, bids, auction, contract,
    phase: contract ? 'play' : 'bidding',
    trump: contract ? contract.trump : null,
    matchScore: Array.isArray(state.matchScore) ? state.matchScore.slice(0, 2) : [0, 0],
  };

  if (k.phase === 'bidding') {
    check(!auction.done, 'The auction is already over; send "contract" for the play phase');
    check(auction.turn === seat, `It is seat ${auction.turn}'s turn to bid, not seat ${seat}'s`);
    check(hand.length === rules.cardsPerPlayer, `During bidding the hand must have ${rules.cardsPerPlayer} cards`);
    return k;
  }

  readPlay(k, state);
  return k;
}

function readPlay(k, state) {
  const { rules, seat, hand, trump } = k;
  const played = [];
  for (const p of state.played ?? []) {
    check(p && typeof p === 'object', 'Each entry of "played" must be { seat, card }');
    let card;
    try { card = parseCard(p.card); } catch (e) { throw new StateError(`played: ${e.message}`); }
    played.push({ seat: parseSeat(p.seat, 'played.seat'), card, bela: !!p.bela });
  }

  const playedSet = new Uint8Array(32);
  const voids = [0, 1, 2, 3].map(() => [false, false, false, false]);
  const trumpCap = [Infinity, Infinity, Infinity, Infinity];
  const playedBy = [0, 0, 0, 0];
  const tricks = [];
  let trick = [];
  let leader = nextSeat(k.dealer, rules);
  let belaSeat = null;

  for (const p of played) {
    let expected = leader;
    for (let i = 0; i < trick.length; i++) expected = nextSeat(expected, rules);
    check(p.seat === expected, `played: card ${p.card} by seat ${p.seat} is out of turn (expected seat ${expected})`);
    check(!playedSet[p.card], 'played: a card was played twice');
    check(!hand.includes(p.card), 'played: a card in your hand is listed as played');

    if (trick.length > 0) infer(p, trick, trump, rules, voids, trumpCap);
    if (p.bela) belaSeat = p.seat;

    playedSet[p.card] = 1;
    playedBy[p.seat]++;
    trick.push({ seat: p.seat, card: p.card });
    if (trick.length === 4) {
      const winner = trick[trickWinnerIndex(trick, trump, rules)].seat;
      tricks.push({ winner, cards: trick.map((t) => t.card), plays: trick });
      trick = [];
      leader = winner;
    }
  }

  let turn = leader;
  for (let i = 0; i < trick.length; i++) turn = nextSeat(turn, rules);
  check(tricks.length < rules.cardsPerPlayer, 'The deal is already finished');
  check(turn === seat, `It is seat ${turn}'s turn to play, not seat ${seat}'s`);
  check(hand.length === rules.cardsPerPlayer - playedBy[seat],
    `Hand has ${hand.length} cards, but seat ${seat} should have ${rules.cardsPerPlayer - playedBy[seat]}`);

  // Cards we know are in someone else's hand: shown declarations and announced bela.
  const known = [[], [], [], []];
  const addKnown = (s, c) => {
    if (s === seat || playedSet[c] || hand.includes(c)) return;
    if (!known[s].includes(c)) known[s].push(c);
  };
  const shown = [];
  for (const d of state.declarations ?? []) {
    const s = parseSeat(d.seat, 'declarations.seat');
    const cards = parseCards(d.cards, 'declarations.cards');
    shown.push({ seat: s, cards });
    for (const c of cards) addKnown(s, c);
  }
  if (belaSeat !== null && trump !== NO_TRUMP) {
    addKnown(belaSeat, makeCard(trump, RANKS.indexOf('K')));
    addKnown(belaSeat, makeCard(trump, RANKS.indexOf('Q')));
  }

  const remaining = [0, 1, 2, 3].map((s) => rules.cardsPerPlayer - playedBy[s]);
  const unseen = ALL_CARDS.filter((c) => !playedSet[c] && !hand.includes(c));

  Object.assign(k, {
    played, playedSet, tricks, trick, leader, voids, trumpCap, remaining, known, shown, belaSeat, unseen,
    firstTrick: tricks.length === 0,
  });
}

// What a card choice tells us about the hand of the player who made it.
function infer(p, trick, trump, rules, voids, trumpCap) {
  const led = suitOf(trick[0].card);
  const best = trick[trickWinnerIndex(trick, trump, rules)];
  const free = rules.partnerWinningFreesDiscard && best.seat === partnerOf(p.seat);
  const s = suitOf(p.card);
  const bestIsTrump = trump !== NO_TRUMP && suitOf(best.card) === trump;
  const capAt = cardStrength(best.card, trump, rules);

  if (s !== led) {
    voids[p.seat][led] = true;
    if (trump === NO_TRUMP || !rules.mustTrump || free) return;
    if (s !== trump) voids[p.seat][trump] = true;
    else if (bestIsTrump && rules.mustOvertrump && !beats(p.card, best.card, led, trump, rules)) {
      trumpCap[p.seat] = Math.min(trumpCap[p.seat], capAt);
    }
  } else if (led === trump && rules.mustOvertrumpWhenTrumpLed && !beats(p.card, best.card, led, trump, rules)) {
    trumpCap[p.seat] = Math.min(trumpCap[p.seat], capAt);
  }
}

// Can `seat` still hold card c, given what we've seen?
export function canHold(k, seat, c) {
  const s = suitOf(c);
  if (k.voids[seat][s]) return k.known[seat].includes(c);
  if (k.trump !== NO_TRUMP && s === k.trump && cardStrength(c, k.trump, k.rules) > k.trumpCap[seat]) {
    return k.known[seat].includes(c);
  }
  return true;
}
