import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText, SlapGamepad } from "@slap/ui";

type Direction = "left" | "right" | "up" | "down";
type Board = number[][];

type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew?: boolean;
  merged?: boolean;
};

type GameState = {
  tiles: Tile[];
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

const boardFromTiles = (tiles: Tile[]): Board => {
  const board = emptyBoard();
  for (const tile of tiles) {
    board[tile.row][tile.col] = tile.value;
  }
  return board;
};

const randomTileValue = () => (Math.random() < 0.9 ? 2 : 4);

const addRandomTile = (tiles: Tile[], getId: () => number): Tile[] => {
  const board = boardFromTiles(tiles);
  const emptyCells: Array<{ row: number; col: number }> = [];

  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (board[row][col] === 0) emptyCells.push({ row, col });
    }
  }

  if (emptyCells.length === 0) return tiles;

  const picked = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  const nextTile: Tile = {
    id: getId(),
    value: randomTileValue(),
    row: picked.row,
    col: picked.col,
    isNew: true
  };
  return [...tiles, nextTile];
};

const tilesFromBoard = (board: Board, getId: () => number): Tile[] => {
  const tiles: Tile[] = [];
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      const value = board[row][col];
      if (value === 0) continue;
      tiles.push({ id: getId(), value, row, col });
    }
  }
  return tiles;
};

const newGame = (getId: () => number): GameState => {
  let tiles: Tile[] = [];
  tiles = addRandomTile(tiles, getId);
  tiles = addRandomTile(tiles, getId);
  return { tiles, score: 0, bestScore: 0 };
};

