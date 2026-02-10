import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapInlineText, SlapGamepad } from "@slap/ui";

type Cell = "wall" | "floor";
type GameStatus = "playing" | "won" | "lost";
type Direction = "up" | "down" | "left" | "right";
type Point = { row: number; col: number };

type GameState = {
  level: number;
  maze: Cell[][];
  player: Point;
  exit: Point;
  key: Point;
  hasKey: boolean;
  coins: Set<string>;
  points: number;
  trees: Set<string>;
  rocks: Set<string>;
  monsters: Set<string>;
  status: GameStatus;
  steps: number;
};

type LevelConfig = {
  rows: number;
  cols: number;
  trees: number;
  rocks: number;
  monsters: number;
  coins: number;
};

const BASE_SIZE = 13;
const MAX_SIZE = 41;
const LEVEL_ADVANCE_MS = 900;
const VIEW_ROWS = 13;
const VIEW_COLS = 13;
const ROOM_ATTEMPTS = 8;
const ROOM_MIN_SIZE = 3;
const ROOM_MAX_SIZE = 7;
const LEVEL_START_POINTS = 100;
const COIN_POINTS = 5;
const STEP_COST = 1;

const CARDINALS: Point[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Emoji Maze</strong>
    <p>Find the key, dodge monsters, and keep clearing bigger mazes.</p>
  </article>
);

const keyOf = (point: Point) => `${point.row}:${point.col}`;

const pointFromKey = (value: string): Point => {
  const [row, col] = value.split(":").map(Number);
  return { row, col };
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const shuffle = <T,>(items: T[]) => {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
};

const chamberOpenings = (maze: Cell[][], row: number, col: number) => {
  let openings = 0;
  for (const direction of CARDINALS) {
    const nextRow = row + direction.row;
    const nextCol = col + direction.col;
    if (nextRow < 0 || nextRow >= maze.length || nextCol < 0 || nextCol >= maze[0].length) continue;
    if (maze[nextRow][nextCol] === "floor") openings += 1;
  }
  return openings;
};

const braidMaze = (maze: Cell[][]) => {
  const rows = maze.length;
  const cols = maze[0].length;
  const roomDirections: Point[] = [
    { row: -2, col: 0 },
    { row: 2, col: 0 },
    { row: 0, col: -2 },
    { row: 0, col: 2 }
  ];

  let changed = true;
  let safety = 0;

  while (changed && safety < rows * cols) {
    changed = false;
    safety += 1;

    for (let row = 1; row < rows - 1; row += 2) {
      for (let col = 1; col < cols - 1; col += 2) {
        if (maze[row][col] !== "floor") continue;
        if (chamberOpenings(maze, row, col) >= 2) continue;

        const candidates = shuffle(
          roomDirections
            .map((direction) => {
              const room = { row: row + direction.row, col: col + direction.col };
              const middle = { row: row + direction.row / 2, col: col + direction.col / 2 };
              return { room, middle };
            })
            .filter(({ room, middle }) => {
              if (room.row <= 0 || room.row >= rows - 1 || room.col <= 0 || room.col >= cols - 1) return false;
              if (maze[room.row][room.col] !== "floor") return false;
              return maze[middle.row][middle.col] === "wall";
            })
        );

        if (candidates.length === 0) continue;
        maze[candidates[0].middle.row][candidates[0].middle.col] = "floor";
        changed = true;
      }
    }
  }
};

const levelConfigFor = (level: number): LevelConfig => {
  const size = Math.min(MAX_SIZE, BASE_SIZE + (level - 1) * 2);
  const rows = size % 2 === 0 ? size + 1 : size;
  const cols = rows;
  const interior = Math.max(1, (rows - 2) * (cols - 2));

  return {
    rows,
    cols,
    trees: Math.max(5, Math.floor(interior * 0.045)),
    rocks: Math.max(4, Math.floor(interior * 0.03)),
    monsters: Math.min(14, 3 + Math.floor(level / 2)),
    coins: Math.max(8, Math.floor(interior * 0.035))
  };
};

const createBaseMaze = (rows: number, cols: number): Cell[][] => {
  const maze: Cell[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => "wall" as Cell)
  );

  const start: Point = { row: 1, col: 1 };
  maze[start.row][start.col] = "floor";

  const stack: Point[] = [start];
  const carveDirections: Point[] = [
    { row: -2, col: 0 },
    { row: 2, col: 0 },
    { row: 0, col: -2 },
    { row: 0, col: 2 }
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];

    const choices = carveDirections
      .map((direction) => ({
        next: {
          row: current.row + direction.row,
          col: current.col + direction.col
        },
        middle: {
          row: current.row + direction.row / 2,
          col: current.col + direction.col / 2
        }
      }))
      .filter(({ next }) => {
        if (next.row <= 0 || next.row >= rows - 1) return false;
        if (next.col <= 0 || next.col >= cols - 1) return false;
        return maze[next.row][next.col] === "wall";
      });

    if (choices.length === 0) {
      stack.pop();
      continue;
    }

    const picked = choices[Math.floor(Math.random() * choices.length)];
    maze[picked.middle.row][picked.middle.col] = "floor";
    maze[picked.next.row][picked.next.col] = "floor";
    stack.push(picked.next);
  }

  maze[rows - 2][cols - 2] = "floor";
  braidMaze(maze);
  carveRooms(maze);
  return maze;
};

