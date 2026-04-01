var GameLogic = {
  _WIN_LINES: [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ],

  _checkWinner(board) {
    for (const [a, b, c] of this._WIN_LINES) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { mark: board[a], cells: [a, b, c] };
      }
    }
    return null;
  },

  setup({ players, random }) {
    return {
      board: Array(9).fill(null),
      players: players.map(p => p.id),
      currentTurn: 0,
      winner: null,
      winCells: null,
      draw: false,
    };
  },

  actions(state, playerId) {
    if (state.winner || state.draw) return [];
    if (state.players[state.currentTurn] !== playerId) return [];
    return state.board
      .map((cell, i) => cell === null ? { type: 'place', cell: i } : null)
      .filter(a => a !== null);
  },

  perform(state, playerId, action) {
    if (action.type !== 'place') return state;
    if (state.board[action.cell] !== null) return state;
    if (state.winner || state.draw) return state;

    const mark = state.currentTurn === 0 ? 'X' : 'O';
    const newBoard = [...state.board];
    newBoard[action.cell] = mark;

    const result = this._checkWinner(newBoard);
    const winner = result ? result.mark : null;
    const winCells = result ? result.cells : null;
    const draw = !winner && newBoard.every(c => c !== null);

    return {
      ...state,
      board: newBoard,
      currentTurn: (state.currentTurn + 1) % 2,
      winner,
      winCells,
      draw,
    };
  },

  view(state, playerId) {
    return {
      board: state.board,
      currentPlayer: state.players[state.currentTurn],
      winner: state.winner ? state.players[state.winner === 'X' ? 0 : 1] : null,
      draw: state.draw,
      marks: { [state.players[0]]: 'X', [state.players[1]]: 'O' },
      winCells: state.winCells,
    };
  },

  turnConfig(state, playerId) {
    return { timeoutMs: 30000 };
  },

  isOver(state) {
    if (state.winner) {
      const winnerId = state.players[state.winner === 'X' ? 0 : 1];
      return { winners: [winnerId], summary: `${state.winner} wins!` };
    }
    if (state.draw) {
      return { winners: [], summary: "It's a draw!" };
    }
    return null;
  },
};

// Export for tests — the platform loader strips this
export default GameLogic;