const moveTiles = (tiles: Tile[], direction: Direction) => {
  const grid: Array<Array<Tile | null>> = Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => null));
  for (const tile of tiles) {
    grid[tile.row][tile.col] = tile;
  }

  const nextTiles: Tile[] = [];
  let gained = 0;
  let moved = false;

  const placeTile = (tile: Tile, row: number, col: number, merged: boolean) => {
    if (tile.row !== row || tile.col !== col || merged) {
      moved = true;
    }
    nextTiles.push({
      ...tile,
      row,
      col,
      merged
    });
  };

  if (direction === "left" || direction === "right") {
    for (let row = 0; row < SIZE; row += 1) {
      const line: Tile[] = [];
      for (let col = 0; col < SIZE; col += 1) {
        const tile = grid[row][col];
        if (tile) line.push(tile);
      }
      if (direction === "right") line.reverse();

      let targetIndex = 0;
      for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const next = line[index + 1];
        const targetCol = direction === "left" ? targetIndex : SIZE - 1 - targetIndex;

        if (next && next.value === current.value) {
          const mergedValue = current.value * 2;
          gained += mergedValue;
          placeTile({ ...current, value: mergedValue }, row, targetCol, true);
          index += 1;
          targetIndex += 1;
          continue;
        }

        placeTile(current, row, targetCol, false);
        targetIndex += 1;
      }
    }
  } else {
    for (let col = 0; col < SIZE; col += 1) {
      const line: Tile[] = [];
      for (let row = 0; row < SIZE; row += 1) {
        const tile = grid[row][col];
        if (tile) line.push(tile);
      }
      if (direction === "down") line.reverse();

      let targetIndex = 0;
      for (let index = 0; index < line.length; index += 1) {
        const current = line[index];
        const next = line[index + 1];
        const targetRow = direction === "up" ? targetIndex : SIZE - 1 - targetIndex;

        if (next && next.value === current.value) {
          const mergedValue = current.value * 2;
          gained += mergedValue;
          placeTile({ ...current, value: mergedValue }, targetRow, col, true);
          index += 1;
          targetIndex += 1;
          continue;
        }

        placeTile(current, targetRow, col, false);
        targetIndex += 1;
      }
    }
  }

  return { nextTiles, gained, moved };
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
  const tileIdRef = useRef(1);
  const getNextId = useCallback(() => tileIdRef.current++, []);
  const [state, setState] = useState<GameState>(() => newGame(getNextId));
  const [status, setStatus] = useState("Swipe to play.");
  const [shake, setShake] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const undoRef = useRef<{ tiles: Tile[]; score: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as Partial<{ board: Board; score: number; bestScore: number }>;
        if (!Array.isArray(parsed.board) || typeof parsed.score !== "number" || typeof parsed.bestScore !== "number") {
          return;
        }

        const validBoard = parsed.board.every(
          (row) => Array.isArray(row) && row.length === SIZE && row.every((value) => typeof value === "number")
        );

        if (validBoard) {
          setState({ tiles: tilesFromBoard(parsed.board as Board, getNextId), score: parsed.score, bestScore: parsed.bestScore });
        }
      } catch {
        setStatus("Saved game data was invalid. Starting fresh.");
      }
    })();
  }, [ctx.vfs, getNextId]);

  useEffect(() => {
    const board = boardFromTiles(state.tiles);
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify({ board, score: state.score, bestScore: state.bestScore }, null, 2));
  }, [ctx.vfs, state]);

  useEffect(() => {
    if (!shake) return;
    const timer = window.setTimeout(() => setShake(false), 180);
    return () => window.clearTimeout(timer);
  }, [shake]);

  const move = (direction: Direction) => {
    setState((current) => {
      const cleanedTiles = current.tiles.map((tile) => ({ ...tile, isNew: false, merged: false }));
      const { nextTiles, gained, moved } = moveTiles(cleanedTiles, direction);
      if (!moved) {
        setShake(true);
        return current;
      }

      undoRef.current = {
        tiles: cleanedTiles.map((tile) => ({ ...tile })),
        score: current.score
      };
      setCanUndo(true);

      const tilesWithSpawn = addRandomTile(nextTiles, getNextId);
      const score = current.score + gained;
      const bestScore = Math.max(current.bestScore, score);
      const boardAfterSpawn = boardFromTiles(tilesWithSpawn);

      if (boardAfterSpawn.some((row) => row.some((value) => value === 2048))) {
        setStatus("You reached 2048!");
      } else if (!hasMovesLeft(boardAfterSpawn)) {
        setStatus("No moves left. Start a new game.");
      } else {
        setStatus("Keep going.");
      }

      return {
        tiles: tilesWithSpawn,
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
    const fresh = newGame(getNextId);
    setState({ ...fresh, bestScore });
    setStatus("New game started.");
    undoRef.current = null;
    setCanUndo(false);
  };

  const undo = () => {
    const previous = undoRef.current;
    if (!previous) return;
    setState((current) => ({
      tiles: previous.tiles.map((tile) => ({ ...tile, isNew: false, merged: false })),
      score: previous.score,
      bestScore: current.bestScore
    }));
    setStatus("Undid last move.");
    undoRef.current = null;
    setCanUndo(false);
  };

  const board = useMemo(() => boardFromTiles(state.tiles), [state.tiles]);
  const gameOver = useMemo(() => !hasMovesLeft(board), [board]);

  return (
    <SlapApplicationShell title="2048">
      <SlapInlineText>Swipe tiles to combine matching numbers.</SlapInlineText>
      <SlapInlineText>Score: {state.score} | Best: {state.bestScore}</SlapInlineText>
      <SlapInlineText>{status}</SlapInlineText>

      <SlapInlineText>Use arrow keys, swipe, tap board edges, or the D-pad.</SlapInlineText>

      <div className="game2048-wrap">
        <SlapInlineText>Gamepad: D-pad moves. A = new game, B = undo.</SlapInlineText>

        <div
          className={`game2048-board${shake ? " is-shake" : ""}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onClick={onBoardClick}
          aria-label="2048 board"
        >
          <div className="game2048-grid" aria-hidden="true">
            {Array.from({ length: SIZE * SIZE }, (_, index) => (
              <div key={`cell-${index}`} className="game2048-cell" />
            ))}
          </div>
          <div className="game2048-tiles">
            {state.tiles.map((tile) => (
              <div
                key={tile.id}
                className={[
                  "game2048-tile",
                  tileClass(tile.value),
                  tile.isNew ? "is-new" : "",
                  tile.merged ? "is-merged" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                style={{
                  top: `calc((var(--tile-size) + var(--tile-gap)) * ${tile.row})`,
                  left: `calc((var(--tile-size) + var(--tile-gap)) * ${tile.col})`
                }}
              >
                {tile.value}
              </div>
            ))}
          </div>
        </div>


        <SlapGamepad
          onUp={() => move("up")}
          onDown={() => move("down")}
          onLeft={() => move("left")}
          onRight={() => move("right")}
          onA={restart}
          onB={undo}
          dpadDisabled={gameOver}
          bDisabled={!canUndo}
          aTitle="New game"
          bTitle="Undo move"
        />
        
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
