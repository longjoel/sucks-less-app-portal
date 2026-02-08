import { useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type Direction = "left" | "right" | "up" | "down";
type Board = number[][];

type GameState = {
  board: Board;
  score: number;
  bestScore: number;
};

const SIZE = 4;
const STORAGE_PATH = "game-2048.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>2048</strong>
    <p>Swipe to merge tiles and reach 2048.</p>
  </article>
);

const emptyBoard = (): Board => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));

const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

const addRandomTile = (board: Board): Board => {
  const next = cloneBoard(board);
  const emptyCells: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (next[row][col] === 0) emptyCells.push({ row, col });
    }
  }

  if (emptyCells.length === 0) return next;

  const picked = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  next[picked.row][picked.col] = Math.random() < 0.9 ? 2 : 4;
  return next;
};

const newGame = (): GameState => {
  let board = emptyBoard();
  board = addRandomTile(board);
  board = addRandomTile(board);
  return { board, score: 0, bestScore: 0 };
};

const compressLine = (line: number[]) => {
  const filtered = line.filter((value) => value !== 0);
  const merged: number[] = [];
  let gained = 0;

  for (let index = 0; index < filtered.length; index += 1) {
    if (filtered[index] !== 0 && filtered[index] === filtered[index + 1]) {
      const value = filtered[index] * 2;
      merged.push(value);
      gained += value;
      index += 1;
    } else {
      merged.push(filtered[index]);
    }
  }

  while (merged.length < SIZE) merged.push(0);

  return { merged, gained };
};

const boardsEqual = (a: Board, b: Board) =>
  a.every((row, rowIndex) => row.every((value, colIndex) => value === b[rowIndex][colIndex]));

const applyMove = (board: Board, direction: Direction) => {
  const next = emptyBoard();
  let gained = 0;

  if (direction === "left" || direction === "right") {
    for (let row = 0; row < SIZE; row += 1) {
      const line = [...board[row]];
      const source = direction === "right" ? line.reverse() : line;
      const { merged, gained: lineGained } = compressLine(source);
      const finalLine = direction === "right" ? [...merged].reverse() : merged;
      next[row] = finalLine;
      gained += lineGained;
    }
  } else {
    for (let col = 0; col < SIZE; col += 1) {
      const line = board.map((row) => row[col]);
      const source = direction === "down" ? [...line].reverse() : line;
      const { merged, gained: lineGained } = compressLine(source);
      const finalLine = direction === "down" ? [...merged].reverse() : merged;
      for (let row = 0; row < SIZE; row += 1) {
        next[row][col] = finalLine[row];
      }
      gained += lineGained;
    }
  }

  return { nextBoard: next, gained, moved: !boardsEqual(board, next) };
};

const hasMovesLeft = (board: Board) => {
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row][col];
      if (value === 0) return true;
      if (row + 1 < SIZE && board[row + 1][col] === value) return true;
      if (col + 1 < SIZE && board[row][col + 1] === value) return true;
    }
  }
  return false;
};

const tileClass = (value: number) => {
  if (value === 0) return "tile-empty";
  if (value <= 4) return "tile-low";
  if (value <= 32) return "tile-mid";
  return "tile-high";
};

const Game2048App = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<GameState>(newGame);
  const [status, setStatus] = useState("Swipe to play.");
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as Partial<GameState>;
        if (!Array.isArray(parsed.board) || typeof parsed.score !== "number" || typeof parsed.bestScore !== "number") {
          return;
        }

        const validBoard = parsed.board.every(
          (row) => Array.isArray(row) && row.length === SIZE && row.every((value) => typeof value === "number")
        );

        if (validBoard) {
          setState({ board: parsed.board as Board, score: parsed.score, bestScore: parsed.bestScore });
        }
      } catch {
        setStatus("Saved game data was invalid. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(state, null, 2));
  }, [ctx.vfs, state]);

  const move = (direction: Direction) => {
    setState((current) => {
      const { nextBoard, gained, moved } = applyMove(current.board, direction);
      if (!moved) return current;

      const boardAfterSpawn = addRandomTile(nextBoard);
      const score = current.score + gained;
      const bestScore = Math.max(current.bestScore, score);

      if (boardAfterSpawn.some((row) => row.some((value) => value === 2048))) {
        setStatus("You reached 2048!");
      } else if (!hasMovesLeft(boardAfterSpawn)) {
        setStatus("No moves left. Start a new game.");
      } else {
        setStatus("Keep going.");
      }

      return {
        board: boardAfterSpawn,
        score,
        bestScore
      };
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") move("left");
      if (event.key === "ArrowRight") move("right");
      if (event.key === "ArrowUp") move("up");
      if (event.key === "ArrowDown") move("down");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const onTouchStart = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!touchStart.current) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStart.current.x;
    const deltaY = touch.clientY - touchStart.current.y;
    touchStart.current = null;

    if (Math.abs(deltaX) < 24 && Math.abs(deltaY) < 24) return;

    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      move(deltaX > 0 ? "right" : "left");
    } else {
      move(deltaY > 0 ? "down" : "up");
    }
  };

  const onBoardClick = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const edgeDistances = [
      { direction: "left" as Direction, distance: x },
      { direction: "right" as Direction, distance: rect.width - x },
      { direction: "up" as Direction, distance: y },
      { direction: "down" as Direction, distance: rect.height - y }
    ];

    edgeDistances.sort((a, b) => a.distance - b.distance);
    const nearest = edgeDistances[0];
    const edgeZone = Math.min(rect.width, rect.height) * 0.26;

    if (nearest.distance <= edgeZone) {
      move(nearest.direction);
    }
  };

  const restart = () => {
    const bestScore = state.bestScore;
    const fresh = newGame();
    setState({ ...fresh, bestScore });
    setStatus("New game started.");
  };

  const gameOver = useMemo(() => !hasMovesLeft(state.board), [state.board]);

  return (
    <SlapApplicationShell title="2048">
      <SlapInlineText>Swipe tiles to combine matching numbers.</SlapInlineText>
      <SlapInlineText>Score: {state.score} | Best: {state.bestScore}</SlapInlineText>
      <SlapInlineText>{status}</SlapInlineText>

      <SlapInlineText>Tap board edges or swipe to move.</SlapInlineText>

      <div className="game2048-grid" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onClick={onBoardClick}>
        {state.board.flatMap((row, rowIndex) =>
          row.map((value, colIndex) => (
            <div key={`${rowIndex}-${colIndex}`} className={`game2048-tile ${tileClass(value)}`}>
              {value === 0 ? "" : value}
            </div>
          ))
        )}
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="New Game" onClick={restart} />
      </div>

      {gameOver ? <SlapInlineText>Game over. Tap New Game to restart.</SlapInlineText> : null}
    </SlapApplicationShell>
  );
};

export const game2048Manifest: SlapApplicationManifest = {
  id: "game-2048",
  title: "2048",
  author: "Joel",
  description: "Swipe and merge tiles to reach 2048.",
  icon: "🔢",
  Preview,
  Application: Game2048App
};
