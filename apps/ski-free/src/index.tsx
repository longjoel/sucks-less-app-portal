import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Obstacle = {
  id: number;
  lane: number;
  row: number;
};

type GameStatus = "idle" | "playing" | "lost";

type GameState = {
  status: GameStatus;
  skierLane: number;
  obstacles: Obstacle[];
  elapsedMs: number;
  scoreSeconds: number;
  bestScoreSeconds: number;
  ticks: number;
  nextObstacleId: number;
};

const STORAGE_PATH = "ski-free-state.json";
const LANE_COUNT = 7;
const ROW_COUNT = 12;
const PLAYER_ROW = ROW_COUNT - 2;
const TICK_MS = 180;
const CANVAS_WIDTH = 280;
const CANVAS_HEIGHT = 300;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Ski Free</strong>
    <p>Dodge obstacles with left and right. Survive longer for a higher score.</p>
  </article>
);

const createInitialState = (bestScoreSeconds = 0): GameState => ({
  status: "idle",
  skierLane: Math.floor(LANE_COUNT / 2),
  obstacles: [],
  elapsedMs: 0,
  scoreSeconds: 0,
  bestScoreSeconds,
  ticks: 0,
  nextObstacleId: 1
});

const clampLane = (lane: number) => Math.max(0, Math.min(LANE_COUNT - 1, lane));

const SkiFreeApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<GameState>(createInitialState);
  const [statusText, setStatusText] = useState("Press Start to ski.");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as { bestScoreSeconds?: unknown };
        const bestScoreSeconds =
          typeof parsed.bestScoreSeconds === "number" && parsed.bestScoreSeconds >= 0
            ? Math.floor(parsed.bestScoreSeconds)
            : 0;
        setState(createInitialState(bestScoreSeconds));
      } catch {
        setStatusText("Saved score data was invalid. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(
      STORAGE_PATH,
      JSON.stringify({ bestScoreSeconds: state.bestScoreSeconds }, null, 2)
    );
  }, [ctx.vfs, state.bestScoreSeconds]);

  useEffect(() => {
    if (state.status !== "playing") return;

    const interval = setInterval(() => {
      setState((current) => {
        if (current.status !== "playing") return current;

        const elapsedMs = current.elapsedMs + TICK_MS;
        const ticks = current.ticks + 1;
        const scoreSeconds = Math.floor(elapsedMs / 1000);
        const speedLevel = Math.min(6, Math.floor(elapsedMs / 5000));

        const movedObstacles = current.obstacles
          .map((obstacle) => ({ ...obstacle, row: obstacle.row + 1 }))
          .filter((obstacle) => obstacle.row < ROW_COUNT);

        const spawnEveryTicks = Math.max(2, 5 - speedLevel);
        const spawnChance = Math.min(0.85, 0.35 + speedLevel * 0.08);
        const shouldSpawn = ticks % spawnEveryTicks === 0 && Math.random() < spawnChance;

        const obstacles = shouldSpawn
          ? [...movedObstacles, { id: current.nextObstacleId, lane: Math.floor(Math.random() * LANE_COUNT), row: 0 }]
          : movedObstacles;

        const collision = obstacles.some(
          (obstacle) => obstacle.row === PLAYER_ROW && obstacle.lane === current.skierLane
        );

        if (collision) {
          const bestScoreSeconds = Math.max(current.bestScoreSeconds, scoreSeconds);
          setStatusText("You crashed. Press Restart to try again.");
          return {
            ...current,
            status: "lost",
            obstacles,
            elapsedMs,
            scoreSeconds,
            bestScoreSeconds,
            ticks,
            nextObstacleId: shouldSpawn ? current.nextObstacleId + 1 : current.nextObstacleId
          };
        }

        return {
          ...current,
          obstacles,
          elapsedMs,
          scoreSeconds,
          ticks,
          nextObstacleId: shouldSpawn ? current.nextObstacleId + 1 : current.nextObstacleId
        };
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [state.status]);

  const startOrRestart = () => {
    setState((current) => ({
      ...createInitialState(current.bestScoreSeconds),
      status: "playing"
    }));
    setStatusText("Stay alive as long as you can.");
  };

  const moveLeft = () => {
    setState((current) =>
      current.status === "playing"
        ? { ...current, skierLane: clampLane(current.skierLane - 1) }
        : current
    );
  };

  const moveRight = () => {
    setState((current) =>
      current.status === "playing"
        ? { ...current, skierLane: clampLane(current.skierLane + 1) }
        : current
    );
  };

  const onCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    if (state.status !== "playing") return;

    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const isLeftHalf = x < rect.width / 2;

    if (isLeftHalf) {
      moveLeft();
    } else {
      moveRight();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const laneWidth = CANVAS_WIDTH / LANE_COUNT;
    const rowHeight = CANVAS_HEIGHT / ROW_COUNT;
    const fontSize = Math.floor(Math.min(laneWidth, rowHeight) * 0.72);

    context.fillStyle = "#edf5ff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    context.strokeStyle = "rgba(45, 64, 48, 0.12)";
    context.lineWidth = 1;
    for (let lane = 1; lane < LANE_COUNT; lane += 1) {
      context.beginPath();
      context.moveTo(lane * laneWidth, 0);
      context.lineTo(lane * laneWidth, CANVAS_HEIGHT);
      context.stroke();
    }

    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = `${fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;

    for (const obstacle of state.obstacles) {
      const x = obstacle.lane * laneWidth + laneWidth / 2;
      const y = obstacle.row * rowHeight + rowHeight / 2;
      context.fillText("🌲", x, y);
    }

    const skierX = state.skierLane * laneWidth + laneWidth / 2;
    const skierY = PLAYER_ROW * rowHeight + rowHeight / 2;
    context.fillText("⛷️", skierX, skierY);
  }, [state.obstacles, state.skierLane]);

  return (
    <SlapApplicationShell title="Ski Free">
      <div className="skifree-layout">
        <SlapApplicationTitle title="Ski Free" />
        <SlapInlineText>Use Left and Right to dodge trees.</SlapInlineText>

        <div className="skifree-stage">
          <canvas
            ref={canvasRef}
            className="skifree-canvas"
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            onPointerDown={onCanvasPointerDown}
            aria-label="Ski slope"
          />
          <div className="skifree-hud">
            <strong>
              {state.scoreSeconds}s | Best {state.bestScoreSeconds}s
            </strong>
            <span>{statusText}</span>
          </div>
        </div>
      </div>

      <div className="skifree-controls">
        <SlapActionButton title={state.status === "playing" ? "Restart" : "Start"} onClick={startOrRestart} />
      </div>
    </SlapApplicationShell>
  );
};

export const skiFreeManifest: SlapApplicationManifest = {
  id: "ski-free",
  title: "Ski Free",
  author: "Joel",
  description: "Dodge obstacles and survive as long as possible.",
  icon: "🎿",
  Preview,
  Application: SkiFreeApp
};
