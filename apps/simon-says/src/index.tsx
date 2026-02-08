import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText } from "@slap/ui";

type Region = 0 | 1 | 2 | 3;
type Status = "idle" | "playingBack" | "awaitingInput" | "lost";

type GameState = {
  sequence: Region[];
  inputIndex: number;
  score: number;
  bestScore: number;
  status: Status;
};

type ActiveLight = {
  region: Region;
  startedAt: number;
};

const STORAGE_PATH = "simon-says-state.json";
const CANVAS_SIZE = 280;
const STEP_MS = 1100;
const FLASH_MS = 1000;

const BASE_COLORS = ["#d46a6a", "#6b8fd4", "#d4b76b", "#6cc48b"] as const;
const LIT_COLORS = ["#f09f9f", "#9fb9f0", "#f0d79f", "#9fe0b8"] as const;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Simon Says</strong>
    <p>Repeat the growing light pattern.</p>
  </article>
);

const randomRegion = (): Region => Math.floor(Math.random() * 4) as Region;

const initialState = (bestScore = 0): GameState => ({
  sequence: [],
  inputIndex: 0,
  score: 0,
  bestScore,
  status: "idle"
});

const SimonSaysApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<GameState>(initialState);
  const [statusText, setStatusText] = useState("Press Start to begin.");
  const [activeLight, setActiveLight] = useState<ActiveLight | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const clearTimers = () => {
    for (const id of timeoutsRef.current) window.clearTimeout(id);
    timeoutsRef.current = [];
  };

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as { bestScore?: unknown };
        const bestScore =
          typeof parsed.bestScore === "number" && parsed.bestScore >= 0 ? Math.floor(parsed.bestScore) : 0;
        setState(initialState(bestScore));
      } catch {
        setStatusText("Saved score data was invalid. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify({ bestScore: state.bestScore }, null, 2));
  }, [ctx.vfs, state.bestScore]);

  const drawBoard = useCallback((light: ActiveLight | null, now: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    const half = CANVAS_SIZE / 2;
    const gap = 8;
    const size = half - gap * 1.5;
    const progress = light ? Math.min(1, (now - light.startedAt) / FLASH_MS) : 0;

    for (let region: Region = 0; region < 4; region = (region + 1) as Region) {
      const isTop = region < 2;
      const isLeft = region === 0 || region === 2;
      const x = isLeft ? gap : half + gap / 2;
      const y = isTop ? gap : half + gap / 2;
      const isActive = light?.region === region;
      context.fillStyle = isActive ? LIT_COLORS[region] : BASE_COLORS[region];
      context.fillRect(x, y, size, size);

      if (!isActive) continue;

      if (region === 0) {
        const pulse = 0.22 + 0.26 * Math.sin(progress * Math.PI * 3);
        context.fillStyle = `rgba(255, 255, 255, ${pulse.toFixed(3)})`;
        context.fillRect(x + 6, y + 6, size - 12, size - 12);
      }

      if (region === 1) {
        const bandWidth = size * 0.28;
        const sweepX = x + (size + bandWidth) * progress - bandWidth;
        context.fillStyle = "rgba(255, 255, 255, 0.35)";
        context.fillRect(sweepX, y, bandWidth, size);
      }

      if (region === 2) {
        const cx = x + size / 2;
        const cy = y + size / 2;
        context.strokeStyle = "rgba(255, 255, 255, 0.48)";
        context.lineWidth = 2;
        for (let ring = 0; ring < 3; ring += 1) {
          const ringProgress = (progress + ring * 0.2) % 1;
          context.beginPath();
          context.arc(cx, cy, 8 + ringProgress * (size * 0.42), 0, Math.PI * 2);
          context.stroke();
        }
      }

      if (region === 3) {
        context.fillStyle = "rgba(255, 255, 255, 0.85)";
        for (let i = 0; i < 7; i += 1) {
          const angle = progress * Math.PI * 2 + i * 0.9;
          const radius = size * (0.16 + (i % 3) * 0.08);
          const cx = x + size / 2 + Math.cos(angle) * radius;
          const cy = y + size / 2 + Math.sin(angle) * radius;
          context.fillRect(cx - 2, cy - 2, 4, 4);
        }
      }
    }
  }, []);

  useEffect(() => {
    let rafId: number | null = null;

    const render = (time: number) => {
      drawBoard(activeLight, time);
      if (activeLight) {
        rafId = window.requestAnimationFrame(render);
      }
    };

    render(window.performance.now());

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
    };
  }, [drawBoard, activeLight]);

  useEffect(
    () => () => {
      clearTimers();
    },
    []
  );

  const playbackSequence = (sequence: Region[]) => {
    clearTimers();
    setState((current) => ({ ...current, status: "playingBack", inputIndex: 0 }));
    setStatusText("Watch the pattern.");

    sequence.forEach((region, index) => {
      const showAt = index * STEP_MS;
      const hideAt = showAt + FLASH_MS;
      const showId = window.setTimeout(
        () => setActiveLight({ region, startedAt: window.performance.now() }),
        showAt
      );
      const hideId = window.setTimeout(() => setActiveLight(null), hideAt);
      timeoutsRef.current.push(showId, hideId);
    });

    const doneId = window.setTimeout(() => {
      setState((current) => ({ ...current, status: "awaitingInput", inputIndex: 0 }));
      setStatusText("Your turn.");
    }, sequence.length * STEP_MS + 40);
    timeoutsRef.current.push(doneId);
  };

  const startGame = () => {
    const nextSequence = [randomRegion()];
    setState((current) => ({
      ...current,
      sequence: nextSequence,
      inputIndex: 0,
      score: 0,
      status: "playingBack"
    }));
    playbackSequence(nextSequence);
  };

  const loseGame = (score: number) => {
    setState((current) => ({
      ...current,
      status: "lost",
      inputIndex: 0,
      bestScore: Math.max(current.bestScore, score)
    }));
    setStatusText("Wrong region. Press Restart.");
  };

  const advanceRound = (sequence: Region[], score: number) => {
    const nextSequence = [...sequence, randomRegion()];
    setState((current) => ({
      ...current,
      sequence: nextSequence,
      inputIndex: 0,
      score,
      status: "playingBack"
    }));
    playbackSequence(nextSequence);
  };

  const pressRegion = (region: Region) => {
    if (state.status !== "awaitingInput") return;
    setActiveLight({ region, startedAt: window.performance.now() });
    const offId = window.setTimeout(() => setActiveLight(null), FLASH_MS);
    timeoutsRef.current.push(offId);

    const expected = state.sequence[state.inputIndex];
    if (region !== expected) {
      loseGame(state.score);
      return;
    }

    const nextInput = state.inputIndex + 1;
    if (nextInput >= state.sequence.length) {
      const nextScore = state.sequence.length;
      setStatusText("Nice. Next round...");
      const nextId = window.setTimeout(() => advanceRound(state.sequence, nextScore), 420);
      timeoutsRef.current.push(nextId);
      return;
    }

    setState((current) => ({ ...current, inputIndex: nextInput }));
  };

  const onCanvasPointerDown = (event: PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const left = x < rect.width / 2;
    const top = y < rect.height / 2;

    const region: Region = top ? (left ? 0 : 1) : left ? 2 : 3;
    pressRegion(region);
  };

  return (
    <section className="slap-shell">
      <SlapInlineText>Repeat the lights in order.</SlapInlineText>
      <SlapInlineText>
        Score: {state.score} | Best: {state.bestScore}
      </SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <canvas
        ref={canvasRef}
        className="simon-canvas"
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        onPointerDown={onCanvasPointerDown}
        aria-label="Simon Says board"
      />

      <div className="simon-controls">
        <SlapActionButton title={state.status === "idle" ? "Start" : "Restart"} onClick={startGame} />
      </div>
    </section>
  );
};

export const simonSaysManifest: SlapApplicationManifest = {
  id: "simon-says",
  title: "Simon Says",
  author: "Joel",
  description: "Memorize and repeat a growing light sequence.",
  icon: "🟩",
  Preview,
  Application: SimonSaysApp
};
