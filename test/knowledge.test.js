import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledge, canHold, StateError } from '../src/bot/knowledge.js';
import { one } from './helpers.js';

const base = {
  seat: 0, dealer: 3,
  bids: [{ seat: 0, type: 'bid', value: 8, suit: 'H' }, { seat: 1, type: 'pass' }, { seat: 2, type: 'pass' }, { seat: 3, type: 'pass' }],
};

test('reads the contract from the bids', () => {
  const k = buildKnowledge({ ...base, hand: ['JH', '9H', 'AH', '7S', '8S', 'AD', 'KC', 'QC'] });
  assert.equal(k.phase, 'play');
  assert.equal(k.contract.seat, 0);
  assert.equal(k.trump, 1);
});

test('a player who does not follow suit is out of that suit; no trump either if he discards', () => {
  const k = buildKnowledge({
    ...base,
    seat: 3,
    hand: ['JH', '9H', 'AH', '7S', '8S', 'AD', 'KC'],
    played: [
      { seat: 0, card: 'QC' }, { seat: 1, card: '7D' }, { seat: 2, card: 'AC' }, { seat: 3, card: '8C' },
      { seat: 2, card: '9C' },
    ],
  });
  assert.equal(k.voids[1][3], true); // clubs
  assert.equal(k.voids[1][1], true); // hearts (trump): he discarded instead of trumping
  assert.equal(canHold(k, 1, one('10C')), false);
  assert.equal(canHold(k, 1, one('10H')), false);
  assert.equal(canHold(k, 0, one('10C')), true);
});

test('a trump that does not beat the trump on the table caps that player\'s trumps', () => {
  const k = buildKnowledge({
    ...base,
    seat: 2,
    hand: ['JH', 'AH', '7S', '8S', 'AD', 'KC', 'QC', '10S'],
    played: [{ seat: 0, card: '9H' }, { seat: 1, card: '7H' }],
  });
  assert.equal(canHold(k, 1, one('10H')), true); // 10H is below 9H
  assert.equal(canHold(k, 1, one('JH')), false);
});

test('bad states give clear errors', () => {
  assert.throws(() => buildKnowledge({ seat: 5, dealer: 0, hand: [] }), StateError);
  assert.throws(() => buildKnowledge({ ...base, hand: ['JH', 'JH'] }), /twice/);
  assert.throws(() => buildKnowledge({ ...base, hand: ['JH', '9H', 'AH', '7S', '8S', 'AD', 'KC', 'QC'], played: [{ seat: 1, card: '7D' }] }), /out of turn/);
  assert.throws(() => buildKnowledge({ seat: 2, dealer: 0, hand: ['JH', '9H', 'AH', '7S', '8S', 'AD', 'KC', 'QC'], bids: [] }), /turn to bid/);
});
