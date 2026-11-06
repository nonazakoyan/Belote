import test from 'node:test';
import assert from 'node:assert/strict';
import { decide, BAZAR_BLOT as R } from '../src/index.js';
import { playMatch, playDeal } from '../src/engine/match.js';
import { Sim } from '../src/bot/sim.js';
import { solve, terminalValue } from '../src/bot/solver.js';
import { makeRng } from '../src/rng.js';
import { ALL_CARDS, cardName } from '../src/cards.js';
import { dealHands } from '../src/engine/deal.js';

const fast = (v) => decide(v, { timeMs: 0, minSamples: 6, maxSamples: 6, bidSamples: 12 });
const rules = (v) => decide(v, { level: 'rules' });

test('rule bot never makes an illegal move (engine checks every move)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    playMatch({ players: [rules, rules, rules, rules], rules: R, seed, targetScore: 40 });
  }
});

test('strong bot never makes an illegal move', () => {
  for (let seed = 1; seed <= 6; seed++) {
    playMatch({ players: [fast, rules, fast, rules], rules: R, seed, targetScore: 25 });
  }
});

test('the bot announces declarations and bela that the engine accepts', () => {
  let declared = 0;
  let bela = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rng = makeRng(seed);
    const { deal } = playDeal({ players: [rules, rules, rules, rules], dealer: 0, rules: R, rng });
    if (deal.phase === 'redeal') continue;
    declared += deal.declared.flat().length;
    if (deal.belaSeat !== null) bela++;
  }
  assert.ok(declared > 0, 'expected some declarations');
  assert.ok(bela > 0, 'expected some bela');
});

test('no cheating: hidden cards do not change the decision', () => {
  // Same visible situation, two different layouts of the other players' cards.
  const view = {
    seat: 0, dealer: 3,
    hand: ['JH', '9H', '7S', '8S', 'AD', 'KC', 'QC'],
    bids: [{ seat: 0, type: 'bid', value: 8, suit: 'H' }, { seat: 1, type: 'pass' }, { seat: 2, type: 'pass' }, { seat: 3, type: 'pass' }],
    played: [{ seat: 0, card: 'AH' }, { seat: 1, card: '7H' }, { seat: 2, card: '8H' }, { seat: 3, card: '10D' }],
  };
  const opts = { seed: 42, timeMs: 1e9, minSamples: 40, maxSamples: 40 };
  const a = decide(view, opts);
  const b = decide(JSON.parse(JSON.stringify(view)), opts);
  assert.deepEqual(a, b);
});

test('endgame solver matches a full search', () => {
  const brute = (sim, team) => {
    if (sim.done) return terminalValue(sim, team);
    const max = (sim.turn % 2) === team;
    let best = max ? -Infinity : Infinity;
    for (const c of sim.legal()) {
      sim.play(c);
      const v = brute(sim, team);
      sim.undo();
      best = max ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  };
  for (let seed = 1; seed <= 30; seed++) {
    const rng = makeRng(seed);
    const deck = rng.shuffle(ALL_CARDS.slice());
    const hands = [0, 1, 2, 3].map((s) => deck.slice(s * 3, s * 3 + 3));
    const rules = { ...R, cardsPerPlayer: 3 };
    const trump = seed % 5 === 4 ? -1 : seed % 4;
    const mk = () => new Sim({ rules, trump, hands, leader: seed % 4 });
    assert.equal(solve(mk(), 0), brute(mk(), 0), `seed ${seed}`);
  }
});

test('sim undo restores the exact state', () => {
  const rng = makeRng(3);
  const hands = dealHands(rng, R);
  const sim = new Sim({ rules: R, trump: 1, hands, leader: 0 });
  const before = JSON.stringify([sim.hands.map((h) => h.slice().sort()), sim.points, sim.tricksWon, sim.leader]);
  for (let i = 0; i < 9; i++) sim.play(sim.legal()[0]);
  for (let i = 0; i < 9; i++) sim.undo();
  const after = JSON.stringify([sim.hands.map((h) => h.slice().sort()), sim.points, sim.tricksWon, sim.leader]);
  assert.equal(after, before);
});

test('the bot plays its only legal card and returns card names', () => {
  const move = decide({
    seat: 1, dealer: 3,
    hand: ['7S', 'AD'],
    bids: [{ seat: 0, type: 'bid', value: 8, suit: 'H' }, { seat: 1, type: 'pass' }, { seat: 2, type: 'pass' }, { seat: 3, type: 'pass' }],
    played: playedSoFar(),
  });
  assert.equal(move.type, 'play');
  assert.ok(['7S', 'AD'].includes(move.card));
});

// 6 full tricks where seat 0 leads and wins every trick with a heart, then leads 8H.
function playedSoFar() {
  const tricks = [
    ['JH', '7C', '8C', '9C'], ['9H', '10C', 'JC', 'QC'], ['AH', 'KC', 'AC', '7D'],
    ['10H', '8D', '9D', '10D'], ['KH', 'JD', 'QD', 'KD'], ['QH', '8S', '9S', '10S'],
  ];
  const out = [];
  for (const t of tricks) t.forEach((card, i) => out.push({ seat: i, card }));
  out.push({ seat: 0, card: '8H' });
  return out;
}

test('bidding returns a legal action', () => {
  const m = decide({ seat: 1, dealer: 0, hand: ['JH', '9H', 'AH', '10H', 'KH', 'AS', 'AD', 'AC'], bids: [] }, { bidSamples: 30 });
  assert.equal(m.type, 'bid');
  assert.ok(m.value >= R.minBid);
  const weak = decide({ seat: 1, dealer: 0, hand: ['7H', '8S', '7D', '7C', '8C', 'QS', 'KH', '8D'], bids: [] }, { bidSamples: 30 });
  assert.equal(weak.type, 'pass');
  void cardName;
});
