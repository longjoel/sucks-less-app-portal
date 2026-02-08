import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type Cell = {
  hasMine: boolean;
  isRevealed: boolean;
  isFlagged: boolean;
  adjacentMines: number;
};

type GameStatus = "ready" | "playing" | "won" | "lost";
type InputMode = "reveal" | "flag";

type SavedState = {
  rows: number;
  cols: number;
  mines: number;
  board: Cell[][];
  status: GameStatus;
  mode: InputMode;
  elapsedSeconds: number;
  startedAtIso: string | null;
};

const STORAGE_PATH = "minesweeper-state.json";
const ROWS = 10;
const COLS = 8;
const MINES = 10;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Minesweeper</strong>
    <p>Reveal all safe tiles and avoid mines.</p>
  </article>
);

const createEmptyBoard = (rows: number, cols: number): Cell[][] =>
  Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ hasMine: false, isRevealed: false, isFlagged: false, adjacentMines: 0 }))
  );

const neighbors = (row: number, col: number, rows: number, cols: number) => {
  const points: Array<{ row: number; col: number }> = [];
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (nextRow >= 0 && nextRow < rows && nextCol >= 0 && nextCol < cols) {
        points.push({ row: nextRow, col: nextCol });
      }
    }
  }
  return points;
};

const placeMines = (board: Cell[][], mineCount: number, safeRow: number, safeCol: number) => {
  const rows = board.length;
  const cols = board[0].length;
  const safeZone = new Set<string>([`${safeRow}:${safeCol}`]);

  for (const point of neighbors(safeRow, safeCol, rows, cols)) {
    safeZone.add(`${point.row}:${point.col}`);
  }

  const candidates: Array<{ row: number; col: number }> = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!safeZone.has(`${row}:${col}`)) candidates.push({ row, col });
    }
  }

  for (let i = candidates.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }

  for (let i = 0; i < mineCount && i < candidates.length; i += 1) {
    const picked = candidates[i];
    board[picked.row][picked.col].hasMine = true;
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      board[row][col].adjacentMines = neighbors(row, col, rows, cols).filter(
        (point) => board[point.row][point.col].hasMine
      ).length;
    }
  }
};

const cloneBoard = (board: Cell[][]): Cell[][] => board.map((row) => row.map((cell) => ({ ...cell })));

const revealFlood = (board: Cell[][], row: number, col: number) => {
  const rows = board.length;
  const cols = board[0].length;
  const queue: Array<{ row: number; col: number }> = [{ row, col }];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.row}:${current.col}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cell = board[current.row][current.col];
    if (cell.isFlagged || cell.isRevealed) continue;
    cell.isRevealed = true;

    if (cell.adjacentMines === 0 && !cell.hasMine) {
      for (const point of neighbors(current.row, current.col, rows, cols)) {
        const nextCell = board[point.row][point.col];
        if (!nextCell.isRevealed && !nextCell.isFlagged) {
          queue.push(point);
        }
      }
    }
  }
};

const hasWon = (board: Cell[][]) => {
  for (const row of board) {
    for (const cell of row) {
      if (!cell.hasMine && !cell.isRevealed) return false;
    }
  }
  return true;
};

const revealAllMines = (board: Cell[][]) => {
  for (const row of board) {
    for (const cell of row) {
      if (cell.hasMine) cell.isRevealed = true;
    }
  }
};

const createFreshState = (): SavedState => ({
  rows: ROWS,
  cols: COLS,
  mines: MINES,
  board: createEmptyBoard(ROWS, COLS),
  status: "ready",
  mode: "reveal",
  elapsedSeconds: 0,
  startedAtIso: null
});

const isSavedState = (value: unknown): value is SavedState => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.rows !== "number" ||
    typeof candidate.cols !== "number" ||
    typeof candidate.mines !== "number" ||
    !Array.isArray(candidate.board) ||
    (candidate.status !== "ready" && candidate.status !== "playing" && candidate.status !== "won" && candidate.status !== "lost") ||
    (candidate.mode !== "reveal" && candidate.mode !== "flag") ||
    typeof candidate.elapsedSeconds !== "number"
  ) {
    return false;
  }

  const board = candidate.board as unknown[];
  if (board.length !== candidate.rows) return false;

  for (const row of board) {
    if (!Array.isArray(row) || row.length !== candidate.cols) return false;
    for (const cell of row) {
      if (typeof cell !== "object" || cell === null) return false;
      const c = cell as Record<string, unknown>;
      if (
        typeof c.hasMine !== "boolean" ||
        typeof c.isRevealed !== "boolean" ||
        typeof c.isFlagged !== "boolean" ||
        typeof c.adjacentMines !== "number"
      ) {
        return false;
      }
    }
  }

  return true;
};

const MinesweeperApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<SavedState>(createFreshState);
  const [statusText, setStatusText] = useState("Tap a tile to start.");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isSavedState(parsed)) {
          setState(parsed);
          if (parsed.status === "won") setStatusText("You won. Nice work.");
          if (parsed.status === "lost") setStatusText("You hit a mine. Start a new game.");
        }
      } catch {
        setStatusText("Saved game data was invalid. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(state, null, 2));
  }, [ctx.vfs, state]);

  useEffect(() => {
    if (state.status !== "playing") return;
    const interval = setInterval(() => {
      setState((current) => ({ ...current, elapsedSeconds: current.elapsedSeconds + 1 }));
    }, 1000);
    return () => clearInterval(interval);
  }, [state.status]);

  const reset = () => {
    setState(createFreshState());
    setStatusText("Tap a tile to start.");
  };

  const toggleMode = () => {
    setState((current) => ({ ...current, mode: current.mode === "reveal" ? "flag" : "reveal" }));
  };

  const onCellAction = (row: number, col: number) => {
    setState((current) => {
      if (current.status === "won" || current.status === "lost") return current;

      const board = cloneBoard(current.board);
      const cell = board[row][col];

      if (current.mode === "flag") {
        if (!cell.isRevealed) {
          cell.isFlagged = !cell.isFlagged;
          setStatusText(cell.isFlagged ? "Flag placed." : "Flag removed.");
        }
        return { ...current, board };
      }

      if (cell.isFlagged || cell.isRevealed) return current;

      let nextStatus: GameStatus = current.status;
      let nextStartedAtIso = current.startedAtIso;

      if (current.status === "ready") {
        placeMines(board, current.mines, row, col);
        nextStatus = "playing";
        nextStartedAtIso = new Date().toISOString();
      }

      if (board[row][col].hasMine) {
        revealAllMines(board);
        setStatusText("Boom. You hit a mine.");
        return {
          ...current,
          board,
          status: "lost",
          startedAtIso: nextStartedAtIso
        };
      }

      revealFlood(board, row, col);

      if (hasWon(board)) {
        setStatusText("You cleared the minefield.");
        return {
          ...current,
          board,
          status: "won",
          startedAtIso: nextStartedAtIso
        };
      }

      return {
        ...current,
        board,
        status: nextStatus,
        startedAtIso: nextStartedAtIso
      };
    });
  };

  const mineCounter = useMemo(() => {
    const flags = state.board.flat().filter((cell) => cell.isFlagged).length;
    return Math.max(0, state.mines - flags);
  }, [state.board, state.mines]);

  return (
    <SlapApplicationShell title="Minesweeper">
      <SlapInlineText>{statusText}</SlapInlineText>
      <SlapInlineText>
        Mode: {state.mode === "reveal" ? "Reveal" : "Flag"} | Mines left: {mineCounter} | Time: {state.elapsedSeconds}s
      </SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton
          title={state.mode === "reveal" ? "Switch To Flag" : "Switch To Reveal"}
          onClick={toggleMode}
        />
        <SlapActionButton title="New Game" onClick={reset} />
      </div>

      <div className="minesweeper-grid" style={{ gridTemplateColumns: `repeat(${state.cols}, 1fr)` }}>
        {state.board.flatMap((row, rowIndex) =>
          row.map((cell, colIndex) => {
            const label = cell.isFlagged ? "🚩" : cell.isRevealed ? (cell.hasMine ? "💣" : cell.adjacentMines || "") : "";
            const className = [
              "minesweeper-cell",
              cell.isRevealed ? "ms-revealed" : "ms-hidden",
              cell.isFlagged ? "ms-flagged" : ""
            ]
              .join(" ")
              .trim();

            return (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                className={className}
                onClick={() => onCellAction(rowIndex, colIndex)}
              >
                {label}
              </button>
            );
          })
        )}
      </div>
    </SlapApplicationShell>
  );
};

export const minesweeperManifest: SlapApplicationManifest = {
  id: "minesweeper",
  title: "Minesweeper",
  author: "Joel",
  description: "Classic minesweeper with reveal/flag mode.",
  icon: "💣",
  Preview,
  Application: MinesweeperApp
};
