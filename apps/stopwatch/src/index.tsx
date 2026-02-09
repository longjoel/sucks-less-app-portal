import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText } from "@slap/ui";

type SavedState = {
  accumulatedMs: number;
  startedAtEpochMs: number | null;
  isRunning: boolean;
  laps: number[];
};

const STORAGE_PATH = "stopwatch-state.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Stopwatch</strong>
    <p>Simple stopwatch with lap recording.</p>
  </article>
);

const formatElapsed = (elapsedMs: number) => {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((elapsedMs % 1000) / 10);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
};

const StopwatchApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [accumulatedMs, setAccumulatedMs] = useState(0);
  const [startedAtEpochMs, setStartedAtEpochMs] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const [statusText, setStatusText] = useState("Ready.");
  const [nowEpochMs, setNowEpochMs] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<SavedState>;
        if (typeof parsed.accumulatedMs === "number" && parsed.accumulatedMs >= 0) {
          setAccumulatedMs(parsed.accumulatedMs);
        }
        if (Array.isArray(parsed.laps)) {
          const valid = parsed.laps.filter((lap): lap is number => typeof lap === "number" && lap >= 0);
          setLaps(valid.slice(0, 20));
        }
        if (parsed.isRunning === true && typeof parsed.startedAtEpochMs === "number") {
          setIsRunning(true);
          setStartedAtEpochMs(parsed.startedAtEpochMs);
          setStatusText("Resumed running timer.");
        }
      } catch {
        setStatusText("Saved data was invalid.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(
      STORAGE_PATH,
      JSON.stringify({ accumulatedMs, startedAtEpochMs, isRunning, laps }, null, 2)
    );
  }, [ctx.vfs, accumulatedMs, startedAtEpochMs, isRunning, laps]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNowEpochMs(Date.now()), 60);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  const elapsedMs = useMemo(() => {
    if (!isRunning || startedAtEpochMs === null) return accumulatedMs;
    return accumulatedMs + Math.max(0, nowEpochMs - startedAtEpochMs);
  }, [isRunning, accumulatedMs, startedAtEpochMs, nowEpochMs]);

  const start = () => {
    if (isRunning) return;
    setStartedAtEpochMs(Date.now());
    setIsRunning(true);
    setStatusText("Running.");
  };

  const pause = () => {
    if (!isRunning || startedAtEpochMs === null) return;
    const nextAccumulated = accumulatedMs + Math.max(0, Date.now() - startedAtEpochMs);
    setAccumulatedMs(nextAccumulated);
    setStartedAtEpochMs(null);
    setIsRunning(false);
    setStatusText("Paused.");
  };

  const reset = () => {
    setIsRunning(false);
    setStartedAtEpochMs(null);
    setAccumulatedMs(0);
    setLaps([]);
    setStatusText("Reset.");
  };

  const addLap = () => {
    if (elapsedMs <= 0) return;
    setLaps((current) => [elapsedMs, ...current].slice(0, 20));
    setStatusText("Lap captured.");
  };

  const elapsedLabel = useMemo(() => formatElapsed(elapsedMs), [elapsedMs]);

  return (
    <section className="slap-shell">
      <SlapInlineText>Simple stopwatch with laps.</SlapInlineText>
      <p className="stopwatch-display">{elapsedLabel}</p>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title={isRunning ? "Running" : "Start"} onClick={start} disabled={isRunning} />
        <SlapActionButton title="Pause" onClick={pause} disabled={!isRunning} />
        <SlapActionButton title="Lap" onClick={addLap} disabled={elapsedMs <= 0} />
        <SlapActionButton title="Reset" onClick={reset} />
      </div>

      <section className="stopwatch-laps">
        <h3 className="slap-title">Laps ({laps.length})</h3>
        {laps.length === 0 ? <SlapInlineText>No laps yet.</SlapInlineText> : null}
        {laps.map((lap, index) => (
          <SlapInlineText key={`${lap}-${index}`}>
            Lap {laps.length - index}: {formatElapsed(lap)}
          </SlapInlineText>
        ))}
      </section>
    </section>
  );
};

export const stopwatchManifest: SlapApplicationManifest = {
  id: "stopwatch",
  title: "Stopwatch",
  author: "Joel",
  description: "Simple stopwatch with lap recording.",
  icon: "⏱️",
  Preview,
  Application: StopwatchApp
};
