#!/usr/bin/env node
// Bot-vs-bot arena. Every deal is played twice with the teams swapping seats
// (same cards), so luck of the deal cancels out.
//
//   node scripts/simulate.js --deals 200 --a strong --b rules --samples 60
//   node scripts/simulate.js --games 20 --target 101
import { decide, BAZAR_BLOT } from '../src/index.js';
import { playDeal, playMatch } from '../src/engine/match.js';
import { dealHands } from '../src/engine/deal.js';
import { makeRng } from '../src/rng.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
  return acc;
}, []));

const deals = Number(args.deals ?? 100);
const games = Number(args.games ?? 0);
const samples = args.samples !== undefined ? Number(args.samples) : null;
const timeMs = Number(args.timeMs ?? (samples ? 0 : 400));
const seed = Number(args.seed ?? 1);

function player(level) {
  const opts = { level, timeMs, bidSamples: Number(args.bidSamples ?? 80) };
  if (samples) { opts.minSamples = samples; opts.maxSamples = samples; }
  return (view) => decide(view, opts);
}

const A = player(args.a ?? 'strong');
const B = player(args.b ?? 'rules');
const times = [];
const onMove = ({ ms, phase, seat }, isA) => { if (isA(seat) && phase === 'play') times.push(ms); };

function percentile(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * p))];
}

let diff = 0;
let played = 0;
let aWins = 0;
let bWins = 0;
const t0 = Date.now();
for (let i = 0; i < deals; i++) {
  const hands = dealHands(makeRng(seed * 100003 + i), BAZAR_BLOT);
  const dealer = i % 4;
  for (const aSeats of [[0, 2], [1, 3]]) {
    const isA = (s) => aSeats.includes(s);
    const players = [0, 1, 2, 3].map((s) => (isA(s) ? A : B));
    const { deal, redeal } = playDeal({
      players, dealer, rules: BAZAR_BLOT, rng: makeRng(i), hands, onMove: (m) => onMove(m, isA),
    });
    if (redeal) continue;
    const aTeam = aSeats[0] % 2;
    const d = deal.result.units[aTeam] - deal.result.units[1 - aTeam];
    diff += d;
    played++;
    if (d > 0) aWins++;
    else if (d < 0) bWins++;
  }
  if ((i + 1) % 25 === 0) process.stderr.write(`  ${i + 1}/${deals} deals\n`);
}

const report = {
  a: args.a ?? 'strong',
  b: args.b ?? 'rules',
  settings: { samples: samples ?? 'time-based', timeMs },
  dealsPlayed: played,
  avgUnitsPerDealForA: +(diff / Math.max(1, played)).toFixed(2),
  dealsWonByA: aWins,
  dealsWonByB: bWins,
  decisionMs: { avg: +(times.reduce((s, x) => s + x, 0) / Math.max(1, times.length)).toFixed(1), p95: +percentile(times, 0.95).toFixed(1), max: +percentile(times, 1).toFixed(1) },
  seconds: Math.round((Date.now() - t0) / 1000),
};

if (games > 0) {
  let wins = 0;
  const target = Number(args.target ?? BAZAR_BLOT.targetScore);
  for (let g = 0; g < games; g++) {
    const aSeats = g % 2 === 0 ? [0, 2] : [1, 3];
    const players = [0, 1, 2, 3].map((s) => (aSeats.includes(s) ? A : B));
    const res = playMatch({ players, rules: BAZAR_BLOT, seed: seed * 7919 + g, targetScore: target, dealer: g % 4 });
    if (res.winner === aSeats[0] % 2) wins++;
  }
  report.games = { played: games, target, wonByA: wins, winRateA: +(wins / games).toFixed(3) };
}

console.log(JSON.stringify(report, null, 2));
