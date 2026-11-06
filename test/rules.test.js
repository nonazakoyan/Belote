import test from 'node:test';
import assert from 'node:assert/strict';
import { BAZAR_BLOT as R } from '../src/rules/config.js';
import { parseCard, cardName, cardPoints, ALL_CARDS, NO_TRUMP } from '../src/cards.js';
import { legalCards, trickWinnerIndex } from '../src/rules/play.js';
import { dealTotal } from '../src/rules/scoring.js';
import { c, one, suit, tr } from './helpers.js';

const names = (ids) => ids.map(cardName).sort();

test('cards parse and print', () => {
  assert.equal(cardName(parseCard('10H')), '10H');
  assert.equal(cardName(parseCard('th')), '10H');
  assert.equal(cardName(parseCard('JS')), 'JS');
  assert.throws(() => parseCard('1H'));
  assert.throws(() => parseCard('JX'));
});

test('one deal is worth 162 points with trump and in no-trump', () => {
  for (const t of [0, 1, 2, 3, NO_TRUMP]) assert.equal(dealTotal(t, R), 162);
  assert.equal(cardPoints(one('AH'), NO_TRUMP, R), 19);
  assert.equal(cardPoints(one('JH'), suit('H'), R), 20);
  assert.equal(cardPoints(one('9H'), suit('H'), R), 14);
  assert.equal(cardPoints(one('JS'), suit('H'), R), 2);
  assert.equal(ALL_CARDS.length, 32);
});

test('trick winner: trump beats everything, otherwise highest of suit led', () => {
  const H = suit('H');
  assert.equal(trickWinnerIndex(tr('0:AS 1:10S 2:7H 3:KS'), H, R), 2);
  assert.equal(trickWinnerIndex(tr('0:AS 1:10S 2:7D 3:KS'), H, R), 0);
  assert.equal(trickWinnerIndex(tr('0:7H 1:AH 2:9H 3:JH'), H, R), 3);
  assert.equal(trickWinnerIndex(tr('0:9H 1:AH 2:10H 3:KH'), H, R), 0); // 9 is second-highest trump
  assert.equal(trickWinnerIndex(tr('0:JS 1:9S 2:QS 3:7S'), H, R), 2); // plain order: Q above J above 9
  assert.equal(trickWinnerIndex(tr('0:JS 1:AS 2:10S 3:KS'), NO_TRUMP, R), 1);
});

test('must follow suit', () => {
  const hand = c('7S AS JH 8D');
  assert.deepEqual(names(legalCards(hand, tr('1:KS'), suit('H'), 2, R)), ['7S', 'AS']);
});

test('must trump when out of the suit led', () => {
  const hand = c('JH 7H 8D 9C');
  assert.deepEqual(names(legalCards(hand, tr('1:KS'), suit('H'), 2, R)), ['7H', 'JH']);
});

test('must overtrump an opponent trump if possible, else any trump', () => {
  const H = suit('H');
  assert.deepEqual(names(legalCards(c('JH 7H 8D'), tr('0:KS 1:9H'), H, 2, R)), ['JH']);
  // Cannot beat the 9 with 8H/7H: still has to play a trump.
  assert.deepEqual(names(legalCards(c('8H 7H 8D'), tr('0:KS 1:9H'), H, 2, R)), ['7H', '8H']);
});

test('partner winning: no need to trump', () => {
  const hand = c('JH 7H 8D');
  // Seat 0 is the partner of seat 2 and is winning.
  assert.deepEqual(names(legalCards(hand, tr('3:KS 0:AS'), suit('H'), 2, R)), ['7H', '8D', 'JH']);
});

test('trump led: must play a higher trump if possible, even over partner', () => {
  const H = suit('H');
  assert.deepEqual(names(legalCards(c('JH 7H 8D'), tr('0:9H 1:8H'), H, 2, R)), ['JH']);
  assert.deepEqual(names(legalCards(c('AH 7H 8D'), tr('0:9H 1:8H'), H, 2, R)), ['7H', 'AH']);
});

test('no trump and cannot follow: any card', () => {
  assert.deepEqual(names(legalCards(c('8D 9C'), tr('1:KS'), suit('H'), 2, R)), ['8D', '9C']);
  assert.deepEqual(names(legalCards(c('8D 9C'), tr('1:KS'), NO_TRUMP, 2, R)), ['8D', '9C']);
});

test('leader may play any card', () => {
  assert.equal(legalCards(c('8D 9C JH'), [], suit('H'), 2, R).length, 3);
});
