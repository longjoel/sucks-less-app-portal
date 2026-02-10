import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText } from "@slap/ui";

type GameState = {
  size: number;
  board: boolean[][];
  generation: number;
  isRunning: boolean;
  speedMs: number;
};

type StoredState = {
  size: number;
  board: boolean[][];
  generation: number;
  speedMs: number;
};

const STORAGE_PATH = "game-of-life-state.json";
const DEFAULT_SIZE = 16;
const DEFAULT_SPEED_MS = 260;
const MIN_SPEED_MS = 80;
const MAX_SPEED_MS = 600;
const SPEED_STEP = 20;
const RANDOM_DENSITY = 0.32;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Game of Life</strong>
    <p>Seed cells and watch the generations evolve.</p>
  </article>
);

const createEmptyBoard = (size: number): boolean[][] =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => false));

const cloneBoard = (board: boolean[][]): boolean[][] => board.map((row) => [...row]);

const createRandomBoard = (size: number, density = RANDOM_DENSITY): boolean[][] => {
  const board = createEmptyBoard(size);
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      board[row][col] = Math.random() < density;
    }
  }
  return board;
};

const countAlive = (board: boolean[][]) =>
  board.reduce((total, row) => total + row.filter((cell) => cell).length, 0);

const countNeighbors = (board: boolean[][], row: number, col: number) => {
  const size = board.length;
  let count = 0;
  for (let dr = -1; dr <= 1; dr += 1) {
    for (let dc = -1; dc <= 1; dc += 1) {
      if (dr === 0 && dc === 0) continue;
      const nr = row + dr;
      const nc = col + dc;
      if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
      if (board[nr][nc]) count += 1;
    }
  }
  return count;
};

const stepBoard = (board: boolean[][]) => {
  const size = board.length;
  const next = createEmptyBoard(size);
  let alive = 0;
  let changed = false;

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const neighbors = countNeighbors(board, row, col);
      const isAlive = board[row][col];
      const nextAlive = isAlive ? neighbors === 2 || neighbors === 3 : neighbors === 3;
      next[row][col] = nextAlive;
      if (nextAlive) alive += 1;
      if (nextAlive !== isAlive) changed = true;
    }
  }

  return { next, alive, changed };
};

const isBoard = (value: unknown, size: number): value is boolean[][] => {
  if (!Array.isArray(value) || value.length !== size) return false;
  return value.every(
    (row) => Array.isArray(row) && row.length === size && row.every((cell) => typeof cell === "boolean")
  );
};

const parseStoredState = (raw: string): GameState | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (typeof parsed.size !== "number" || parsed.size <= 0) return null;
    const size = Math.floor(parsed.size);
    if (!isBoard(parsed.board, size)) return null;

    const generation = typeof parsed.generation === "number" && parsed.generation >= 0 ? Math.floor(parsed.generation) : 0;
    const speedMs =
      typeof parsed.speedMs === "number" && parsed.speedMs >= MIN_SPEED_MS && parsed.speedMs <= MAX_SPEED_MS
        ? Math.floor(parsed.speedMs)
        : DEFAULT_SPEED_MS;

    return {
      size,
      board: parsed.board as boolean[][],
      generation,
      isRunning: false,
      speedMs
    };
  } catch {
    return null;
  }
};

const createNewGame = (size: number, speedMs = DEFAULT_SPEED_MS): GameState => ({
  size,
  board: createRandomBoard(size),
  generation: 0,
  isRunning: false,
  speedMs
});

const GameOfLifeApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [game, setGame] = useState<GameState>(() => createNewGame(DEFAULT_SIZE));
  const [statusText, setStatusText] = useState("Seed cells, then press Start.");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      const parsed = parseStoredState(raw);
      if (parsed) {
        setGame(parsed);
        setStatusText("Loaded saved simulation.");
        return;
      }
      setStatusText("Saved simulation was invalid. Starting fresh.");
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    if (game.isRunning) return;
    const payload: StoredState = {
      size: game.size,
      board: game.board,
      generation: game.generation,
      speedMs: game.speedMs
    };
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(payload, null, 2));
  }, [ctx.vfs, game]);

  const aliveCount = useMemo(() => countAlive(game.board), [game.board]);
  const gridStyle = useMemo(() => ({ "--life-cols": game.size } as CSSProperties), [game.size]);

  useEffect(() => {
    if (!game.isRunning) return;
    const timer = window.setInterval(() => {
      setGame((current) => {
        if (!current.isRunning) return current;
        const { next, alive, changed } = stepBoard(current.board);
        const nextGeneration = current.generation + 1;
        let isRunning = current.isRunning;

        if (alive === 0) {
          isRunning = false;
          setStatusText("All cells are dead.");
        } else if (!changed) {
          isRunning = false;
          setStatusText("Simulation stabilized.");
        }

        return {
          ...current,
          board: next,
          generation: nextGeneration,
          isRunning
        };
      });
    }, game.speedMs);

    return () => window.clearInterval(timer);
  }, [game.isRunning, game.speedMs]);

  const toggleCell = (row: number, col: number) => {
    setGame((current) => {
      const nextBoard = cloneBoard(current.board);
      nextBoard[row][col] = !nextBoard[row][col];
      return { ...current, board: nextBoard };
    });
  };

  const toggleRunning = () => {
    setGame((current) => {
      if (!current.isRunning && countAlive(current.board) === 0) {
        setStatusText("Nothing is alive yet. Toggle cells or randomize.");
        return current;
      }
      const nextRunning = !current.isRunning;
      setStatusText(nextRunning ? "Running." : "Paused.");
      return { ...current, isRunning: nextRunning };
    });
  };

  const stepOnce = () => {
    setGame((current) => {
      const { next, alive, changed } = stepBoard(current.board);
      const nextGeneration = current.generation + 1;

      if (alive === 0) {
        setStatusText("All cells are dead.");
      } else if (!changed) {
        setStatusText("Simulation stabilized.");
      } else {
        setStatusText("Advanced one generation.");
      }

      return {
        ...current,
        board: next,
        generation: nextGeneration,
        isRunning: false
      };
    });
  };

  const randomize = () => {
    setGame((current) => ({
      ...current,
      board: createRandomBoard(current.size),
      generation: 0,
      isRunning: false
    }));
    setStatusText("Randomized seed.");
  };

  const clearBoard = () => {
    setGame((current) => ({
      ...current,
      board: createEmptyBoard(current.size),
      generation: 0,
      isRunning: false
    }));
    setStatusText("Cleared board.");
  };

  const setSize = (size: number) => {
    setGame((current) => createNewGame(size, current.speedMs));
    setStatusText(`Size set to ${size}x${size}.`);
  };

  const updateSpeed = (value: number) => {
    setGame((current) => ({ ...current, speedMs: value }));
  };

  return (
    <SlapApplicationShell title="Game of Life">
      <SlapInlineText>Tap cells to toggle life, then let the rules evolve them.</SlapInlineText>
      <SlapInlineText>
        Generation: {game.generation} | Alive: {aliveCount} | Speed: {game.speedMs}ms
      </SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="life-grid" style={gridStyle} aria-label="Game of Life board">
        {game.board.map((row, rowIndex) =>
          row.map((isAlive, colIndex) => (
            <button
              key={`${rowIndex}-${colIndex}`}
              className={`life-cell ${isAlive ? "is-alive" : "is-dead"}`}
              type="button"
              onClick={() => toggleCell(rowIndex, colIndex)}
              aria-pressed={isAlive}
              aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}, ${isAlive ? "alive" : "dead"}`}
            />
          ))
        )}
      </div>

      <div className="slap-button-row">
        <SlapActionButton title={game.isRunning ? "Pause" : "Start"} onClick={toggleRunning} />
        <SlapActionButton title="Step" onClick={stepOnce} />
        <SlapActionButton title="Randomize" onClick={randomize} />
        <SlapActionButton title="Clear" onClick={clearBoard} />
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="10x10" onClick={() => setSize(10)} />
        <SlapActionButton title="16x16" onClick={() => setSize(16)} />
        <SlapActionButton title="20x20" onClick={() => setSize(20)} />
      </div>

      <div className="slap-slider-row">
        <input
          className="slap-slider"
          type="range"
          min={MIN_SPEED_MS}
          max={MAX_SPEED_MS}
          step={SPEED_STEP}
          value={game.speedMs}
          onChange={(event) => updateSpeed(Number(event.target.value))}
        />
        <div className="slap-slider-labels">
          <span>Slow</span>
          <span> </span>
          <span> </span>
          <span>Fast</span>
        </div>
      </div>
    </SlapApplicationShell>
  );
};

export const gameOfLifeManifest: SlapApplicationManifest = {
  id: "game-of-life",
  title: "Game of Life",
  author: "Joel",
  description: "Conway's Game of Life simulator with speed controls.",
  icon: "🧬",
  Preview,
  Application: GameOfLifeApp
};
