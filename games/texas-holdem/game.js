// === Seeded PRNG (platform standard) ===

var _seededRandom = function(seed) {
  var s = (seed + 0x6d2b79f5) | 0;
  var t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
var _advanceSeed = function(seed) { return (seed + 0x6d2b79f5) | 0; };
var _shuffle = function(arr, seed) {
  var result = arr.slice();
  var s = seed | 0;
  for (var i = result.length - 1; i > 0; i--) {
    s = (s + 0x6d2b79f5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    var r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    var j = Math.floor(r * (i + 1));
    var tmp = result[i]; result[i] = result[j]; result[j] = tmp;
  }
  return result;
};

// === GameLogic ===

var GameLogic = {
  // Cards as integers 0-51. rank = c % 13 (0=2..12=A), suit = floor(c / 13) (0=s,1=h,2=d,3=c)
  _R: ['2','3','4','5','6','7','8','9','T','J','Q','K','A'],
  _S: ['s','h','d','c'],
  _cv: function(c) { return { r: this._R[c % 13], s: this._S[Math.floor(c / 13)] }; },

  // --- Hand evaluation ---
  // Returns single numeric score; higher = better. Supports all 9 hand ranks.
  _eval5: function(cards) {
    var ranks = [], suits = [];
    for (var i = 0; i < 5; i++) { ranks.push(cards[i] % 13); suits.push(Math.floor(cards[i] / 13)); }
    ranks.sort(function(a, b) { return b - a; });
    var isFlush = suits[0] === suits[1] && suits[1] === suits[2] && suits[2] === suits[3] && suits[3] === suits[4];
    var unique = true;
    for (var ui = 0; ui < 4; ui++) { if (ranks[ui] === ranks[ui + 1]) { unique = false; break; } }
    var isStraight = unique && ranks[0] - ranks[4] === 4;
    var straightHi = ranks[0];
    // Wheel: A-2-3-4-5
    if (!isStraight && unique && ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) {
      isStraight = true; straightHi = 3;
    }
    var freq = {};
    for (var fi = 0; fi < 5; fi++) freq[ranks[fi]] = (freq[ranks[fi]] || 0) + 1;
    var g = [];
    for (var r in freq) g.push({ r: parseInt(r, 10), c: freq[r] });
    g.sort(function(a, b) { return b.c - a.c || b.r - a.r; });
    var B = 371293; // 13^5 — enough room per category
    if (isStraight && isFlush) return 8 * B + straightHi;
    if (g[0].c === 4) return 7 * B + g[0].r * 13 + g[1].r;
    if (g[0].c === 3 && g[1].c === 2) return 6 * B + g[0].r * 13 + g[1].r;
    if (isFlush) return 5 * B + ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4];
    if (isStraight) return 4 * B + straightHi;
    if (g[0].c === 3) return 3 * B + g[0].r * 169 + g[1].r * 13 + g[2].r;
    if (g[0].c === 2 && g[1].c === 2) {
      var hi = g[0].r > g[1].r ? g[0].r : g[1].r;
      var lo = g[0].r < g[1].r ? g[0].r : g[1].r;
      return 2 * B + hi * 169 + lo * 13 + g[2].r;
    }
    if (g[0].c === 2) return 1 * B + g[0].r * 2197 + g[1].r * 169 + g[2].r * 13 + g[3].r;
    return ranks[0] * 28561 + ranks[1] * 2197 + ranks[2] * 169 + ranks[3] * 13 + ranks[4];
  },

  // Best 5 out of 7 (pick 5, skip 2)
  _bestHand: function(seven) {
    var best = -1;
    for (var i = 0; i < 7; i++)
      for (var j = i + 1; j < 7; j++) {
        var five = [];
        for (var k = 0; k < 7; k++) if (k !== i && k !== j) five.push(seven[k]);
        var s = this._eval5(five);
        if (s > best) best = s;
      }
    return best;
  },

  _handName: function(score) {
    var n = ['High Card','Pair','Two Pair','Three of a Kind','Straight','Flush','Full House','Four of a Kind','Straight Flush'];
    return n[Math.floor(score / 371293)] || 'High Card';
  },

  // --- Table helpers ---
  _nextSeat: function(players, eliminated, fromIdx) {
    var n = players.length;
    for (var i = 1; i <= n; i++) {
      var idx = (fromIdx + i) % n;
      if (eliminated.indexOf(players[idx]) === -1) return idx;
    }
    return fromIdx;
  },

  _active: function(state) {
    return state.players.filter(function(id) { return state.eliminated.indexOf(id) === -1; });
  },

  _inHand: function(state) {
    return state.players.filter(function(id) {
      return state.eliminated.indexOf(id) === -1 && state.folded.indexOf(id) === -1;
    });
  },

  _canBet: function(state) {
    return state.players.filter(function(id) {
      return state.eliminated.indexOf(id) === -1 && state.folded.indexOf(id) === -1 && state.allIn.indexOf(id) === -1;
    });
  },

  // Current actor: scan from actSeat through needsToAct
  _actor: function(state) {
    if (!state.needsToAct || state.needsToAct.length === 0) return null;
    var n = state.players.length;
    for (var i = 0; i < n; i++) {
      var idx = (state.actSeat + i) % n;
      var id = state.players[idx];
      if (state.needsToAct.indexOf(id) !== -1) return id;
    }
    return null;
  },

  _pot: function(state) {
    var t = 0;
    for (var id in state.handBets) t += state.handBets[id] || 0;
    return t;
  },

  // --- Deal a new hand ---
  _deal: function(state) {
    var active = this._active(state);
    if (active.length <= 1) {
      return Object.assign({}, state, { gameWinner: active[0] || null, phase: 'gameover' });
    }
    var dlr = state.handNumber === 0
      ? state.players.indexOf(active[0])
      : this._nextSeat(state.players, state.eliminated, state.dealerIdx);

    var deck52 = [];
    for (var i = 0; i < 52; i++) deck52.push(i);
    var deck = _shuffle(deck52, state.nextSeed);
    var seed = _advanceSeed(state.nextSeed);

    var hc = {}, pos = 0;
    for (var ai = 0; ai < active.length; ai++) {
      hc[active[ai]] = [deck[pos], deck[pos + 1]];
      pos += 2;
    }

    // Blind positions
    var sb, bb;
    if (active.length === 2) { sb = dlr; bb = this._nextSeat(state.players, state.eliminated, dlr); }
    else { sb = this._nextSeat(state.players, state.eliminated, dlr); bb = this._nextSeat(state.players, state.eliminated, sb); }

    // Escalate blinds every 10 hands
    var newHN = state.handNumber + 1;
    var nSB = state.smallBlind, nBB = state.bigBlind;
    if (newHN > 1 && newHN % 10 === 0) { nSB = Math.min(nSB * 2, 500); nBB = Math.min(nBB * 2, 1000); }

    var chips = {};
    for (var id in state.chips) chips[id] = state.chips[id];
    var rb = {}, hb = {}, allIn = [];
    var sbId = state.players[sb], bbId = state.players[bb];
    var sbA = Math.min(nSB, chips[sbId]), bbA = Math.min(nBB, chips[bbId]);
    chips[sbId] -= sbA; rb[sbId] = sbA; hb[sbId] = sbA;
    chips[bbId] -= bbA; rb[bbId] = bbA; hb[bbId] = bbA;
    if (chips[sbId] === 0) allIn.push(sbId);
    if (chips[bbId] === 0 && allIn.indexOf(bbId) === -1) allIn.push(bbId);
    var curBet = sbA > bbA ? sbA : bbA;

    // First to act preflop: UTG (left of BB), or SB in heads-up
    var firstAct = active.length === 2 ? sb : this._nextSeat(state.players, state.eliminated, bb);
    var nta = active.filter(function(id) { return allIn.indexOf(id) === -1; });

    return {
      players: state.players, chips: chips, dealerIdx: dlr,
      phase: 'preflop', communityCards: [], holeCards: hc,
      roundBets: rb, handBets: hb, folded: [], allIn: allIn,
      actSeat: firstAct, currentBet: curBet, minRaise: nBB, needsToAct: nta,
      deck: deck, deckPos: pos, nextSeed: seed,
      handNumber: newHN, smallBlind: nSB, bigBlind: nBB,
      eliminated: state.eliminated, showdownResult: null, gameWinner: null,
      sbIdx: sb, bbIdx: bb, lastAction: {},
    };
  },

  // --- Advance after betting round completes ---
  _advance: function(state) {
    var ih = this._inHand(state);
    if (ih.length <= 1) return this._resolve(state);
    var cb = this._canBet(state);
    // If ≤1 player can still bet, run out remaining community cards
    if (cb.length <= 1 && state.phase !== 'river') return this._runOut(state);
    if (cb.length <= 1 && state.phase === 'river') return this._resolve(state);

    var cc = state.communityCards.slice(), p = state.deckPos, next;
    if (state.phase === 'preflop') { next = 'flop'; cc.push(state.deck[p], state.deck[p+1], state.deck[p+2]); p += 3; }
    else if (state.phase === 'flop') { next = 'turn'; cc.push(state.deck[p]); p += 1; }
    else if (state.phase === 'turn') { next = 'river'; cc.push(state.deck[p]); p += 1; }
    else return this._resolve(state);

    // First to act post-flop: first active bettor after dealer
    var first = state.dealerIdx;
    for (var i = 1; i <= state.players.length; i++) {
      var idx = (state.dealerIdx + i) % state.players.length;
      if (cb.indexOf(state.players[idx]) !== -1) { first = idx; break; }
    }

    return Object.assign({}, state, {
      phase: next, communityCards: cc, deckPos: p,
      roundBets: {}, currentBet: 0, minRaise: state.bigBlind,
      actSeat: first, needsToAct: cb.slice(),
    });
  },

  _runOut: function(state) {
    var cc = state.communityCards.slice(), p = state.deckPos;
    while (cc.length < 5) { cc.push(state.deck[p]); p++; }
    return this._resolve(Object.assign({}, state, { communityCards: cc, deckPos: p }));
  },

  // --- Resolve hand: award pot(s), eliminate busted players ---
  _resolve: function(state) {
    var ih = this._inHand(state);
    var chips = {};
    for (var id in state.chips) chips[id] = state.chips[id];
    var totalPot = this._pot(state);
    var result;

    if (ih.length === 1) {
      // Everyone folded
      chips[ih[0]] += totalPot;
      result = { winners: [ih[0]], byFold: true, pot: totalPot };
    } else {
      // Side pot calculation
      var allP = state.players.filter(function(id) { return state.eliminated.indexOf(id) === -1; });
      var levels = [];
      for (var i = 0; i < ih.length; i++) {
        var b = state.handBets[ih[i]] || 0;
        if (b > 0 && levels.indexOf(b) === -1) levels.push(b);
      }
      levels.sort(function(a, b) { return a - b; });

      var prev = 0, allWin = {};
      for (var li = 0; li < levels.length; li++) {
        var lv = levels[li], amt = 0;
        for (var pi = 0; pi < allP.length; pi++) {
          var bet = state.handBets[allP[pi]] || 0;
          amt += Math.min(bet, lv) - Math.min(bet, prev);
        }
        var elig = ih.filter(function(id) { return (state.handBets[id] || 0) >= lv; });
        var bestS = -1, winners = [];
        for (var ei = 0; ei < elig.length; ei++) {
          var ac = state.holeCards[elig[ei]].concat(state.communityCards);
          var sc = this._bestHand(ac);
          if (sc > bestS) { bestS = sc; winners = [elig[ei]]; }
          else if (sc === bestS) winners.push(elig[ei]);
        }
        var share = Math.floor(amt / winners.length);
        var rem = amt - share * winners.length;
        for (var wi = 0; wi < winners.length; wi++) {
          chips[winners[wi]] += share + (wi === 0 ? rem : 0);
          allWin[winners[wi]] = true;
        }
        prev = lv;
      }

      var hands = {};
      for (var hi = 0; hi < ih.length; hi++) {
        var cid = ih[hi];
        var hsc = this._bestHand(state.holeCards[cid].concat(state.communityCards));
        hands[cid] = { cards: state.holeCards[cid], handName: this._handName(hsc) };
      }
      result = { winners: Object.keys(allWin), hands: hands, pot: totalPot };
    }

    // Eliminate busted players
    var elim = state.eliminated.slice();
    for (var bi = 0; bi < state.players.length; bi++) {
      var pid = state.players[bi];
      if (elim.indexOf(pid) === -1 && chips[pid] <= 0) elim.push(pid);
    }

    // Check game-over immediately (per guide: detect in resolve, not at continue)
    var survivors = state.players.filter(function(id) { return elim.indexOf(id) === -1; });
    var gw = survivors.length <= 1 ? (survivors[0] || null) : null;

    return Object.assign({}, state, {
      phase: 'showdown', chips: chips, eliminated: elim,
      showdownResult: result, gameWinner: gw, needsToAct: [], roundBets: {},
    });
  },

  // ===== 6 Required Functions =====

  setup: function(ctx) {
    var ids = ctx.players.map(function(p) { return p.id; });
    var startChips = (ctx.config?.startingChips) || 250;
    var chips = {};
    for (var i = 0; i < ids.length; i++) chips[ids[i]] = startChips;
    return this._deal({
      players: ids, chips: chips, dealerIdx: 0, eliminated: [],
      handNumber: 0, smallBlind: 10, bigBlind: 20,
      nextSeed: Math.floor(ctx.random.next() * 2147483647),
      phase: 'init', communityCards: [], holeCards: {},
      roundBets: {}, handBets: {}, folded: [], allIn: [],
      actSeat: 0, currentBet: 0, minRaise: 20, needsToAct: [],
      deck: [], deckPos: 0, showdownResult: null, gameWinner: null,
      sbIdx: 0, bbIdx: 0,
    });
  },

  actions: function(state, playerId) {
    if (state.phase === 'gameover' || state.gameWinner) return [];
    if (state.phase === 'showdown') return [];
    var actor = this._actor(state);
    if (actor !== playerId) return [];

    var myBet = state.roundBets[playerId] || 0;
    var toCall = state.currentBet - myBet;
    if (toCall < 0) toCall = 0;
    var myChips = state.chips[playerId];

    // Per guide: distinct types for fixed moves, parameterize only raise
    var acts = [{ type: 'fold' }];
    if (toCall === 0) acts.push({ type: 'check' });
    else if (toCall < myChips) acts.push({ type: 'call' });
    var raiseTo = state.currentBet + state.minRaise;
    var raiseCost = raiseTo - myBet;
    if (raiseCost > 0 && raiseCost < myChips) acts.push({ type: 'raise', amount: raiseTo });
    if (myChips > 0) acts.push({ type: 'allin' });
    return acts;
  },

  perform: function(state, playerId, action) {
    // Showdown: continue to next hand — must be before __system__ guard
    // because the phase timer fires as __system__ with defaultAction: {type:'continue'}
    if (state.phase === 'showdown' && action.type === 'continue') {
      if (state.gameWinner) return state;
      return this._deal(state);
    }

    // System actions
    if (playerId === '__system__') {
      if (action.type === 'player_left') {
        var lid = action.playerId;
        var nf = state.folded.indexOf(lid) === -1 && state.eliminated.indexOf(lid) === -1
          ? state.folded.concat([lid]) : state.folded;
        var ne = state.eliminated.indexOf(lid) === -1 ? state.eliminated.concat([lid]) : state.eliminated;
        var nn = state.needsToAct.filter(function(id) { return id !== lid; });
        var nc = {}; for (var id in state.chips) nc[id] = state.chips[id]; nc[lid] = 0;
        var ns = Object.assign({}, state, { folded: nf, eliminated: ne, needsToAct: nn, chips: nc });
        if (this._inHand(ns).length <= 1) return this._resolve(ns);
        if (nn.length === 0 && state.phase !== 'showdown') return this._advance(ns);
        return ns;
      }
      return state;
    }

    var seat = state.players.indexOf(playerId);
    var nextSeat = (seat + 1) % state.players.length;

    // Track last action per player for UI display
    var withAction = function(s, label) {
      var la = Object.assign({}, state.lastAction || {});
      la[playerId] = label;
      return Object.assign({}, s, { lastAction: la });
    };

    if (action.type === 'fold') {
      var foldF = state.folded.concat([playerId]);
      var foldN = state.needsToAct.filter(function(id) { return id !== playerId; });
      var foldS = withAction(Object.assign({}, state, { folded: foldF, needsToAct: foldN, actSeat: nextSeat }), 'FOLD');
      if (this._inHand(foldS).length <= 1) return this._resolve(foldS);
      if (foldN.length === 0) return this._advance(foldS);
      return foldS;
    }
    if (action.type === 'check') {
      var checkN = state.needsToAct.filter(function(id) { return id !== playerId; });
      var checkS = withAction(Object.assign({}, state, { needsToAct: checkN, actSeat: nextSeat }), 'CHECK');
      if (checkN.length === 0) return this._advance(checkS);
      return checkS;
    }
    if (action.type === 'call') {
      var callBet = state.roundBets[playerId] || 0;
      var callCost = state.currentBet - callBet;
      var callCh = {}; for (var callId in state.chips) callCh[callId] = state.chips[callId]; callCh[playerId] -= callCost;
      var callRb = Object.assign({}, state.roundBets); callRb[playerId] = state.currentBet;
      var callHb = Object.assign({}, state.handBets); callHb[playerId] = (callHb[playerId] || 0) + callCost;
      var callN = state.needsToAct.filter(function(id) { return id !== playerId; });
      var callS = withAction(Object.assign({}, state, { chips: callCh, roundBets: callRb, handBets: callHb, needsToAct: callN, actSeat: nextSeat }), 'CALL');
      if (callN.length === 0) return this._advance(callS);
      return callS;
    }
    if (action.type === 'raise') {
      var rBet = state.roundBets[playerId] || 0;
      var raiseTo = action.amount;
      var rCost = raiseTo - rBet;
      var raiseBy = raiseTo - state.currentBet;
      var rCh = {}; for (var rId in state.chips) rCh[rId] = state.chips[rId]; rCh[playerId] -= rCost;
      var rRb = Object.assign({}, state.roundBets); rRb[playerId] = raiseTo;
      var rHb = Object.assign({}, state.handBets); rHb[playerId] = (rHb[playerId] || 0) + rCost;
      // Reopening: everyone else must act again
      var cb = this._canBet(state).filter(function(id) { return id !== playerId; });
      return withAction(Object.assign({}, state, {
        chips: rCh, roundBets: rRb, handBets: rHb,
        currentBet: raiseTo, minRaise: raiseBy > state.minRaise ? raiseBy : state.minRaise,
        needsToAct: cb, actSeat: nextSeat,
      }), 'RAISE ' + raiseTo);
    }
    if (action.type === 'allin') {
      var aBet = state.roundBets[playerId] || 0;
      var allInAmt = state.chips[playerId];
      var newTotal = aBet + allInAmt;
      var aCh = {}; for (var aId in state.chips) aCh[aId] = state.chips[aId]; aCh[playerId] = 0;
      var aRb = Object.assign({}, state.roundBets); aRb[playerId] = newTotal;
      var aHb = Object.assign({}, state.handBets); aHb[playerId] = (aHb[playerId] || 0) + allInAmt;
      var na = state.allIn.concat([playerId]);
      var aN = state.needsToAct.filter(function(id) { return id !== playerId; });
      var newCB = state.currentBet, newMR = state.minRaise;
      if (newTotal > state.currentBet) {
        var aRaiseBy = newTotal - state.currentBet;
        newCB = newTotal;
        if (aRaiseBy >= state.minRaise) {
          newMR = aRaiseBy;
          // Full raise — reopen for everyone
          aN = state.players.filter(function(id) {
            return state.eliminated.indexOf(id) === -1 && state.folded.indexOf(id) === -1 && na.indexOf(id) === -1;
          });
        }
      }
      var aS = withAction(Object.assign({}, state, {
        chips: aCh, roundBets: aRb, handBets: aHb, allIn: na,
        needsToAct: aN, currentBet: newCB, minRaise: newMR, actSeat: nextSeat,
      }), 'ALL IN');
      if (this._inHand(aS).length <= 1) return this._resolve(aS);
      if (aN.length === 0) return this._advance(aS);
      return aS;
    }
    return state;
  },

  view: function(state, playerId) {
    var self = this;
    var v = {
      phase: state.phase,
      communityCards: state.communityCards.map(function(c) { return self._cv(c); }),
      pot: this._pot(state),
      currentBet: state.currentBet,
      handNumber: state.handNumber,
      blinds: { small: state.smallBlind, big: state.bigBlind },
      gameWinner: state.gameWinner,
      currentActor: this._actor(state),
      lastAction: (function() {
        var la = state.lastAction || {};
        var actor = self._actor(state);
        if (!actor) return la;
        var filtered = {};
        for (var k in la) { if (k !== actor) filtered[k] = la[k]; }
        return filtered;
      })(),
      players: state.players.map(function(id, idx) {
        return {
          id: id, chips: state.chips[id],
          bet: (state.roundBets[id] || 0),
          totalBet: (state.handBets[id] || 0),
          folded: state.folded.indexOf(id) !== -1,
          allIn: state.allIn.indexOf(id) !== -1,
          eliminated: state.eliminated.indexOf(id) !== -1,
          isDealer: idx === state.dealerIdx,
          isSB: idx === state.sbIdx,
          isBB: idx === state.bbIdx,
        };
      }),
    };
    // God view: spectators (null, or not a game player) and eliminated players see ALL hole cards
    var isGamePlayer = playerId && state.players.indexOf(playerId) !== -1;
    var isGodView = !isGamePlayer || (state.eliminated && state.eliminated.indexOf(playerId) !== -1);
    if (isGodView && state.holeCards) {
      v.allHands = {};
      for (var gid in state.holeCards) {
        if (state.holeCards[gid]) {
          v.allHands[gid] = state.holeCards[gid].map(function(c) { return self._cv(c); });
        }
      }
    } else if (playerId && state.holeCards[playerId]) {
      // Active player: only show own hole cards
      v.myCards = state.holeCards[playerId].map(function(c) { return self._cv(c); });
    }
    // Showdown: reveal remaining players' hands
    if (state.phase === 'showdown' && state.showdownResult) {
      var sr = state.showdownResult;
      v.result = { winners: sr.winners, pot: sr.pot, byFold: sr.byFold || false };
      if (sr.hands) {
        v.revealedHands = {};
        for (var id in sr.hands) {
          v.revealedHands[id] = {
            cards: sr.hands[id].cards.map(function(c) { return self._cv(c); }),
            handName: sr.hands[id].handName,
          };
        }
      }
    }
    return v;
  },

  isOver: function(state) {
    if (state.gameWinner) {
      return { winners: [state.gameWinner], summary: 'Winner takes all!' };
    }
    return null;
  },

  turnConfig: function(state, playerId) {
    if (state.phase === 'gameover' || state.gameWinner) return null;
    // Eliminated players go to spectator chat
    if (playerId && state.eliminated && state.eliminated.indexOf(playerId) !== -1) {
      return { spectatorChat: true };
    }
    if (state.phase === 'showdown') {
      // Phase timer: auto-deal next hand after 5s via system action.
      // playerId === null is the platform's phase-timer call (no player has actions).
      if (playerId === null) {
        return { timeoutMs: 5000, defaultAction: { type: 'continue' } };
      }
      return { spectatorChat: false };
    }
    var actor = this._actor(state);
    if (actor === playerId) {
      return { timeoutMs: 180000, defaultAction: { type: 'fold' } };
    }
    return null;
  },
};

export default GameLogic;
