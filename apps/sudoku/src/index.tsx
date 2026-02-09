import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Difficulty = "easy" | "medium" | "hard";

type GameStatus = "playing" | "won";

type GameState = {
  puzzle: number[][];
  solution: number[][];
  current: number[][];
  fixed: boolean[][];
  difficulty: Difficulty;
  status: GameStatus;
  showNotes: boolean;
  startedAtIso: string;
  updatedAtIso: string;
};

type Cell = { row: number; col: number };

type StoredGame = Partial<GameState>;

const STORAGE_PATH = "sudoku-state.json";
const SIZE = 9;
const SUB = 3;

const DIFFICULTY_GIVENS: Record<Difficulty, number> = {
  easy: 38,
  medium: 30,
  hard: 24
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Sudoku</strong>
    <p>Fill the grid with numbers 1-9. Pick easy, medium, or hard.</p>
  </article>
);

const createEmptyGrid = () => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));

const cloneGrid = (grid: number[][]) => grid.map((row) => [...row]);

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const isValidPlacement = (grid: number[][], row: number, col: number, value: number) => {
  for (let index = 0; index < SIZE; index += 1) {
    if (grid[row][index] === value) return false;
    if (grid[index][col] === value) return false;
  }

  const startRow = Math.floor(row / SUB) * SUB;
  const startCol = Math.floor(col / SUB) * SUB;
  for (let r = startRow; r < startRow + SUB; r += 1) {
    for (let c = startCol; c < startCol + SUB; c += 1) {
      if (grid[r][c] === value) return false;
    }
  }

  return true;
};

const findBestEmptyCell = (grid: number[][]): Cell | null => {
  let bestCell: Cell | null = null;
  let bestCount = 10;

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (grid[row][col] !== 0) continue;
      let count = 0;
      for (let value = 1; value <= SIZE; value += 1) {
        if (isValidPlacement(grid, row, col, value)) count += 1;
      }
      if (count < bestCount) {
        bestCount = count;
        bestCell = { row, col };
        if (bestCount === 1) return bestCell;
      }
    }
  }

  return bestCell;
};

const solveGrid = (grid: number[][]): boolean => {
  const cell = findBestEmptyCell(grid);
  if (!cell) return true;

  const { row, col } = cell;
  const candidates = shuffle(
    Array.from({ length: SIZE }, (_, index) => index + 1).filter((value) => isValidPlacement(grid, row, col, value))
  );

  for (const value of candidates) {
    grid[row][col] = value;
    if (solveGrid(grid)) return true;
    grid[row][col] = 0;
  }

  return false;
};

const countSolutions = (grid: number[][], limit = 2): number => {
  const cell = findBestEmptyCell(grid);
  if (!cell) return 1;

  const { row, col } = cell;
  let count = 0;
  for (let value = 1; value <= SIZE; value += 1) {
    if (!isValidPlacement(grid, row, col, value)) continue;
    grid[row][col] = value;
    count += countSolutions(grid, limit);
    if (count >= limit) {
      grid[row][col] = 0;
      return count;
    }
    grid[row][col] = 0;
  }

  return count;
};

const generateSolvedGrid = () => {
  const grid = createEmptyGrid();
  solveGrid(grid);
  return grid;
};

const generatePuzzle = (difficulty: Difficulty) => {
  const solution = generateSolvedGrid();
  const puzzle = cloneGrid(solution);
  const targetGivens = DIFFICULTY_GIVENS[difficulty];

  const positions = shuffle(
    Array.from({ length: SIZE * SIZE }, (_, index) => ({
      row: Math.floor(index / SIZE),
      col: index % SIZE
    }))
  );

  for (const position of positions) {
    const filled = puzzle.flat().filter((value) => value !== 0).length;
    if (filled <= targetGivens) break;

    const { row, col } = position;
    const backup = puzzle[row][col];
    if (backup === 0) continue;
    puzzle[row][col] = 0;

    const candidate = cloneGrid(puzzle);
    const solutions = countSolutions(candidate, 2);
    if (solutions !== 1) {
      puzzle[row][col] = backup;
    }
  }

  return { puzzle, solution };
};

const toFixedMask = (puzzle: number[][]) => puzzle.map((row) => row.map((value) => value !== 0));

const isSolved = (grid: number[][], solution: number[][]) =>
  grid.every((row, rowIndex) => row.every((value, colIndex) => value === solution[rowIndex][colIndex]));

const isBooleanGrid = (value: unknown): value is boolean[][] =>
  Array.isArray(value) &&
  value.length === SIZE &&
  value.every((row) => Array.isArray(row) && row.length === SIZE && row.every((entry) => typeof entry === "boolean"));

