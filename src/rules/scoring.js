import { NO_TRUMP, ALL_CARDS, cardPoints, teamOf } from '../cards.js';

// All card points in one deal, including the last-trick bonus (162 with the default rules).
export function dealTotal(trump, rules) {
  let sum = rules.lastTrickBonus;
  for (const c of ALL_CARDS) sum += cardPoints(c, trump, rules);
  return sum;
}

export function roundPoints(raw, rules) {
  const tens = Math.floor(raw / 10);
  return raw % 10 >= rules.roundUpFrom ? tens + 1 : tens;
}

// Card points per team from finished tricks: [{ winner: seat, cards: [ids] }].
// A team that wins every trick gets kapotPoints instead of the normal total.
export function cardPointsByTeam(tricks, trump, rules) {
  const pts = [0, 0];
  const count = [0, 0];
  tricks.forEach((t, i) => {
    const team = teamOf(t.winner);
    count[team]++;
    for (const c of t.cards) pts[team] += cardPoints(c, trump, rules);
    if (i === tricks.length - 1) pts[team] += rules.lastTrickBonus;
  });
  const total = tricks.length;
  if (total > 0 && count[0] === total) return { points: [rules.kapotPoints, 0], kapotTeam: 0, tricks: count };
  if (total > 0 && count[1] === total) return { points: [0, rules.kapotPoints], kapotTeam: 1, tricks: count };
  return { points: pts, kapotTeam: null, tricks: count };
}

// contract: { seat, value, trump, kapot, multiplier }  (multiplier: 1, 2 for contra, 4 for recontra)
// cards:    result of cardPointsByTeam
// decl:     [team0, team1] declaration points (only one team can have them)
// bela:     [team0, team1] bela points
export function scoreDeal(contract, cards, decl, bela, rules) {
  const bt = teamOf(contract.seat);
  const ot = 1 - bt;
  const total = [0, 1].map((t) => cards.points[t] + decl[t] + bela[t]);
  const ntMult = contract.trump === NO_TRUMP ? rules.noTrumpMultiplier : 1;
  const mult = (contract.multiplier || 1) * ntMult;

  const made = contract.kapot ? cards.kapotTeam === bt : total[bt] >= contract.value * 10;
  const raw = [0, 0];
  if (made) {
    raw[bt] = total[bt] * mult;
    raw[ot] = total[ot] * ntMult;
  } else {
    const allCards = contract.kapot ? rules.kapotPoints : (cards.kapotTeam === ot ? rules.kapotPoints : dealTotal(contract.trump, rules));
    const bid = contract.kapot || !rules.failedContractOpponentsGetBid ? 0 : contract.value * 10;
    raw[ot] = (allCards + decl[0] + decl[1] + bela[ot] + bid) * mult;
    raw[bt] = bela[bt] * ntMult;
  }
  return { made, raw, units: raw.map((r) => roundPoints(r, rules)), totals: total };
}
