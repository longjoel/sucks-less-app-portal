import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type GameStatus = "playing" | "won";

type GameState = {
  size: number;
  board: boolean[][];
  initialBoard: boolean[][];
  moves: number;
  bestMoves: number | null;
  status: GameStatus;
};

const STORAGE_PATH = "lights-out-state.json";
const DEFAULT_SIZE = 5;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Lights Out</strong>
    <p>Toggle tiles to switch all the lights off.</p>
  </article>
);

const createEmptyBoard = (size: number): boolean[][] =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => false));

const cloneBoard = (board: boolean[][]): boolean[][] => board.map((row) => [...row]);

const toggleCell = (board: boolean[][], row: number, col: number) => {
  if (row < 0 || col < 0) return;
  if (row >= board.length || col >= board.length) return;
  board[row][col] = !board[row][col];
};

const toggleMove = (board: boolean[][], row: number, col: number) => {
  toggleCell(board, row, col);
  toggleCell(board, row - 1, col);
  toggleCell(board, row + 1, col);
  toggleCell(board, row, col - 1);
  toggleCell(board, row, col + 1);
};

const applyMove = (board: boolean[][], row: number, col: number): boolean[][] => {
  const next = cloneBoard(board);
  toggleMove(next, row, col);
  return next;
};

const isSolved = (board: boolean[][]) => board.every((row) => row.every((cell) => !cell));

const countLit = (board: boolean[][]) =>
  board.reduce((total, row) => total + row.filter((cell) => cell).length, 0);

const scrambleBoard = (size: number): boolean[][] => {
  const board = createEmptyBoard(size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (Math.random() < 0.48) {
        toggleMove(board, row, col);
      }
    }
  }

  if (isSolved(board)) {
    const row = Math.floor(Math.random() * size);
    const col = Math.floor(Math.random() * size);
    toggleMove(board, row, col);
  }

  return board;
};

const createNewGame = (size: number, bestMoves: number | null = null): GameState => {
  const board = scrambleBoard(size);
  return {
    size,
    board,
    initialBoard: cloneBoard(board),
    moves: 0,
    bestMoves,
    status: "playing"
  };
};

const isBoard = (value: unknown, size: number): value is boolean[][] => {
  if (!Array.isArray(value) || value.length !== size) return false;
  return value.every(
    (row) => Array.isArray(row) && row.length === size && row.every((cell) => typeof cell === "boolean")
  );
};

const parseStoredGame = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (typeof parsed.size !== "number" || parsed.size <= 0) return null;
    const size = Math.floor(parsed.size);

    if (!isBoard(parsed.board, size) || !isBoard(parsed.initialBoard, size)) return null;

    const moves = typeof parsed.moves === "number" && parsed.moves >= 0 ? Math.floor(parsed.moves) : 0;
    const bestMoves =
      typeof parsed.bestMoves === "number" && parsed.bestMoves >= 0 ? Math.floor(parsed.bestMoves) : null;

    const board = parsed.board as boolean[][];
    const initialBoard = parsed.initialBoard as boolean[][];
    const solved = isSolved(board);
    const finalBest = solved
      ? bestMoves === null
        ? moves
        : Math.min(bestMoves, moves)
      : bestMoves;

    return {
      size,
      board,
      initialBoard,
      moves,
      bestMoves: finalBest,
      status: solved ? "won" : "playing"
    };
  } catch {
    return null;
  }
};

const LightsOutApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [game, setGame] = useState<GameState>(() => createNewGame(DEFAULT_SIZE));
  const [statusText, setStatusText] = useState("Tap a tile to flip it and its neighbors.");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      const parsed = parseStoredGame(raw);
      if (parsed) {
        setGame(parsed);
        if (parsed.status === "won") {
          setStatusText(`All lights out in ${parsed.moves} moves!`);
        }
        return;
      }
      setStatusText("Saved game was invalid. Starting fresh.");
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(game, null, 2));
  }, [ctx.vfs, game]);

  const litCount = useMemo(() => countLit(game.board), [game.board]);

  const pressTile = (row: number, col: number) => {
    setGame((current) => {
      if (current.status === "won") return current;
      const board = applyMove(current.board, row, col);
      const moves = current.moves + 1;
      const solved = isSolved(board);
      const bestMoves = solved
        ? current.bestMoves === null
          ? moves
          : Math.min(current.bestMoves, moves)
        : current.bestMoves;

      if (solved) {
        setStatusText(`All lights out in ${moves} moves!`);
      } else if (moves === 1) {
        setStatusText("Nice start. Keep going.");
      }

      return {
        ...current,
        board,
        moves,
        status: solved ? "won" : "playing",
        bestMoves
      };
    });
  };

  const newPuzzle = () => {
    setGame((current) => createNewGame(current.size, current.bestMoves));
    setStatusText("New puzzle ready.");
  };

  const resetPuzzle = () => {
    setGame((current) => {
      const board = cloneBoard(current.initialBoard);
      const solved = isSolved(board);
      setStatusText(solved ? "Puzzle already solved." : "Puzzle reset.");
      return {
        ...current,
        board,
        moves: 0,
        status: solved ? "won" : "playing"
      };
    });
  };

  return (
    <SlapApplicationShell title="Lights Out">
      <SlapInlineText>Toggle tiles to turn off every light.</SlapInlineText>
      <SlapInlineText>
        Moves: {game.moves} | Best: {game.bestMoves ?? "--"} | Lit: {litCount}
      </SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="lightsout-grid" aria-label="Lights Out board">
        {game.board.map((row, rowIndex) =>
          row.map((isLit, colIndex) => (
            <button
              key={`${rowIndex}-${colIndex}`}
              className={`lightsout-tile ${isLit ? "is-lit" : "is-off"}`}
              onClick={() => pressTile(rowIndex, colIndex)}
              aria-pressed={isLit}
              aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, ${isLit ? "lit" : "off"}`}
              disabled={game.status === "won"}
            />
          ))
        )}
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="New Puzzle" onClick={newPuzzle} />
        <SlapActionButton title="Reset" onClick={resetPuzzle} />
      </div>

      {game.status === "won" ? (
        <SlapInlineText>Nice work. Tap New Puzzle to play again.</SlapInlineText>
      ) : null}
    </SlapApplicationShell>
  );
};

export const lightsOutManifest: SlapApplicationManifest = {
  id: "lights-out",
  title: "Lights Out",
  author: "Joel",
  description: "Toggle tiles to switch off every light.",
  icon: "💡",
  Preview,
  Application: LightsOutApp
};
