import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type CellState = 0 | 1 | 2;

type InputMode = "fill" | "mark";

type Puzzle = {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  size: number;
  solution: boolean[][];
};

type GameState = {
  puzzleId: string;
  board: CellState[][];
  moves: number;
  mode: InputMode;
  status: "playing" | "solved";
  startedAtIso: string;
  updatedAtIso: string;
};

type StoredState = Pick<GameState, "puzzleId" | "board" | "moves" | "mode" | "startedAtIso" | "updatedAtIso">;

const STORAGE_PATH = "nonogram-state.json";
const UNKNOWN: CellState = 0;
const FILLED: CellState = 1;
const EMPTY: CellState = 2;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Nonogram</strong>
    <p>Fill the grid to match the row and column clues.</p>
  </article>
);

const makePuzzle = (id: string, title: string, difficulty: Puzzle["difficulty"], pattern: string[]): Puzzle => {
  const size = pattern.length;
  const solution = pattern.map((row) => row.split("").map((cell) => cell === "#"));
  return { id, title, difficulty, size, solution };
};

const PUZZLES: Puzzle[] = [
  makePuzzle("heart", "Heart", "easy", [".#.#.", "#####", "#####", ".###.", "..#.."]),
  makePuzzle("letter-a", "Letter A", "easy", [".###.", "#...#", "#####", "#...#", "#...#"]),
  makePuzzle("smile", "Smile", "easy", [".###.", "#...#", "#.#.#", "#...#", ".###."]),
  makePuzzle("arrow", "Arrow", "easy", ["..#..", ".##..", "#####", ".##..", "..#.."]),
  makePuzzle("invader", "Invader", "medium", [
    "..#....#..",
    "...#..#...",
    "..######..",
    ".##.##.##.",
    "##########",
    "#.######.#",
    "#.#....#.#",
    "...####...",
    "..#....#..",
    ".#......#."
  ]),
  makePuzzle("pine", "Pine Tree", "medium", [
    "....#.....",
    "...###....",
    "..#####...",
    ".#######..",
    "#########.",
    "...###....",
    "...###....",
    "...###....",
    "..#####...",
    ".#######.."
  ]),
  makePuzzle("rocket", "Rocket", "hard", [
    "....##....",
    "...####...",
    "..######..",
    "..######..",
    "...####...",
    "....##....",
    "...####...",
    "..######..",
    ".########.",
    ".##....##."
  ])
];

const puzzleById = new Map(PUZZLES.map((puzzle) => [puzzle.id, puzzle]));

const createEmptyBoard = (size: number): CellState[][] =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => UNKNOWN));

const cloneBoard = (board: CellState[][]): CellState[][] => board.map((row) => [...row]);

const countFilled = (solution: boolean[][]) =>
  solution.reduce((total, row) => total + row.filter((cell) => cell).length, 0);

const lineClues = (line: boolean[]) => {
  const clues: number[] = [];
  let run = 0;
  for (const cell of line) {
    if (cell) {
      run += 1;
    } else if (run > 0) {
      clues.push(run);
      run = 0;
    }
  }
  if (run > 0) clues.push(run);
  return clues.length > 0 ? clues : [0];
};

const getRowClues = (solution: boolean[][]) => solution.map((row) => lineClues(row));

const getColClues = (solution: boolean[][]) => {
  const size = solution.length;
  return Array.from({ length: size }, (_, colIndex) => lineClues(solution.map((row) => row[colIndex])));
};

const isSolved = (board: CellState[][], solution: boolean[][]) => {
  for (let row = 0; row < solution.length; row += 1) {
    for (let col = 0; col < solution.length; col += 1) {
      const target = solution[row][col];
      const isFilled = board[row][col] === FILLED;
      if (target !== isFilled) return false;
    }
  }
  return true;
};

const countMistakes = (board: CellState[][], solution: boolean[][]) => {
  let mistakes = 0;
  for (let row = 0; row < solution.length; row += 1) {
    for (let col = 0; col < solution.length; col += 1) {
      if (board[row][col] === FILLED && !solution[row][col]) mistakes += 1;
    }
  }
  return mistakes;
};

