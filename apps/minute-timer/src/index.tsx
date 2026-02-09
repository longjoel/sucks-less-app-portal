import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText } from "@slap/ui";

type SavedState = {
  minutes: number;
  notificationsEnabled: boolean;
  isRunning: boolean;
  endAtEpochMs: number | null;
  remainingSeconds: number;
};

const STORAGE_PATH = "minute-timer-state.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Minute Timer</strong>
    <p>Simple countdown timer with optional notifications.</p>
  </article>
);

const clampMinutes = (value: number) => Math.max(1, Math.min(240, Math.floor(value)));

const formatSeconds = (remainingSeconds: number) => {
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
};

const MinuteTimerApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [minutes, setMinutes] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [endAtEpochMs, setEndAtEpochMs] = useState<number | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [statusText, setStatusText] = useState("Set minutes and press Start.");
  const [nowEpochMs, setNowEpochMs] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<SavedState>;
        if (typeof parsed.minutes === "number") {
          const next = clampMinutes(parsed.minutes);
          setMinutes(next);
        }

        if (typeof parsed.remainingSeconds === "number" && parsed.remainingSeconds >= 0) {
          setRemainingSeconds(Math.floor(parsed.remainingSeconds));
        } else if (typeof parsed.minutes === "number") {
          const next = clampMinutes(parsed.minutes);
          setRemainingSeconds(next * 60);
        }

        if (parsed.notificationsEnabled === true) {
          setNotificationsEnabled(true);
        }

        if (parsed.isRunning === true && typeof parsed.endAtEpochMs === "number") {
          setIsRunning(true);
          setEndAtEpochMs(parsed.endAtEpochMs);
          setStatusText("Resumed timer.");
        }
      } catch {
        setStatusText("Saved timer state was invalid.");
      }
    })();
  }, [ctx.vfs]);

  const computedRemainingSeconds = useMemo(() => {
    if (!isRunning || endAtEpochMs === null) return remainingSeconds;
    return Math.max(0, Math.ceil((endAtEpochMs - nowEpochMs) / 1000));
  }, [isRunning, endAtEpochMs, nowEpochMs, remainingSeconds]);

  useEffect(() => {
    void ctx.vfs.writeText(
      STORAGE_PATH,
      JSON.stringify(
        {
          minutes,
          notificationsEnabled,
          isRunning,
          endAtEpochMs,
          remainingSeconds: computedRemainingSeconds
        },
        null,
        2
      )
    );
  }, [ctx.vfs, minutes, notificationsEnabled, isRunning, endAtEpochMs, computedRemainingSeconds]);

  useEffect(() => {
    if (!isRunning) return;
    const timer = window.setInterval(() => setNowEpochMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [isRunning]);

  useEffect(() => {
    if (!isRunning || endAtEpochMs === null) return;
    if (computedRemainingSeconds > 0) return;

    setIsRunning(false);
    setEndAtEpochMs(null);
    setRemainingSeconds(0);
    setStatusText("Timer complete.");

    if (notificationsEnabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Minute Timer complete", { body: `${minutes} minute timer finished.` });
    }
  }, [isRunning, endAtEpochMs, computedRemainingSeconds, notificationsEnabled, minutes]);

  const start = () => {
    if (isRunning) return;
    const baseSeconds = computedRemainingSeconds > 0 ? computedRemainingSeconds : minutes * 60;
    const nextEnd = Date.now() + baseSeconds * 1000;
    setRemainingSeconds(baseSeconds);
    setEndAtEpochMs(nextEnd);
    setIsRunning(true);
    setStatusText("Running.");
  };

  const pause = () => {
    if (!isRunning) return;
    setIsRunning(false);
    setEndAtEpochMs(null);
    setRemainingSeconds(computedRemainingSeconds);
    setStatusText("Paused.");
  };

  const reset = () => {
    setIsRunning(false);
    setEndAtEpochMs(null);
    setRemainingSeconds(minutes * 60);
    setStatusText("Reset.");
  };

  const adjustMinutes = (delta: number) => {
    if (isRunning) return;
    const next = clampMinutes(minutes + delta);
    setMinutes(next);
    setRemainingSeconds(next * 60);
  };

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") {
      setStatusText("Notifications not supported.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      setStatusText("Notifications enabled.");
    } else {
      setStatusText("Notification permission not granted.");
    }
  };

  const timerLabel = useMemo(() => formatSeconds(computedRemainingSeconds), [computedRemainingSeconds]);

  return (
    <section className="slap-shell">
      <SlapInlineText>Simple minute countdown timer.</SlapInlineText>
      <p className="timer-display">{timerLabel}</p>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="timer-minute-controls">
        <SlapActionButton title="-1 min" onClick={() => adjustMinutes(-1)} disabled={isRunning || minutes <= 1} />
        <SlapInlineText>
          Duration: <strong>{minutes}</strong> min
        </SlapInlineText>
        <SlapActionButton title="+1 min" onClick={() => adjustMinutes(1)} disabled={isRunning || minutes >= 240} />
      </div>

      <div className="slap-button-row">
        <SlapActionButton title={isRunning ? "Running" : "Start"} onClick={start} disabled={isRunning} />
        <SlapActionButton title="Pause" onClick={pause} disabled={!isRunning} />
        <SlapActionButton title="Reset" onClick={reset} />
        {typeof Notification !== "undefined" && Notification.permission !== "granted" ? (
          <SlapActionButton title="Enable Notifications" onClick={() => void requestNotifications()} />
        ) : (
          <SlapActionButton
            title={notificationsEnabled ? "Notifications On" : "Notifications Off"}
            onClick={() => setNotificationsEnabled((current) => !current)}
          />
        )}
      </div>
    </section>
  );
};

export const minuteTimerManifest: SlapApplicationManifest = {
  id: "minute-timer",
  title: "Minute Timer",
  author: "Joel",
  description: "Simple minute timer with optional notifications.",
  icon: "⏲️",
  Preview,
  Application: MinuteTimerApp
};
