import test from 'node:test';
import assert from 'node:assert/strict';
import { BAZAR_BLOT as R } from '../src/rules/config.js';
import { NO_TRUMP } from '../src/cards.js';
import { scoreDeal, roundPoints } from '../src/rules/scoring.js';

const cards = (a, b) => ({ points: [a, b], kapotTeam: null });

test('rounding: 7 and up rounds up', () => {
  assert.equal(roundPoints(87, R), 9);
  assert.equal(roundPoints(86, R), 8);
  assert.equal(roundPoints(80, R), 8);
  assert.equal(roundPoints(0, R), 0);
});

test('contract made: both teams score their own points', () => {
  const r = scoreDeal({ seat: 0, value: 8, trump: 1, multiplier: 1 }, cards(100, 62), [20, 0], [0, 0], R);
  assert.equal(r.made, true);
  assert.deepEqual(r.raw, [120, 62]);
  assert.deepEqual(r.units, [12, 6]);
});

test('contract failed: opponents get 162 + all declarations + the bid', () => {
  const r = scoreDeal({ seat: 0, value: 10, trump: 1, multiplier: 1 }, cards(90, 72), [0, 50], [0, 0], R);
  assert.equal(r.made, false);
  assert.deepEqual(r.raw, [0, 162 + 50 + 100]);
});

test('bela always counts for whoever holds it', () => {
  const r = scoreDeal({ seat: 0, value: 12, trump: 1, multiplier: 1 }, cards(90, 72), [0, 0], [20, 0], R);
  assert.equal(r.made, false);
  assert.deepEqual(r.raw, [20, 162 + 120]);
});

test('contra doubles, recontra quadruples the winning side', () => {
  const made = scoreDeal({ seat: 1, value: 8, trump: 2, multiplier: 2 }, cards(50, 112), [0, 0], [0, 0], R);
  assert.deepEqual(made.raw, [50, 224]);
  const failed = scoreDeal({ seat: 1, value: 9, trump: 2, multiplier: 4 }, cards(80, 82), [0, 0], [0, 0], R);
  assert.deepEqual(failed.raw, [(162 + 90) * 4, 0]);
});

test('no-trump points are doubled', () => {
  const r = scoreDeal({ seat: 0, value: 8, trump: NO_TRUMP, multiplier: 1 }, cards(100, 62), [0, 0], [0, 0], R);
  assert.deepEqual(r.raw, [200, 124]);
});

test('kapot: 250 for taking every trick; failed kapot bid gives 250 to opponents', () => {
  const k = scoreDeal({ seat: 0, value: 8, trump: 0, multiplier: 1 }, { points: [250, 0], kapotTeam: 0 }, [0, 0], [0, 0], R);
  assert.deepEqual(k.raw, [250, 0]);
  const kb = scoreDeal({ seat: 0, value: 25, trump: 0, kapot: true, multiplier: 1 }, cards(150, 12), [0, 0], [0, 0], R);
  assert.equal(kb.made, false);
  assert.deepEqual(kb.raw, [0, 250]);
});