const pickPuzzle = (options: { currentId?: string; size?: number } = {}) => {
  const { currentId, size } = options;
  const pool = size ? PUZZLES.filter((puzzle) => puzzle.size === size) : PUZZLES;
  const safePool = pool.length > 1 ? pool.filter((puzzle) => puzzle.id !== currentId) : pool;
  return safePool[Math.floor(Math.random() * safePool.length)] ?? PUZZLES[0];
};

const isBoard = (value: unknown, size: number): value is CellState[][] => {
  if (!Array.isArray(value) || value.length !== size) return false;
  return value.every(
    (row) =>
      Array.isArray(row) &&
      row.length === size &&
      row.every((cell) => cell === UNKNOWN || cell === FILLED || cell === EMPTY)
  );
};

const parseStoredState = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (typeof parsed.puzzleId !== "string") return null;
    const puzzle = puzzleById.get(parsed.puzzleId);
    if (!puzzle) return null;
    if (!isBoard(parsed.board, puzzle.size)) return null;

    const moves = typeof parsed.moves === "number" && parsed.moves >= 0 ? Math.floor(parsed.moves) : 0;
    const mode: InputMode = parsed.mode === "mark" ? "mark" : "fill";
    const startedAtIso = typeof parsed.startedAtIso === "string" ? parsed.startedAtIso : new Date().toISOString();
    const updatedAtIso = typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : startedAtIso;
    const solved = isSolved(parsed.board as CellState[][], puzzle.solution);

    return {
      puzzleId: puzzle.id,
      board: parsed.board as CellState[][],
      moves,
      mode,
      status: solved ? "solved" : "playing",
      startedAtIso,
      updatedAtIso
    };
  } catch {
    return null;
  }
};

const createNewGame = (puzzle: Puzzle, mode: InputMode): GameState => {
  const now = new Date().toISOString();
  return {
    puzzleId: puzzle.id,
    board: createEmptyBoard(puzzle.size),
    moves: 0,
    mode,
    status: "playing",
    startedAtIso: now,
    updatedAtIso: now
  };
};

const NonogramApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [game, setGame] = useState<GameState>(() => createNewGame(PUZZLES[0], "fill"));
  const [statusText, setStatusText] = useState("Fill the grid to match the clues.");

  const puzzle = puzzleById.get(game.puzzleId) ?? PUZZLES[0];
  const rowClues = useMemo(() => getRowClues(puzzle.solution), [puzzle]);
  const colClues = useMemo(() => getColClues(puzzle.solution), [puzzle]);
  const totalFilled = useMemo(() => countFilled(puzzle.solution), [puzzle]);
  const filledCorrect = useMemo(() => {
    let count = 0;
    for (let row = 0; row < puzzle.size; row += 1) {
      for (let col = 0; col < puzzle.size; col += 1) {
        if (puzzle.solution[row][col] && game.board[row][col] === FILLED) count += 1;
      }
    }
    return count;
  }, [game.board, puzzle]);
  const mistakes = useMemo(() => countMistakes(game.board, puzzle.solution), [game.board, puzzle]);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      const parsed = parseStoredState(raw);
      if (parsed) {
        setGame(parsed);
        setStatusText(parsed.status === "solved" ? "Puzzle solved." : "Loaded saved puzzle.");
        return;
      }
      setStatusText("Saved puzzle was invalid. Starting fresh.");
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    const payload: StoredState = {
      puzzleId: game.puzzleId,
      board: game.board,
      moves: game.moves,
      mode: game.mode,
      startedAtIso: game.startedAtIso,
      updatedAtIso: game.updatedAtIso
    };
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(payload, null, 2));
  }, [ctx.vfs, game]);

  const toggleCell = (row: number, col: number) => {
    setGame((current) => {
      if (current.status === "solved") return current;
      const nextBoard = cloneBoard(current.board);
      const currentCell = nextBoard[row][col];
      const nextCell = current.mode === "fill" ? (currentCell === FILLED ? UNKNOWN : FILLED) : currentCell === EMPTY ? UNKNOWN : EMPTY;
      nextBoard[row][col] = nextCell;

      const updatedAtIso = new Date().toISOString();
      const solved = isSolved(nextBoard, puzzle.solution);
      if (solved) {
        setStatusText(`Solved in ${current.moves + 1} moves!`);
      }

      return {
        ...current,
        board: nextBoard,
        moves: current.moves + 1,
        status: solved ? "solved" : "playing",
        updatedAtIso
      };
    });
  };

  const setMode = (mode: InputMode) => {
    setGame((current) => ({ ...current, mode }));
    setStatusText(mode === "fill" ? "Fill mode active." : "Mark mode active.");
  };

  const resetBoard = () => {
    setGame((current) => {
      const board = createEmptyBoard(puzzle.size);
      return {
        ...current,
        board,
        moves: 0,
        status: "playing",
        updatedAtIso: new Date().toISOString()
      };
    });
    setStatusText("Board cleared.");
  };

  const startNewPuzzle = (size?: number) => {
    setGame((current) => {
      const nextPuzzle = pickPuzzle({ currentId: current.puzzleId, size });
      return createNewGame(nextPuzzle, current.mode);
    });
    setStatusText("New puzzle ready.");
  };

  const sizeOptions = useMemo(() => Array.from(new Set(PUZZLES.map((puzzle) => puzzle.size))).sort((a, b) => a - b), []);

  const boardStyle = useMemo(
    () =>
      ({
        "--nono-size": puzzle.size
      }) as CSSProperties,
    [puzzle.size]
  );

  return (
    <SlapApplicationShell title="Nonogram">
      <SlapInlineText>Fill cells to match each row and column clue.</SlapInlineText>
      <SlapInlineText>
        Puzzle: {puzzle.title} · {puzzle.difficulty} · {puzzle.size}x{puzzle.size}
      </SlapInlineText>
      <SlapInlineText>
        Filled: {filledCorrect}/{totalFilled} · Mistakes: {mistakes} · Moves: {game.moves}
      </SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="nonogram-board" style={boardStyle} aria-label="Nonogram board">
        <div className="nonogram-corner" aria-hidden="true" />
        <div className="nonogram-col-clues">
          {colClues.map((clue, index) => (
            <div key={`col-${index}`} className="nonogram-col-clue">
              {clue.map((value, clueIndex) => (
                <span key={`col-${index}-${clueIndex}`} className="nonogram-clue-number">
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="nonogram-row-clues">
          {rowClues.map((clue, index) => (
            <div key={`row-${index}`} className="nonogram-row-clue">
              {clue.map((value, clueIndex) => (
                <span key={`row-${index}-${clueIndex}`} className="nonogram-clue-number">
                  {value}
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="nonogram-grid">
          {game.board.map((row, rowIndex) =>
            row.map((cell, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                type="button"
                className={`nonogram-cell${cell === FILLED ? " is-filled" : cell === EMPTY ? " is-empty" : ""}`}
                onClick={() => toggleCell(rowIndex, colIndex)}
                aria-pressed={cell === FILLED}
                aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, ${
                  cell === FILLED ? "filled" : cell === EMPTY ? "marked empty" : "unknown"
                }`}
                disabled={game.status === "solved"}
              />
            ))
          )}
        </div>
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Fill Mode" onClick={() => setMode("fill")} disabled={game.mode === "fill"} />
        <SlapActionButton title="Mark Mode" onClick={() => setMode("mark")} disabled={game.mode === "mark"} />
        <SlapActionButton title="Reset" onClick={resetBoard} />
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="New Puzzle" onClick={() => startNewPuzzle()} />
        {sizeOptions.map((size) => (
          <SlapActionButton key={size} title={`${size}x${size}`} onClick={() => startNewPuzzle(size)} />
        ))}
      </div>
    </SlapApplicationShell>
  );
};

export const nonogramManifest: SlapApplicationManifest = {
  id: "nonogram",
  title: "Nonogram",
  author: "Joel",
  description: "Solve picture logic puzzles by matching row and column clues.",
  icon: "🧩",
  Preview,
  Application: NonogramApp
};
