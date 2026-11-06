// A reference implementation of one Bazar Blot deal. The simulator and the tests use it
// to drive bots, and it shows the game developers exactly what state the bot expects.
import {
  ALL_CARDS, NO_TRUMP, RANKS, cardName, parseCard, suitOf, makeCard, suitName, teamOf, nextSeat,
} from '../cards.js';
import { legalCards, trickWinnerIndex } from '../rules/play.js';
import { validateMeld, resolveDeclarations } from '../rules/declarations.js';
import { normalizeBid, replayBidding, contractFromAuction, isBidLegal, bidToJSON } from '../rules/bidding.js';
import { cardPointsByTeam, scoreDeal } from '../rules/scoring.js';

export function dealHands(rng, rules) {
  const deck = rng.shuffle(ALL_CARDS.slice());
  const n = rules.cardsPerPlayer;
  return [0, 1, 2, 3].map((i) => deck.slice(i * n, (i + 1) * n));
}

export class Deal {
  constructor({ dealer, hands, rules, matchScore = [0, 0] }) {
    this.rules = rules;
    this.dealer = dealer;
    this.hands = hands.map((h) => h.slice());
    this.startHands = hands.map((h) => h.slice());
    this.matchScore = matchScore.slice();
    this.bids = [];
    this.auction = replayBidding([], dealer, rules);
    this.phase = 'bidding';
    this.contract = null;
    this.played = []; // { seat, card, bela? }
    this.trick = []; // current trick: { seat, card }
    this.tricks = []; // finished: { winner, cards, plays }
    this.leader = nextSeat(dealer, rules);
    this.declared = [[], [], [], []];
    this.shown = []; // declarations shown to everyone after the first trick
    this.declarationResult = null;
    this.belaSeat = null;
    this.result = null;
  }

  get turn() {
    if (this.phase === 'bidding') return this.auction.turn;
    if (this.phase === 'play') {
      let s = this.leader;
      for (let i = 0; i < this.trick.length; i++) s = nextSeat(s, this.rules);
      return s;
    }
    return null;
  }

  // What a player in `seat` is allowed to know, in the bot's input format.
  viewFor(seat) {
    const view = {
      seat,
      dealer: this.dealer,
      hand: this.hands[seat].map(cardName),
      bids: this.bids.map((b) => ({ seat: b.seat, ...bidToJSON(b) })),
      matchScore: this.matchScore.slice(),
    };
    if (this.contract) {
      view.contract = {
        seat: this.contract.seat,
        value: this.contract.value,
        suit: suitName(this.contract.trump),
        kapot: this.contract.kapot,
        multiplier: this.contract.multiplier,
      };
      view.played = this.played.map((p) => (p.bela ? { seat: p.seat, card: cardName(p.card), bela: true } : { seat: p.seat, card: cardName(p.card) }));
      view.declarations = this.shown.map((d) => ({ seat: d.seat, cards: d.cards.map(cardName) }));
    }
    return view;
  }

  apply(seat, move) {
    if (this.phase === 'bidding') return this.applyBid(seat, move);
    if (this.phase === 'play') return this.applyPlay(seat, move);
    throw new Error(`Deal is over (${this.phase})`);
  }

  applyBid(seat, move) {
    const bid = normalizeBid({ ...move, seat }, this.rules);
    if (!isBidLegal(bid, this.auction, this.rules)) throw new Error(`Illegal bid from seat ${seat}: ${JSON.stringify(move)}`);
    this.bids.push(bid);
    this.auction = replayBidding(this.bids, this.dealer, this.rules);
    if (this.auction.done) {
      if (this.auction.allPassed) this.phase = 'redeal';
      else {
        this.contract = contractFromAuction(this.auction);
        this.phase = 'play';
      }
    }
  }

  applyPlay(seat, move) {
    if (seat !== this.turn) throw new Error(`Seat ${seat} played out of turn`);
    if (!move || move.type !== 'play') throw new Error(`Expected a play move from seat ${seat}`);
    const card = parseCard(move.card);
    const hand = this.hands[seat];
    const trump = this.contract.trump;
    const legal = legalCards(hand, this.trick, trump, seat, this.rules);
    if (!legal.includes(card)) {
      throw new Error(`Illegal card ${move.card} from seat ${seat}; legal: ${legal.map(cardName).join(' ')}`);
    }

    // Declarations are announced with the first card.
    if (this.tricks.length === 0 && Array.isArray(move.declarations) && move.declarations.length) {
      const used = new Set();
      for (const d of move.declarations) {
        const cards = d.cards.map(parseCard);
        const meld = validateMeld(cards, hand, trump, this.rules);
        if (!meld) throw new Error(`Invalid declaration from seat ${seat}: ${d.cards.join(' ')}`);
        if (!this.rules.meldsMayShareCards && cards.some((c) => used.has(c))) throw new Error('Declarations share a card');
        cards.forEach((c) => used.add(c));
        this.declared[seat].push(meld);
      }
    }

    let bela = false;
    if (move.bela && trump !== NO_TRUMP && suitOf(card) === trump) {
      const k = makeCard(trump, RANKS.indexOf('K'));
      const q = makeCard(trump, RANKS.indexOf('Q'));
      if ((card === k && hand.includes(q)) || (card === q && hand.includes(k))) {
        bela = true;
        this.belaSeat = seat;
      }
    }

    hand.splice(hand.indexOf(card), 1);
    this.trick.push({ seat, card });
    this.played.push(bela ? { seat, card, bela } : { seat, card });

    if (this.trick.length === 4) {
      const winner = this.trick[trickWinnerIndex(this.trick, trump, this.rules)].seat;
      this.tricks.push({ winner, cards: this.trick.map((p) => p.card), plays: this.trick });
      this.trick = [];
      this.leader = winner;
      if (this.tricks.length === 1) this.resolveDeclarations();
      if (this.tricks.length === this.rules.cardsPerPlayer) this.finish();
    }
  }

  resolveDeclarations() {
    const res = resolveDeclarations(this.declared, this.contract.trump, this.rules);
    this.declarationResult = res;
    if (res.team !== null) {
      for (let s = 0; s < 4; s++) {
        if (teamOf(s) !== res.team) continue;
        for (const m of this.declared[s]) this.shown.push({ seat: s, cards: m.cards, meld: m });
      }
    }
  }

  finish() {
    const trump = this.contract.trump;
    const cards = cardPointsByTeam(this.tricks, trump, this.rules);
    const decl = this.declarationResult ? this.declarationResult.points : [0, 0];
    const bela = [0, 0];
    if (this.belaSeat !== null) bela[teamOf(this.belaSeat)] = this.rules.belaPoints;
    this.result = { ...scoreDeal(this.contract, cards, decl, bela, this.rules), cards, decl, bela };
    this.phase = 'done';
  }
}