const randomOddInRange = (min: number, max: number) => {
  const raw = min + Math.floor(Math.random() * Math.max(1, max - min + 1));
  return raw % 2 === 0 ? raw - 1 : raw;
};

const carveRooms = (maze: Cell[][]) => {
  const rows = maze.length;
  const cols = maze[0].length;
  const attempts = ROOM_ATTEMPTS + Math.floor((rows - BASE_SIZE) / 4);

  for (let i = 0; i < attempts; i += 1) {
    const roomHeight = clamp(randomOddInRange(ROOM_MIN_SIZE, ROOM_MAX_SIZE), ROOM_MIN_SIZE, rows - 2);
    const roomWidth = clamp(randomOddInRange(ROOM_MIN_SIZE, ROOM_MAX_SIZE), ROOM_MIN_SIZE, cols - 2);

    const maxTop = rows - roomHeight - 1;
    const maxLeft = cols - roomWidth - 1;
    if (maxTop <= 1 || maxLeft <= 1) continue;

    const top = clamp(randomOddInRange(1, maxTop), 1, maxTop);
    const left = clamp(randomOddInRange(1, maxLeft), 1, maxLeft);

    for (let row = top; row < top + roomHeight; row += 1) {
      for (let col = left; col < left + roomWidth; col += 1) {
        maze[row][col] = "floor";
      }
    }

    // Ensure each room has multiple entry points into the surrounding maze.
    const doors = shuffle([
      { row: top, col: left + Math.floor(roomWidth / 2) },
      { row: top + roomHeight - 1, col: left + Math.floor(roomWidth / 2) },
      { row: top + Math.floor(roomHeight / 2), col: left },
      { row: top + Math.floor(roomHeight / 2), col: left + roomWidth - 1 }
    ]);

    for (const door of doors.slice(0, 2 + Math.floor(Math.random() * 2))) {
      maze[door.row][door.col] = "floor";
    }
  }
};

const randomFloorPoints = (maze: Cell[][], blocked: Set<string>) => {
  const points: Point[] = [];
  for (let row = 1; row < maze.length - 1; row += 1) {
    for (let col = 1; col < maze[0].length - 1; col += 1) {
      if (maze[row][col] !== "floor") continue;
      const key = `${row}:${col}`;
      if (blocked.has(key)) continue;
      points.push({ row, col });
    }
  }
  return shuffle(points);
};

const findPath = (maze: Cell[][], start: Point, goal: Point): Point[] => {
  const queue: Point[] = [start];
  const seen = new Set<string>([keyOf(start)]);
  const parents = new Map<string, string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = keyOf(current);

    if (current.row === goal.row && current.col === goal.col) {
      const reversedPath: Point[] = [];
      let walk: string | undefined = currentKey;
      while (walk) {
        reversedPath.push(pointFromKey(walk));
        walk = parents.get(walk);
      }
      return reversedPath.reverse();
    }

    for (const direction of CARDINALS) {
      const next = {
        row: current.row + direction.row,
        col: current.col + direction.col
      };
      if (next.row < 0 || next.row >= maze.length || next.col < 0 || next.col >= maze[0].length) continue;
      if (maze[next.row][next.col] === "wall") continue;

      const nextKey = keyOf(next);
      if (seen.has(nextKey)) continue;

      seen.add(nextKey);
      parents.set(nextKey, currentKey);
      queue.push(next);
    }
  }

  return [start, goal];
};

