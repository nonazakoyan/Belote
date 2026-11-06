// A fast, undoable model of the card play, used for playouts and the endgame solver.
import { cardPoints, teamOf, nextSeat } from '../cards.js';
import { trickWinnerIndex, legalCards } from '../rules/play.js';

export class Sim {
  // hands: 4 arrays of card ids (copied). trick: current { seat, card } list. points/tricksWon: so far.
  constructor({ rules, trump, hands, leader, trick = [], points = [0, 0], tricksWon = [0, 0], played }) {
    this.rules = rules;
    this.trump = trump;
    this.hands = hands.map((h) => h.slice());
    this.leader = leader;
    this.trick = trick.map((t) => ({ seat: t.seat, card: t.card }));
    this.points = points.slice();
    this.tricksWon = tricksWon.slice();
    this.played = played ? Uint8Array.from(played) : new Uint8Array(32);
    this.totalTricks = rules.cardsPerPlayer;
    this.stack = [];
  }

  get tricksDone() { return this.tricksWon[0] + this.tricksWon[1]; }
  get done() { return this.tricksDone === this.totalTricks; }
  get tricksLeft() { return this.totalTricks - this.tricksDone; }

  get turn() {
    let s = this.leader;
    for (let i = 0; i < this.trick.length; i++) s = nextSeat(s, this.rules);
    return s;
  }

  legal() {
    const seat = this.turn;
    return legalCards(this.hands[seat], this.trick, this.trump, seat, this.rules);
  }

  play(card) {
    const seat = this.turn;
    const hand = this.hands[seat];
    const idx = hand.indexOf(card);
    hand[idx] = hand[hand.length - 1];
    hand.pop();
    this.played[card] = 1;
    this.trick.push({ seat, card });
    const rec = { seat, card, idx, finished: null };
    if (this.trick.length === 4) {
      const winner = this.trick[trickWinnerIndex(this.trick, this.trump, this.rules)].seat;
      const team = teamOf(winner);
      let pts = 0;
      for (const t of this.trick) pts += cardPoints(t.card, this.trump, this.rules);
      if (this.tricksDone === this.totalTricks - 1) pts += this.rules.lastTrickBonus;
      rec.finished = { trick: this.trick, leader: this.leader, team, pts };
      this.points[team] += pts;
      this.tricksWon[team]++;
      this.trick = [];
      this.leader = winner;
    }
    this.stack.push(rec);
  }

  undo() {
    const rec = this.stack.pop();
    if (rec.finished) {
      const f = rec.finished;
      this.points[f.team] -= f.pts;
      this.tricksWon[f.team]--;
      this.trick = f.trick;
      this.leader = f.leader;
    }
    this.trick.pop();
    this.played[rec.card] = 0;
    const hand = this.hands[rec.seat];
    if (rec.idx === hand.length) hand.push(rec.card);
    else { hand.push(hand[rec.idx]); hand[rec.idx] = rec.card; }
  }

  // Final card points for `team`, counting kapot.
  finalPoints(team) {
    if (this.tricksWon[team] === this.totalTricks) return this.rules.kapotPoints;
    if (this.tricksWon[1 - team] === this.totalTricks) return 0;
    return this.points[team];
  }
}
