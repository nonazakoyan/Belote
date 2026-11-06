import test from 'node:test';
import assert from 'node:assert/strict';
import { BAZAR_BLOT as R } from '../src/rules/config.js';
import { normalizeBid, replayBidding, legalBidOptions, contractFromAuction } from '../src/rules/bidding.js';

const bids = (list) => list.map((b) => normalizeBid(b, R));

test('bidding starts left of the dealer and goes clockwise', () => {
  const a = replayBidding([], 0, R);
  assert.equal(a.turn, 1);
  assert.throws(() => replayBidding(bids([{ seat: 2, type: 'pass' }]), 0, R), /out of turn/);
});

test('three passes after a bid end the auction', () => {
  const a = replayBidding(bids([
    { seat: 1, type: 'bid', value: 8, suit: 'H' },
    { seat: 2, type: 'bid', value: 9, suit: 'S' },
    { seat: 3, type: 'pass' }, { seat: 0, type: 'pass' }, { seat: 1, type: 'pass' },
  ]), 0, R);
  assert.equal(a.done, true);
  assert.deepEqual(contractFromAuction(a), { seat: 2, value: 9, trump: 0, kapot: false, multiplier: 1 });
});

test('bids must be higher than the last one and at least the minimum', () => {
  assert.throws(() => replayBidding(bids([{ seat: 1, type: 'bid', value: 7, suit: 'H' }]), 0, R), /between/);
  assert.throws(() => replayBidding(bids([
    { seat: 1, type: 'bid', value: 9, suit: 'H' }, { seat: 2, type: 'bid', value: 9, suit: 'S' },
  ]), 0, R), /higher/);
});

test('four passes means a redeal', () => {
  const a = replayBidding(bids([0, 1, 2, 3].map((i) => ({ seat: (i + 1) % 4, type: 'pass' }))), 0, R);
  assert.equal(a.done, true);
  assert.equal(a.allPassed, true);
});

test('contra ends the bidding; the bidding team may answer recontra', () => {
  const start = [{ seat: 1, type: 'bid', value: 10, suit: 'D' }, { seat: 2, type: 'contra' }];
  const a = replayBidding(bids(start), 0, R);
  assert.equal(a.done, false);
  assert.equal(a.turn, 3);
  const opts = legalBidOptions(a, 3, R);
  assert.equal(opts.recontra, true);
  assert.equal(opts.bid, false);
  const b = replayBidding(bids([...start, { seat: 3, type: 'recontra' }]), 0, R);
  assert.equal(b.done, true);
  assert.equal(contractFromAuction(b).multiplier, 4);
  const c = replayBidding(bids([...start, { seat: 3, type: 'pass' }]), 0, R);
  assert.equal(c.done, true);
  assert.equal(contractFromAuction(c).multiplier, 2);
});

test('cannot contra your own team', () => {
  assert.throws(() => replayBidding(bids([
    { seat: 1, type: 'bid', value: 10, suit: 'D' }, { seat: 2, type: 'pass' }, { seat: 3, type: 'contra' },
  ]), 0, R), /own team/);
});

test('kapot outranks every number bid', () => {
  const a = replayBidding(bids([{ seat: 1, type: 'bid', kapot: true, suit: 'S' }]), 0, R);
  assert.equal(a.high.value, R.kapotBidValue);
  assert.equal(legalBidOptions(a, 2, R).bid, false);
});
