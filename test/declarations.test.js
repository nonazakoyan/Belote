import test from 'node:test';
import assert from 'node:assert/strict';
import { BAZAR_BLOT as R } from '../src/rules/config.js';
import { NO_TRUMP } from '../src/cards.js';
import { findMelds, bestMeldSet, resolveDeclarations, validateMeld, hasBela } from '../src/rules/declarations.js';
import { c, suit } from './helpers.js';

const pts = (melds) => melds.map((m) => m.points).sort((a, b) => a - b);

test('sequences: terz 20, fifty 50, hundred 100', () => {
  assert.deepEqual(pts(findMelds(c('7S 8S 9S KD'), suit('H'), R)), [20]);
  assert.deepEqual(pts(findMelds(c('10D JD QD KD'), suit('H'), R)), [50]);
  assert.deepEqual(pts(findMelds(c('9C 10C JC QC KC AC'), suit('H'), R)), [100]);
  assert.deepEqual(pts(findMelds(c('7S 8S 10S JS'), suit('H'), R)), []);
});

test('four of a kind in a trump game', () => {
  const T = suit('H');
  assert.deepEqual(pts(findMelds(c('JS JH JD JC'), T, R)), [200]);
  assert.deepEqual(pts(findMelds(c('9S 9H 9D 9C'), T, R)), [140]);
  assert.deepEqual(pts(findMelds(c('AS AH AD AC'), T, R)), [100]);
  assert.deepEqual(pts(findMelds(c('8S 8H 8D 8C'), T, R)), []);
});

test('four of a kind in no-trump', () => {
  assert.deepEqual(pts(findMelds(c('AS AH AD AC'), NO_TRUMP, R)), [190]);
  assert.deepEqual(pts(findMelds(c('JS JH JD JC'), NO_TRUMP, R)), [100]);
  assert.deepEqual(pts(findMelds(c('9S 9H 9D 9C'), NO_TRUMP, R)), []);
  assert.deepEqual(pts(findMelds(c('7S 7H 7D 7C'), NO_TRUMP, R)), []);
});

test('a card is used in only one declaration', () => {
  // Four jacks (200) and a J-Q-K terz share JS: keep the four of a kind.
  const melds = findMelds(c('JS JH JD JC QS KS'), suit('H'), R);
  assert.equal(melds.length, 2);
  assert.deepEqual(pts(bestMeldSet(melds, R)), [200]);
});

test('only the team with the best declaration scores, and it scores all of its own', () => {
  const T = suit('H');
  const m = (s) => bestMeldSet(findMelds(c(s), T, R), R);
  const res = resolveDeclarations([m('7S 8S 9S'), m('10D JD QD KD'), m('7C 8C 9C'), []], T, R);
  assert.equal(res.team, 1);
  assert.deepEqual(res.points, [0, 50]);
  const res2 = resolveDeclarations([m('7S 8S 9S'), m('7D 8D 9D'), m('QC KC AC'), []], T, R);
  assert.equal(res2.team, 0); // higher top card wins the tie
  assert.deepEqual(res2.points, [40, 0]);
});

test('equal sequences: trump sequence wins, otherwise nobody scores', () => {
  const T = suit('H');
  const m = (s) => bestMeldSet(findMelds(c(s), T, R), R);
  assert.equal(resolveDeclarations([m('7S 8S 9S'), m('7H 8H 9H'), [], []], T, R).team, 1);
  const tie = resolveDeclarations([m('7S 8S 9S'), m('7D 8D 9D'), [], []], T, R);
  assert.equal(tie.team, null);
  assert.deepEqual(tie.points, [0, 0]);
});

test('validateMeld and bela', () => {
  assert.ok(validateMeld(c('7S 8S 9S'), c('7S 8S 9S AH'), suit('H'), R));
  assert.equal(validateMeld(c('7S 8S 10S'), c('7S 8S 10S AH'), suit('H'), R), null);
  assert.ok(hasBela(c('KH QH 7S'), suit('H'), R));
  assert.ok(!hasBela(c('KH QH 7S'), NO_TRUMP, R));
});
