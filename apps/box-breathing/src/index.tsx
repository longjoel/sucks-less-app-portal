import { useEffect, useMemo, useRef, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Phase = "Inhale" | "Hold" | "Exhale" | "Hold";

const PRESET_SECONDS = [3, 4, 5, 6] as const;
const PHASES: Phase[] = ["Inhale", "Hold", "Exhale", "Hold"];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Box Breathing</strong>
    <p>Guided breathing timer with canvas animation.</p>
  </article>
);

const phaseColor = (phase: Phase) => {
  if (phase === "Inhale") return "#2d4030";
  if (phase === "Exhale") return "#7a5f31";
  return "#6a635a";
};

const drawFrame = (
  canvas: HTMLCanvasElement,
  sizeProgress: number,
  phase: Phase,
  phaseProgress: number,
  cycleCount: number,
  totalSeconds: number
) => {
  const context = canvas.getContext("2d");
  if (!context) {
    return;
  }

  const width = canvas.width;
  const height = canvas.height;
  const centerX = width / 2;
  const centerY = height / 2;

  context.clearRect(0, 0, width, height);

  context.fillStyle = "#f7f2e7";
  context.fillRect(0, 0, width, height);

  const minSize = 52;
  const maxSize = Math.min(width, height) * 0.62;
  const side = minSize + (maxSize - minSize) * sizeProgress;

  context.fillStyle = phaseColor(phase);
  context.strokeStyle = "#1c1c1c";
  context.lineWidth = 2;

  const left = centerX - side / 2;
  const top = centerY - side / 2;

  context.beginPath();
  context.rect(left, top, side, side);
  context.fill();
  context.stroke();

  context.fillStyle = "#f4f0e8";
  context.font = "bold 22px Trebuchet MS";
  context.textAlign = "center";
  context.fillText(phase, centerX, centerY + 8);

  context.fillStyle = "#1c1c1c";
  context.font = "14px Trebuchet MS";
  context.fillText(`Phase ${(phaseProgress * totalSeconds).toFixed(1)}s / ${totalSeconds}s`, centerX, height - 34);
  context.fillText(`Cycle ${cycleCount}`, centerX, height - 14);
};

const BoxBreathingApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [secondsPerPhase, setSecondsPerPhase] = useState<number>(4);
  const [isRunning, setIsRunning] = useState(false);
  const [cycleCount, setCycleCount] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [phaseProgress, setPhaseProgress] = useState(0);
  const [status, setStatus] = useState("Tap Start to begin a calm breathing cycle.");

  const phase = PHASES[phaseIndex] ?? "Inhale";

  const sizeProgress = useMemo(() => {
    if (phase === "Inhale") return phaseProgress;
    if (phase === "Exhale") return 1 - phaseProgress;
    if (phaseIndex === 1) return 1;
    return 0;
  }, [phase, phaseIndex, phaseProgress]);

  useEffect(() => {
    void ctx.vfs.writeText(
      "box-breathing-settings.json",
      JSON.stringify({ secondsPerPhase, updatedAtIso: new Date().toISOString() })
    );
  }, [ctx.vfs, secondsPerPhase]);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText("box-breathing-settings.json");
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as { secondsPerPhase?: unknown };
        if (typeof parsed.secondsPerPhase === "number" && PRESET_SECONDS.includes(parsed.secondsPerPhase as 3 | 4 | 5 | 6)) {
          setSecondsPerPhase(parsed.secondsPerPhase);
        }
      } catch {
        // ignore invalid saved settings
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const run = (timestampStart: number) => {
      const canvasElement = canvasRef.current;
      if (!canvasElement) {
        return;
      }

      const animate = (now: number) => {
        const elapsed = (now - timestampStart) / 1000;
        const phaseDuration = secondsPerPhase;
        const totalDuration = phaseDuration * 4;

        const cycleElapsed = elapsed % totalDuration;
        const nextPhaseIndex = Math.floor(cycleElapsed / phaseDuration);
        const elapsedInPhase = cycleElapsed - nextPhaseIndex * phaseDuration;
        const nextPhaseProgress = elapsedInPhase / phaseDuration;
        const nextCycles = Math.floor(elapsed / totalDuration);

        setPhaseIndex(nextPhaseIndex);
        setPhaseProgress(nextPhaseProgress);
        setCycleCount(nextCycles + 1);

        const currentPhase = PHASES[nextPhaseIndex] ?? "Inhale";
        const currentSizeProgress =
          currentPhase === "Inhale"
            ? nextPhaseProgress
            : currentPhase === "Exhale"
              ? 1 - nextPhaseProgress
              : nextPhaseIndex === 1
                ? 1
                : 0;

        drawFrame(
          canvasElement,
          currentSizeProgress,
          currentPhase,
          nextPhaseProgress,
          nextCycles + 1,
          phaseDuration
        );

        rafRef.current = requestAnimationFrame(animate);
      };

      rafRef.current = requestAnimationFrame(animate);
    };

    if (isRunning) {
      const now = performance.now();
      run(now - phaseIndex * secondsPerPhase * 1000 - phaseProgress * secondsPerPhase * 1000);
      setStatus("Breathe with the square: inhale, hold, exhale, hold.");
    } else {
      drawFrame(canvas, sizeProgress, phase, phaseProgress, Math.max(1, cycleCount), secondsPerPhase);
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isRunning, secondsPerPhase, phaseIndex, phaseProgress, cycleCount, sizeProgress, phase]);

  const start = () => setIsRunning(true);
  const pause = () => {
    setIsRunning(false);
    setStatus("Paused. Resume when ready.");
  };
  const reset = () => {
    setIsRunning(false);
    setPhaseIndex(0);
    setPhaseProgress(0);
    setCycleCount(0);
    setStatus("Reset. Tap Start when you are ready.");
  };

  return (
    <SlapApplicationShell title="Box Breathing">
      <SlapApplicationTitle title="Guided Box Breathing" />
      <SlapInlineText>Cycle: Inhale, Hold, Exhale, Hold</SlapInlineText>

      <label className="slap-input-wrap">
        <span>Seconds Per Phase</span>
        <select
          className="slap-input"
          value={secondsPerPhase}
          onChange={(event) => setSecondsPerPhase(Number(event.target.value))}
          disabled={isRunning}
        >
          {PRESET_SECONDS.map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds}s
            </option>
          ))}
        </select>
      </label>

      <canvas
        ref={canvasRef}
        width={300}
        height={300}
        style={{ width: "100%", maxWidth: "300px", borderRadius: "0.8rem", border: "1px solid #c5b9a5" }}
      />

      <div className="slap-button-row">
        <SlapActionButton title="Start" onClick={start} disabled={isRunning} />
        <SlapActionButton title="Pause" onClick={pause} disabled={!isRunning} />
        <SlapActionButton title="Reset" onClick={reset} />
      </div>

      <SlapInlineText>{status}</SlapInlineText>
      <SlapInlineText>Current phase: {phase}</SlapInlineText>
      <SlapInlineText>Cycle count: {cycleCount}</SlapInlineText>
    </SlapApplicationShell>
  );
};

export const boxBreathingManifest: SlapApplicationManifest = {
  id: "box-breathing",
  title: "Box Breathing",
  author: "Joel",
  description: "Canvas-guided inhale/hold/exhale/hold breathing.",
  icon: "🫁",
  Preview,
  Application: BoxBreathingApp
};
