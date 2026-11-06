import { parseCard, parseSuit } from '../src/cards.js';
export const c = (s) => s.split(/\s+/).filter(Boolean).map(parseCard);
export const one = (s) => parseCard(s);
export const suit = parseSuit;
// Trick from "seat:card" pairs, e.g. tr('0:7S 1:AS')
export const tr = (s) => s.split(/\s+/).filter(Boolean).map((p) => {
  const [seat, card] = p.split(':');
  return { seat: Number(seat), card: parseCard(card) };
});