const createGame = (level: number): GameState => {
  const config = levelConfigFor(level);
  const maze = createBaseMaze(config.rows, config.cols);
  const player = { row: 1, col: 1 };
  const exit = { row: config.rows - 2, col: config.cols - 2 };
  const safePath = findPath(maze, player, exit);

  const keyPathIndex = Math.max(1, Math.min(safePath.length - 2, Math.floor(safePath.length * 0.6)));
  const key = safePath[keyPathIndex];

  const safePathKeys = new Set<string>(safePath.map(keyOf));
  const blocked = new Set<string>([...safePathKeys, keyOf(key)]);
  const pool = randomFloorPoints(maze, blocked);

  const trees = new Set<string>(pool.slice(0, config.trees).map(keyOf));
  const rocks = new Set<string>(pool.slice(config.trees, config.trees + config.rocks).map(keyOf));
  const monsters = new Set<string>(
    pool
      .slice(config.trees + config.rocks, config.trees + config.rocks + config.monsters)
      .map(keyOf)
  );
  const coins = new Set<string>(
    pool
      .slice(
        config.trees + config.rocks + config.monsters,
        config.trees + config.rocks + config.monsters + config.coins
      )
      .map(keyOf)
  );

  return {
    level,
    maze,
    player,
    exit,
    key,
    hasKey: false,
    coins,
    points: LEVEL_START_POINTS,
    trees,
    rocks,
    monsters,
    status: "playing",
    steps: 0
  };
};

const isOutsideMaze = (state: GameState, point: Point) =>
  point.row < 0 || point.row >= state.maze.length || point.col < 0 || point.col >= state.maze[0].length;

const isWall = (state: GameState, point: Point) => state.maze[point.row][point.col] === "wall";

const isOpaqueToMonsters = (state: GameState, point: Point) => {
  if (isOutsideMaze(state, point)) return true;
  if (isWall(state, point)) return true;
  const key = keyOf(point);
  return state.trees.has(key) || state.rocks.has(key);
};

const isBlockedForMonster = (state: GameState, point: Point) => {
  if (isOutsideMaze(state, point)) return true;
  if (isWall(state, point)) return true;
  const key = keyOf(point);
  return state.trees.has(key) || state.rocks.has(key);
};

const isBlockedForPlayer = (state: GameState, point: Point) => {
  if (point.row < 0 || point.row >= state.maze.length || point.col < 0 || point.col >= state.maze[0].length) {
    return true;
  }
  return state.maze[point.row][point.col] === "wall";
};

const hasLineOfSight = (state: GameState, from: Point, to: Point) => {
  if (from.row !== to.row && from.col !== to.col) return false;

  if (from.row === to.row) {
    const step = from.col < to.col ? 1 : -1;
    for (let col = from.col + step; col !== to.col; col += step) {
      if (isOpaqueToMonsters(state, { row: from.row, col })) return false;
    }
    return true;
  }

  const step = from.row < to.row ? 1 : -1;
  for (let row = from.row + step; row !== to.row; row += step) {
    if (isOpaqueToMonsters(state, { row, col: from.col })) return false;
  }
  return true;
};

const chooseMonsterMove = (state: GameState, monster: Point, occupied: Set<string>) => {
  const towardPlayer =
    monster.row === state.player.row
      ? { row: monster.row, col: monster.col + (state.player.col > monster.col ? 1 : -1) }
      : monster.col === state.player.col
        ? { row: monster.row + (state.player.row > monster.row ? 1 : -1), col: monster.col }
        : null;

  const canMoveTo = (point: Point) => {
    if (isBlockedForMonster(state, point)) return false;
    const key = keyOf(point);
    if (point.row === state.player.row && point.col === state.player.col) return true;
    return !occupied.has(key);
  };

  if (towardPlayer && hasLineOfSight(state, monster, state.player) && canMoveTo(towardPlayer)) {
    return towardPlayer;
  }

  const options = shuffle(
    CARDINALS.map((direction) => ({ row: monster.row + direction.row, col: monster.col + direction.col }))
  ).filter(canMoveTo);

  return options[0] ?? monster;
};