const getCandidates = (grid: number[][], row: number, col: number) => {
  const next = cloneGrid(grid);
  next[row][col] = 0;
  return Array.from({ length: SIZE }, (_, index) => index + 1).filter((value) =>
    isValidPlacement(next, row, col, value)
  );
};

const createNewGame = (difficulty: Difficulty, showNotes = true): GameState => {
  const now = new Date().toISOString();
  const { puzzle, solution } = generatePuzzle(difficulty);
  return {
    puzzle,
    solution,
    current: cloneGrid(puzzle),
    fixed: toFixedMask(puzzle),
    difficulty,
    status: "playing",
    showNotes,
    startedAtIso: now,
    updatedAtIso: now
  };
};

const parseStoredGame = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw) as StoredGame;
    if (!Array.isArray(parsed.puzzle) || !Array.isArray(parsed.solution) || !Array.isArray(parsed.current)) {
      return null;
    }

    const isGrid = (grid: unknown): grid is number[][] =>
      Array.isArray(grid) &&
      grid.length === SIZE &&
      grid.every(
        (row) => Array.isArray(row) && row.length === SIZE && row.every((value) => typeof value === "number")
      );

    if (!isGrid(parsed.puzzle) || !isGrid(parsed.solution) || !isGrid(parsed.current)) {
      return null;
    }

    const difficulty: Difficulty = parsed.difficulty === "medium" || parsed.difficulty === "hard" ? parsed.difficulty : "easy";
    const fixed = isBooleanGrid(parsed.fixed) ? parsed.fixed : toFixedMask(parsed.puzzle);

    const status: GameStatus = parsed.status === "won" ? "won" : "playing";
    const showNotes = typeof parsed.showNotes === "boolean" ? parsed.showNotes : true;
    const startedAtIso = typeof parsed.startedAtIso === "string" ? parsed.startedAtIso : new Date().toISOString();
    const updatedAtIso = typeof parsed.updatedAtIso === "string" ? parsed.updatedAtIso : startedAtIso;

    return {
      puzzle: parsed.puzzle,
      solution: parsed.solution,
      current: parsed.current,
      fixed,
      difficulty,
      status,
      showNotes,
      startedAtIso,
      updatedAtIso
    };
  } catch {
    return null;
  }
};

const getConflicts = (grid: number[][]) => {
  const conflicts = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => false));

  for (let row = 0; row < SIZE; row += 1) {
    const seen = new Map<number, number[]>();
    for (let col = 0; col < SIZE; col += 1) {
      const value = grid[row][col];
      if (value === 0) continue;
      const list = seen.get(value) ?? [];
      list.push(col);
      seen.set(value, list);
    }
    for (const [, cols] of seen.entries()) {
      if (cols.length > 1) {
        for (const col of cols) conflicts[row][col] = true;
      }
    }
  }

  for (let col = 0; col < SIZE; col += 1) {
    const seen = new Map<number, number[]>();
    for (let row = 0; row < SIZE; row += 1) {
      const value = grid[row][col];
      if (value === 0) continue;
      const list = seen.get(value) ?? [];
      list.push(row);
      seen.set(value, list);
    }
    for (const [, rows] of seen.entries()) {
      if (rows.length > 1) {
        for (const row of rows) conflicts[row][col] = true;
      }
    }
  }

  for (let boxRow = 0; boxRow < SUB; boxRow += 1) {
    for (let boxCol = 0; boxCol < SUB; boxCol += 1) {
      const seen = new Map<number, Array<{ row: number; col: number }>>();
      for (let row = boxRow * SUB; row < boxRow * SUB + SUB; row += 1) {
        for (let col = boxCol * SUB; col < boxCol * SUB + SUB; col += 1) {
          const value = grid[row][col];
          if (value === 0) continue;
          const list = seen.get(value) ?? [];
          list.push({ row, col });
          seen.set(value, list);
        }
      }
      for (const [, cells] of seen.entries()) {
        if (cells.length > 1) {
          for (const cell of cells) conflicts[cell.row][cell.col] = true;
        }
      }
    }
  }

  return conflicts;
};

const SudokuApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [game, setGame] = useState<GameState>(() => createNewGame("easy"));
  const [selected, setSelected] = useState<Cell | null>(null);
  const [message, setMessage] = useState("New easy puzzle ready.");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      const parsed = parseStoredGame(raw);
      if (parsed) {
        setGame(parsed);
        setMessage(`Resumed ${parsed.difficulty} puzzle.`);
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(game, null, 2));
  }, [ctx.vfs, game]);

  const conflicts = useMemo(() => getConflicts(game.current), [game.current]);

  const startNewGame = (difficulty: Difficulty) => {
    setGame((current) => createNewGame(difficulty, current.showNotes));
    setSelected(null);
    setMessage(`New ${difficulty} puzzle ready.`);
  };

  const toggleNotes = () => {
    setGame((current) => ({
      ...current,
      showNotes: !current.showNotes,
      updatedAtIso: new Date().toISOString()
    }));
  };

  const updateCell = (value: number) => {
    if (!selected) return;
    const { row, col } = selected;
    if (game.fixed[row][col] || game.status !== "playing") return;
    if (value !== 0) {
      const candidates = getCandidates(game.current, row, col);
      if (!candidates.includes(value)) {
        setMessage("That number can't go there.");
        return;
      }
    }

    setGame((current) => {
      const next = cloneGrid(current.current);
      next[row][col] = value;
      const completed = next.flat().every((entry) => entry !== 0);
      const solved = completed && isSolved(next, current.solution);
      const nextStatus: GameStatus = solved ? "won" : "playing";
      if (completed && !solved) {
        setMessage("Everything is filled, but something doesn't match yet.");
      } else if (solved) {
        setMessage("Puzzle solved!");
      }
      return {
        ...current,
        current: next,
        status: nextStatus,
        updatedAtIso: new Date().toISOString()
      };
    });
  };

  const eraseCell = () => updateCell(0);

  const filledCount = game.current.flat().filter((value) => value !== 0).length;
  const isComplete = game.status === "won";
  const canEdit =
    selected !== null && game.status === "playing" && !game.fixed[selected.row][selected.col];
  const allowedNumbers = useMemo(() => {
    if (!selected || !canEdit) return [];
    return getCandidates(game.current, selected.row, selected.col);
  }, [canEdit, game.current, selected]);

  return (
    <SlapApplicationShell title="Sudoku">
      <SlapApplicationTitle title="Sudoku" />
      <SlapInlineText>Fill every row, column, and 3×3 box with 1–9.</SlapInlineText>
      <SlapInlineText>{message}</SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="Easy" onClick={() => startNewGame("easy")} />
        <SlapActionButton title="Medium" onClick={() => startNewGame("medium")} />
        <SlapActionButton title="Hard" onClick={() => startNewGame("hard")} />
        <SlapActionButton title={game.showNotes ? "Hide Notes" : "Show Notes"} onClick={toggleNotes} />
      </div>

      <SlapInlineText>
        Difficulty: {game.difficulty} · Filled: {filledCount}/81 {isComplete ? "· Completed" : ""}
      </SlapInlineText>

      <div className="sudoku-grid">
        {game.current.map((row, rowIndex) =>
          row.map((value, colIndex) => {
            const isFixed = game.fixed[rowIndex][colIndex];
            const isSelected = selected?.row === rowIndex && selected?.col === colIndex;
            const isConflict = conflicts[rowIndex][colIndex];
            const className = [
              "sudoku-cell",
              isFixed ? "is-fixed" : "",
              isSelected ? "is-selected" : "",
              isConflict ? "is-conflict" : "",
              rowIndex % 3 === 0 ? "border-top" : "",
              colIndex % 3 === 0 ? "border-left" : "",
              rowIndex === SIZE - 1 ? "border-bottom" : "",
              colIndex === SIZE - 1 ? "border-right" : ""
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={`cell-${rowIndex}-${colIndex}`}
                type="button"
                className={className}
                onClick={() => setSelected({ row: rowIndex, col: colIndex })}
                aria-label={`Row ${rowIndex + 1} Column ${colIndex + 1}`}
              >
                {value !== 0 ? (
                  value
                ) : game.showNotes ? (
                  <span className="sudoku-notes">
                    {Array.from({ length: 9 }, (_, idx) => {
                      const candidate = idx + 1;
                      const showCandidate = getCandidates(game.current, rowIndex, colIndex).includes(candidate);
                      return (
                        <span key={candidate} className={`sudoku-note${showCandidate ? "" : " is-hidden"}`}>
                          {candidate}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  ""
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="sudoku-keypad">
        {Array.from({ length: 9 }, (_, index) => {
          const value = index + 1;
          const isAllowed = allowedNumbers.includes(value);
          return (
            <button
              key={value}
              type="button"
              className="sudoku-key"
              onClick={() => updateCell(value)}
              disabled={!canEdit || !isAllowed}
            >
              {value}
            </button>
          );
        })}
        <button
          type="button"
          className="sudoku-key sudoku-key-clear"
          onClick={eraseCell}
          disabled={!canEdit}
        >
          Erase
        </button>
      </div>

      {isComplete ? <SlapInlineText>Puzzle solved! Start a new game to play again.</SlapInlineText> : null}
    </SlapApplicationShell>
  );
};

export const sudokuManifest: SlapApplicationManifest = {
  id: "sudoku",
  title: "Sudoku",
  author: "Joel",
  description: "Generate easy, medium, or hard Sudoku puzzles.",
  icon: "🔢",
  Preview,
  Application: SudokuApp
};
