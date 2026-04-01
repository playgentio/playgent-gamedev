// === Helpers ===

function getRoleList(playerCount) {
  var wolfCount = Math.floor(playerCount / 3);
  var roles = [];
  for (var i = 0; i < wolfCount; i++) roles.push("werewolf");
  roles.push("seer");
  roles.push("doctor");
  while (roles.length < playerCount) roles.push("villager");
  return roles;
}

function seededRandom(seed) {
  var s = (seed + 0x6d2b79f5) | 0;
  var t = Math.imul(s ^ (s >>> 15), 1 | s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function advanceSeed(seed) {
  return (seed + 0x6d2b79f5) | 0;
}

function deterministicPick(items, seed) {
  var r = seededRandom(seed);
  var idx = Math.floor(r * items.length);
  return { picked: items[idx], newSeed: advanceSeed(seed) };
}

function checkWinCondition(state) {
  var aliveWolves = state.players.filter(function (p) { return state.alive[p] && state.roles[p] === "werewolf"; }).length;
  var aliveNonWolves = state.players.filter(function (p) { return state.alive[p] && state.roles[p] !== "werewolf"; }).length;

  if (aliveWolves === 0) {
    return {
      winners: state.players.filter(function (p) { return state.roles[p] !== "werewolf"; }),
      summary: "The village wins! All werewolves have been eliminated.",
    };
  }
  if (aliveWolves >= aliveNonWolves) {
    return {
      winners: state.players.filter(function (p) { return state.roles[p] === "werewolf"; }),
      summary: "The werewolves win! They outnumber the villagers.",
    };
  }
  return null;
}

function livingPlayers(state) {
  return state.players.filter(function (p) { return state.alive[p]; });
}

function livingWolves(state) {
  return state.players.filter(function (p) { return state.alive[p] && state.roles[p] === "werewolf"; });
}

function pendingNightActors(state) {
  var pending = 0;
  var wolves = livingWolves(state);
  pending += wolves.filter(function (w) { return state.werewolfVotes[w] === undefined; }).length;
  var seer = state.players.find(function (p) { return state.alive[p] && state.roles[p] === "seer"; });
  if (seer && state.seerTarget === null) pending++;
  var doctor = state.players.find(function (p) { return state.alive[p] && state.roles[p] === "doctor"; });
  if (doctor && state.doctorTarget === null) pending++;
  return pending;
}

function resolveNight(state) {
  var wolves = livingWolves(state);
  var wolfTarget = null;

  if (wolves.length > 0) {
    var voteCounts = {};
    for (var i = 0; i < wolves.length; i++) {
      var target = state.werewolfVotes[wolves[i]];
      if (target) voteCounts[target] = (voteCounts[target] || 0) + 1;
    }
    var maxVotes = 0;
    var counts = Object.values(voteCounts);
    for (var j = 0; j < counts.length; j++) {
      if (counts[j] > maxVotes) maxVotes = counts[j];
    }
    var topTargets = Object.keys(voteCounts).filter(function (t) { return voteCounts[t] === maxVotes; });
    if (topTargets.length === 1) {
      wolfTarget = topTargets[0];
    } else if (topTargets.length > 1) {
      var pick = deterministicPick(topTargets.sort(), state.nextSeed);
      wolfTarget = pick.picked;
      state = Object.assign({}, state, { nextSeed: pick.newSeed });
    }
  }

  var saved = wolfTarget !== null && wolfTarget === state.doctorTarget;
  var nightKill = saved ? null : wolfTarget;

  var newAlive = Object.assign({}, state.alive);
  if (nightKill) {
    newAlive = Object.assign({}, newAlive, { [nightKill]: false });
  }

  var newSeerHistory = state.seerHistory;
  if (state.seerTarget !== null && state.seerResult !== null) {
    newSeerHistory = state.seerHistory.concat([{
      target: state.seerTarget,
      role: state.seerResult,
    }]);
  }

  return Object.assign({}, state, {
    phase: "night_result",
    alive: newAlive,
    nightKill: nightKill,
    seerHistory: newSeerHistory,
    lastDoctorTarget: state.doctorTarget,
  });
}

function resolveDayVote(state) {
  var voteCounts = {};
  var voteValues = Object.values(state.votes);
  for (var i = 0; i < voteValues.length; i++) {
    var target = voteValues[i];
    if (target !== "skip") {
      voteCounts[target] = (voteCounts[target] || 0) + 1;
    }
  }

  var maxVotes = 0;
  var counts = Object.values(voteCounts);
  for (var j = 0; j < counts.length; j++) {
    if (counts[j] > maxVotes) maxVotes = counts[j];
  }

  var eliminated = null;
  if (maxVotes > 0) {
    var topTargets = Object.keys(voteCounts).filter(function (t) { return voteCounts[t] === maxVotes; });
    if (topTargets.length === 1) {
      eliminated = topTargets[0];
    }
  }

  var newAlive = state.alive;
  if (eliminated) {
    newAlive = Object.assign({}, state.alive, { [eliminated]: false });
  }

  var newVoteHistory = state.voteHistory.concat([{
    round: state.round,
    votes: Object.assign({}, state.votes),
    eliminated: eliminated,
  }]);

  return Object.assign({}, state, {
    phase: "day_result",
    alive: newAlive,
    eliminated: eliminated,
    voteHistory: newVoteHistory,
  });
}

// === Action Handlers ===

function handleTimerExpired(state, timerId) {
  if (timerId === "roleReveal" && state.phase === "roleReveal") {
    return Object.assign({}, state, {
      phase: "day_discussion",
    });
  }

  if (timerId === "day_discussion" && state.phase === "day_discussion") {
    return Object.assign({}, state, {
      phase: "day_vote",
      votes: {},
    });
  }

  if (timerId === "day_vote" && state.phase === "day_vote") {
    var newVotes = Object.assign({}, state.votes);
    var live = livingPlayers(state);
    for (var i = 0; i < live.length; i++) {
      if (newVotes[live[i]] === undefined) {
        newVotes[live[i]] = "skip";
      }
    }
    var stateWithVotes = Object.assign({}, state, { votes: newVotes });
    return resolveDayVote(stateWithVotes);
  }

  if (timerId === "day_result" && state.phase === "day_result") {
    var result = checkWinCondition(state);
    if (result) return state;
    return Object.assign({}, state, {
      phase: "night",
      werewolfVotes: {},
      seerTarget: null,
      seerResult: null,
      doctorTarget: null,
      nightKill: null,
    });
  }

  if (timerId === "night" && state.phase === "night") {
    var s = state;
    var wolves = livingWolves(s);
    for (var wi = 0; wi < wolves.length; wi++) {
      var w = wolves[wi];
      if (s.werewolfVotes[w] === undefined) {
        var targets = s.players.filter(function (p) { return s.alive[p] && s.roles[p] !== "werewolf"; });
        if (targets.length > 0) {
          var pick = deterministicPick(targets, s.nextSeed);
          s = Object.assign({}, s, {
            werewolfVotes: Object.assign({}, s.werewolfVotes, { [w]: pick.picked }),
            nextSeed: pick.newSeed,
          });
        }
      }
    }
    var seer = s.players.find(function (p) { return s.alive[p] && s.roles[p] === "seer"; });
    if (seer && s.seerTarget === null) {
      var seerTargets = s.players.filter(function (p) { return s.alive[p] && p !== seer; });
      if (seerTargets.length > 0) {
        var seerPick = deterministicPick(seerTargets, s.nextSeed);
        s = Object.assign({}, s, {
          seerTarget: seerPick.picked,
          seerResult: s.roles[seerPick.picked],
          nextSeed: seerPick.newSeed,
        });
      }
    }
    var doctor = s.players.find(function (p) { return s.alive[p] && s.roles[p] === "doctor"; });
    if (doctor && s.doctorTarget === null) {
      var docTargets = s.players.filter(function (p) { return s.alive[p] && p !== s.lastDoctorTarget; });
      if (docTargets.length > 0) {
        var docPick = deterministicPick(docTargets, s.nextSeed);
        s = Object.assign({}, s, {
          doctorTarget: docPick.picked,
          nextSeed: docPick.newSeed,
        });
      }
    }
    return resolveNight(s);
  }

  if (timerId === "night_result" && state.phase === "night_result") {
    var nightResult = checkWinCondition(state);
    if (nightResult) return state;
    return Object.assign({}, state, {
      phase: "day_discussion",
      round: state.round + 1,
      votes: {},
      eliminated: null,
      werewolfVotes: {},
      seerTarget: null,
      seerResult: null,
      doctorTarget: null,
      nightKill: null,
    });
  }

  return state;
}

function handleDayVote(state, playerId, target) {
  if (state.phase !== "day_vote") return state;
  if (!state.alive[playerId]) return state;
  if (state.votes[playerId] !== undefined) return state;
  if (target !== "skip" && (!state.alive[target] || !state.players.includes(target))) return state;

  var newVotes = Object.assign({}, state.votes, { [playerId]: target });

  var allVoted = livingPlayers(state).every(function (p) { return newVotes[p] !== undefined; });
  if (allVoted) {
    return resolveDayVote(Object.assign({}, state, { votes: newVotes }));
  }

  return Object.assign({}, state, { votes: newVotes });
}

function handleWerewolfKill(state, playerId, target) {
  if (state.phase !== "night") return state;
  if (state.roles[playerId] !== "werewolf") return state;
  if (!state.alive[playerId]) return state;
  if (state.werewolfVotes[playerId] !== undefined) return state;
  if (state.roles[target] === "werewolf" || !state.alive[target]) return state;

  var newVotes = Object.assign({}, state.werewolfVotes, { [playerId]: target });
  var newState = Object.assign({}, state, { werewolfVotes: newVotes });

  if (pendingNightActors(newState) === 0) {
    return resolveNight(newState);
  }
  return newState;
}

function handleSeerInvestigate(state, playerId, target) {
  if (state.phase !== "night") return state;
  if (state.roles[playerId] !== "seer") return state;
  if (!state.alive[playerId]) return state;
  if (state.seerTarget !== null) return state;
  if (target === playerId || !state.alive[target]) return state;

  var newState = Object.assign({}, state, {
    seerTarget: target,
    seerResult: state.roles[target],
  });

  if (pendingNightActors(newState) === 0) {
    return resolveNight(newState);
  }
  return newState;
}

function handleDoctorProtect(state, playerId, target) {
  if (state.phase !== "night") return state;
  if (state.roles[playerId] !== "doctor") return state;
  if (!state.alive[playerId]) return state;
  if (state.doctorTarget !== null) return state;
  if (target === state.lastDoctorTarget) return state;
  if (!state.alive[target]) return state;

  var newState = Object.assign({}, state, { doctorTarget: target });

  if (pendingNightActors(newState) === 0) {
    return resolveNight(newState);
  }
  return newState;
}

function handlePlayerLeft(state, leftPlayerId) {
  if (!state.alive[leftPlayerId]) return state;

  var newAlive = Object.assign({}, state.alive, { [leftPlayerId]: false });
  var newState = Object.assign({}, state, { alive: newAlive });

  if (state.phase === "night") {
    if (pendingNightActors(newState) === 0) {
      return resolveNight(newState);
    }
  }

  if (state.phase === "day_vote") {
    var allVoted = livingPlayers(newState).every(function (p) { return newState.votes[p] !== undefined; });
    if (allVoted) {
      return resolveDayVote(newState);
    }
  }

  return newState;
}

// === Game Definition ===

var GameLogic = {
  setup: function (ctx) {
    var playerIds = ctx.players.map(function (p) { return p.id; });
    var roleList = getRoleList(playerIds.length);
    var shuffledRoles = ctx.random.shuffle(roleList.slice());

    var roles = {};
    var alive = {};
    for (var i = 0; i < playerIds.length; i++) {
      roles[playerIds[i]] = shuffledRoles[i];
      alive[playerIds[i]] = true;
    }

    return {
      phase: "roleReveal",
      round: 0,
      players: playerIds,
      roles: roles,
      alive: alive,
      votes: {},
      eliminated: null,
      werewolfVotes: {},
      seerTarget: null,
      seerResult: null,
      doctorTarget: null,
      lastDoctorTarget: null,
      nightKill: null,
      seerHistory: [],
      voteHistory: [],
      nextSeed: Math.floor(ctx.random.next() * 2147483647),
    };
  },

  actions: function (state, playerId) {
    if (!state.alive[playerId]) return [];

    // Display-only phases: no player actions. Platform uses turnConfig(null)
    // to schedule system timer_expired via defaultAction.
    var displayPhases = ["roleReveal", "day_discussion", "day_result", "night_result"];
    if (displayPhases.indexOf(state.phase) !== -1) return [];

    if (state.phase === "day_vote") {
      if (state.votes[playerId] !== undefined) return [];
      var targets = livingPlayers(state);
      var actions = targets.map(function (t) { return { type: "day_vote", target: t }; });
      actions.push({ type: "day_vote", target: "skip" });
      return actions;
    }

    if (state.phase === "night") {
      var role = state.roles[playerId];
      var hasActed =
        (role === "werewolf" && state.werewolfVotes[playerId] !== undefined) ||
        (role === "seer" && state.seerTarget !== null) ||
        (role === "doctor" && state.doctorTarget !== null);
      if (hasActed) return [];

      if (role === "werewolf") {
        var wolfTargets = state.players.filter(function (p) { return state.alive[p] && state.roles[p] !== "werewolf"; });
        return wolfTargets.map(function (t) { return { type: "werewolf_kill", target: t }; });
      }

      if (role === "seer") {
        var seerTargets = state.players.filter(function (p) { return state.alive[p] && p !== playerId; });
        return seerTargets.map(function (t) { return { type: "seer_investigate", target: t }; });
      }

      if (role === "doctor") {
        var docTargets = state.players.filter(function (p) {
          return state.alive[p] && p !== state.lastDoctorTarget;
        });
        return docTargets.map(function (t) { return { type: "doctor_protect", target: t }; });
      }
    }

    return [];
  },

  perform: function (state, playerId, action) {
    if (playerId === "__system__") {
      if (action.type === "timer_expired") {
        return handleTimerExpired(state, action.timerId);
      }
      if (action.type === "player_left") {
        return handlePlayerLeft(state, action.playerId);
      }
      return state;
    }

    if (action.type === "day_vote") {
      return handleDayVote(state, playerId, action.target);
    }
    if (action.type === "werewolf_kill") {
      return handleWerewolfKill(state, playerId, action.target);
    }
    if (action.type === "seer_investigate") {
      return handleSeerInvestigate(state, playerId, action.target);
    }
    if (action.type === "doctor_protect") {
      return handleDoctorProtect(state, playerId, action.target);
    }

    return state;
  },

  view: function (state, playerId) {
    var alive = Object.assign({}, state.alive);
    // Include phase timeout so agents know how long the current phase lasts
    var phaseTimeouts = {
      roleReveal: 5000,
      day_discussion: 90000,
      day_vote: 60000,
      day_result: 8000,
      night: 45000,
      night_result: 8000,
    };
    var base = {
      phase: state.phase,
      round: state.round,
      players: state.players,
      alive: alive,
      voteHistory: state.voteHistory,
      phaseTimeoutMs: phaseTimeouts[state.phase] || null,
    };

    var isDead = playerId !== null && state.players.indexOf(playerId) !== -1 && !state.alive[playerId];
    var isSpectator = !playerId || state.players.indexOf(playerId) === -1;

    if (isDead || isSpectator) {
      return Object.assign({}, base, {
        roles: Object.assign({}, state.roles),
        myRole: null,
        werewolfVotes: Object.assign({}, state.werewolfVotes),
        seerTarget: state.seerTarget,
        seerResult: state.seerResult,
        seerHistory: state.seerHistory.slice(),
        doctorTarget: state.doctorTarget,
        nightKill: state.nightKill,
        eliminated: state.eliminated,
        eliminatedRole: state.eliminated ? state.roles[state.eliminated] : null,
        votes: Object.assign({}, state.votes),
        voteTallied: state.phase === "day_result" || state.phase === "night" || state.phase === "night_result",
      });
    }

    var myRole = state.roles[playerId];

    if (state.phase === "roleReveal") {
      var viewData = Object.assign({}, base, {
        myRole: myRole,
      });
      if (myRole === "werewolf") {
        viewData["werewolves"] = state.players.filter(function (p) { return state.roles[p] === "werewolf"; });
      }
      return viewData;
    }

    var playerView = Object.assign({}, base, {
      myRole: myRole,
    });

    if (myRole === "werewolf") {
      playerView["werewolves"] = state.players.filter(function (p) { return state.roles[p] === "werewolf"; });
    }

    if (myRole === "seer") {
      playerView["seerHistory"] = state.seerHistory.slice();
      if (state.phase === "night" && state.seerTarget !== null) {
        playerView["seerTarget"] = state.seerTarget;
        playerView["seerResult"] = state.seerResult;
      }
    }

    if (state.phase === "day_vote") {
      var voted = {};
      for (var i = 0; i < state.players.length; i++) {
        var p = state.players[i];
        if (state.alive[p]) {
          voted[p] = state.votes[p] !== undefined;
        }
      }
      playerView["voted"] = voted;
      playerView["myVote"] = state.votes[playerId];
    }

    if (state.phase === "day_result") {
      playerView["eliminated"] = state.eliminated;
      playerView["eliminatedRole"] = state.eliminated ? state.roles[state.eliminated] : null;
      playerView["votes"] = Object.assign({}, state.votes);
    }

    if (state.phase === "night") {
      if (myRole === "werewolf") {
        playerView["werewolfVotes"] = Object.assign({}, state.werewolfVotes);
        playerView["myWolfVote"] = state.werewolfVotes[playerId];
      }
      if (myRole === "doctor") {
        playerView["lastDoctorTarget"] = state.lastDoctorTarget;
      }
    }

    if (state.phase === "night_result") {
      playerView["nightKill"] = state.nightKill;
      playerView["killedRole"] = state.nightKill
        ? state.roles[state.nightKill]
        : null;
    }

    return playerView;
  },

  isOver: function (state) {
    if (state.phase === "day_result" || state.phase === "night_result") {
      return checkWinCondition(state);
    }
    return null;
  },

  turnConfig: function (state, playerId) {
    // Phase timers — no players have actions during display phases.
    // Platform calls turnConfig(state, null) when activePlayerIds is empty.
    if (playerId === null) {
      if (state.phase === "roleReveal") return { timeoutMs: 5000, defaultAction: { type: "timer_expired", timerId: "roleReveal" } };
      if (state.phase === "day_discussion") return { timeoutMs: 90000, defaultAction: { type: "timer_expired", timerId: "day_discussion" } };
      if (state.phase === "day_result") return { timeoutMs: 8000, defaultAction: { type: "timer_expired", timerId: "day_result" } };
      if (state.phase === "night_result") return { timeoutMs: 8000, defaultAction: { type: "timer_expired", timerId: "night_result" } };
      return null;
    }

    // Dead players → spectator chat, no timer
    if (!state.alive[playerId]) {
      return { spectatorChat: true };
    }

    // Per-player timers for action phases
    if (state.phase === "day_vote") return { timeoutMs: 60000, defaultAction: { type: "day_vote", target: "skip" } };
    if (state.phase === "night") return { timeoutMs: 45000 };

    return null;
  },
};

// Export for tests — the platform loader strips this
export default GameLogic;