const advanceMonsters = (state: GameState): GameState => {
  if (state.status !== "playing") return state;

  const currentMonsters = shuffle(Array.from(state.monsters).map(pointFromKey));
  const occupied = new Set<string>(Array.from(state.monsters));
  const nextMonsters = new Set<string>();
  let caughtPlayer = false;

  for (const monster of currentMonsters) {
    const currentKey = keyOf(monster);
    occupied.delete(currentKey);

    const next = chooseMonsterMove(state, monster, occupied);
    const nextKey = keyOf(next);

    if (next.row === state.player.row && next.col === state.player.col) {
      caughtPlayer = true;
      nextMonsters.add(nextKey);
      continue;
    }

    if (occupied.has(nextKey)) {
      nextMonsters.add(currentKey);
      occupied.add(currentKey);
      continue;
    }

    nextMonsters.add(nextKey);
    occupied.add(nextKey);
  }

  if (caughtPlayer) {
    return { ...state, monsters: nextMonsters, status: "lost" };
  }

  return { ...state, monsters: nextMonsters };
};

const EmojiMazeApp = () => {
  const [game, setGame] = useState<GameState>(() => createGame(1));

  const movePlayer = (direction: Direction) => {
    setGame((current) => {
      if (current.status !== "playing") return current;

      const delta =
        direction === "up"
          ? { row: -1, col: 0 }
          : direction === "down"
            ? { row: 1, col: 0 }
            : direction === "left"
              ? { row: 0, col: -1 }
              : { row: 0, col: 1 };

      const next = {
        row: current.player.row + delta.row,
        col: current.player.col + delta.col
      };

      if (isBlockedForPlayer(current, next)) return current;

      const nextKey = keyOf(next);
      const nextHasRock = current.rocks.has(nextKey);
      let rocks = current.rocks;

      if (nextHasRock) {
        const rockTarget = {
          row: next.row + delta.row,
          col: next.col + delta.col
        };
        const rockTargetKey = keyOf(rockTarget);

        const blockedPush =
          isBlockedForPlayer(current, rockTarget) ||
          current.rocks.has(rockTargetKey) ||
          current.trees.has(rockTargetKey) ||
          current.coins.has(rockTargetKey) ||
          current.monsters.has(rockTargetKey) ||
          (rockTarget.row === current.exit.row && rockTarget.col === current.exit.col) ||
          (rockTarget.row === current.key.row && rockTarget.col === current.key.col) ||
          (rockTarget.row === current.player.row && rockTarget.col === current.player.col);

        if (blockedPush) return current;

        rocks = new Set(current.rocks);
        rocks.delete(nextKey);
        rocks.add(rockTargetKey);
      }

      const coins = new Set(current.coins);
      let points = current.points - STEP_COST;
      if (coins.has(nextKey)) {
        coins.delete(nextKey);
        points += COIN_POINTS;
      }

      const hasKey = current.hasKey || (next.row === current.key.row && next.col === current.key.col);

      const status = points <= 0
        ? "lost"
        : current.monsters.has(nextKey)
          ? "lost"
          : next.row === current.exit.row && next.col === current.exit.col && hasKey
            ? "won"
            : "playing";

      const nextState: GameState = {
        ...current,
        player: next,
        rocks,
        coins,
        points,
        hasKey,
        status,
        steps: current.steps + 1
      };

      if (nextState.status !== "playing") return nextState;
      return advanceMonsters(nextState);
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") movePlayer("up");
      if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") movePlayer("down");
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") movePlayer("left");
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") movePlayer("right");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (game.status !== "won") return;

    const timeout = setTimeout(() => {
      setGame(createGame(game.level + 1));
    }, LEVEL_ADVANCE_MS);

    return () => clearTimeout(timeout);
  }, [game.level, game.status]);

  const board = useMemo(() => {
    const mazeRows = game.maze.length;
    const mazeCols = game.maze[0].length;
    const viewRows = Math.min(VIEW_ROWS, mazeRows);
    const viewCols = Math.min(VIEW_COLS, mazeCols);

    const startRow = clamp(game.player.row - Math.floor(viewRows / 2), 0, mazeRows - viewRows);
    const startCol = clamp(game.player.col - Math.floor(viewCols / 2), 0, mazeCols - viewCols);

    const rows: string[] = [];
    for (let row = startRow; row < startRow + viewRows; row += 1) {
      const cells: string[] = [];
      for (let col = startCol; col < startCol + viewCols; col += 1) {
        const point = { row, col };
        const key = keyOf(point);

        if (row === game.player.row && col === game.player.col) {
          cells.push("😀");
          continue;
        }
        if (row === game.key.row && col === game.key.col && !game.hasKey) {
          cells.push("🗝️");
          continue;
        }
        if (game.coins.has(key)) {
          cells.push("🪙");
          continue;
        }
        if (row === game.exit.row && col === game.exit.col) {
          cells.push(game.hasKey ? "🚪" : "🔒");
          continue;
        }
        if (game.monsters.has(key)) {
          cells.push("👾");
          continue;
        }
        if (game.rocks.has(key)) {
          cells.push("🪨");
          continue;
        }
        if (game.trees.has(key)) {
          cells.push("🌲");
          continue;
        }

        cells.push(game.maze[row][col] === "wall" ? "🧱" : "▫️");
      }
      rows.push(cells.join(""));
    }

    return rows.join("\n");
  }, [game]);

  const statusText =
    game.status === "won"
      ? `Level ${game.level} cleared in ${game.steps} steps. Next level loading...`
      : game.status === "lost"
        ? "A monster caught you."
        : game.hasKey
          ? "You have the key. Reach the door."
          : "Find the key, then reach the door.";

  return (
    <SlapApplicationShell title="Emoji Maze">
      <SlapInlineText>Level {game.level} | Maze {game.maze.length}x{game.maze[0].length}</SlapInlineText>
      <SlapInlineText>Points: {game.points} | Coins left: {game.coins.size}</SlapInlineText>
      <details>
        <summary>Instructions</summary>
        <SlapInlineText>Use arrow keys, WASD, or the D-pad. Turn-based: monsters move after you move.</SlapInlineText>
        <SlapInlineText>You can walk through trees and push rocks. Monsters cannot pass either.</SlapInlineText>
        <SlapInlineText>Monsters chase when they have direct line of sight.</SlapInlineText>
        <SlapInlineText>Each level starts at 100 points. Every move costs 1 point, each coin gives +5.</SlapInlineText>
        <SlapInlineText>A = retry level, B = restart run.</SlapInlineText>
      </details>
      <SlapInlineText>Key: {game.hasKey ? "Collected" : "Missing"}</SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div
        style={{
          position: "relative",
          width: "fit-content",
          maxWidth: "100%",
          borderRadius: "12px",
          border: "1px solid rgba(0, 0, 0, 0.18)",
          background: "#f7f6ef",
          overflow: "hidden"
        }}
      >
        <pre
          style={{
            margin: 0,
            padding: "10px",
            background: "transparent",
            lineHeight: 1.12,
            fontSize: "1.1rem",
            fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
            userSelect: "none",
            overflowX: "auto"
          }}
        >
          {board}
        </pre>
      </div>

      <SlapGamepad
        onUp={() => movePlayer("up")}
        onDown={() => movePlayer("down")}
        onLeft={() => movePlayer("left")}
        onRight={() => movePlayer("right")}
        onA={() => setGame(createGame(game.level))}
        onB={() => setGame(createGame(1))}
        dpadDisabled={game.status !== "playing"}
        aTitle="Retry level"
        bTitle="Restart run"
      />

      <div className="slap-button-row">
        <SlapActionButton title="Restart Run" onClick={() => setGame(createGame(1))} />
        <SlapActionButton title="Retry Level" onClick={() => setGame(createGame(game.level))} />
      </div>
    </SlapApplicationShell>
  );
};

export const mazeGameManifest: SlapApplicationManifest = {
  id: "maze-game",
  title: "Emoji Maze",
  author: "Joel",
  description: "Dynamically generated emoji maze game with moving monsters and progressive levels.",
  icon: "🧩",
  Preview,
  Application: EmojiMazeApp
};
