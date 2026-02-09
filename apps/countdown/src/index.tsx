import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText, SlapTextInput } from "@slap/ui";

type CountdownItem = {
  id: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  createdAtIso: string;
};

type SavedState = {
  items: CountdownItem[];
  notificationsEnabled: boolean;
  notifiedItemIds: string[];
};

const STORAGE_PATH = "countdown-state.json";
const DAY_MS = 24 * 60 * 60 * 1000;

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Countdown</strong>
    <p>Track days until important dates.</p>
  </article>
);

const startOfLocalDay = (input: Date) =>
  new Date(input.getFullYear(), input.getMonth(), input.getDate());

const parseLocalDate = (value: string) => {
  const parts = value.split("-").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
};

const daysUntil = (targetDate: string) => {
  const target = parseLocalDate(targetDate);
  if (!target) return null;
  const today = startOfLocalDay(new Date());
  const targetDay = startOfLocalDay(target);
  return Math.ceil((targetDay.getTime() - today.getTime()) / DAY_MS);
};

const normalizeItem = (value: unknown): CountdownItem | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.targetDate !== "string" ||
    typeof candidate.createdAtIso !== "string"
  ) {
    return null;
  }
  return {
    id: candidate.id,
    title: candidate.title,
    targetDate: candidate.targetDate,
    createdAtIso: candidate.createdAtIso
  };
};

const createDefaultState = (): SavedState => ({
  items: [],
  notificationsEnabled: false,
  notifiedItemIds: []
});

const CountdownApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<SavedState>(createDefaultState);
  const [statusText, setStatusText] = useState("Add something to count down to.");
  const [titleInput, setTitleInput] = useState("");
  const [dateInput, setDateInput] = useState("");

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const items = Array.isArray(parsed.items)
          ? parsed.items.map(normalizeItem).filter((item): item is CountdownItem => item !== null)
          : [];
        const notifiedItemIds = Array.isArray(parsed.notifiedItemIds)
          ? parsed.notifiedItemIds.filter((id): id is string => typeof id === "string")
          : [];

        setState({
          items,
          notificationsEnabled: parsed.notificationsEnabled === true,
          notifiedItemIds
        });
      } catch {
        setStatusText("Saved countdown data was invalid. Loaded defaults.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(state, null, 2));
  }, [ctx.vfs, state]);

  useEffect(() => {
    if (!state.notificationsEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const dueToday = state.items.filter((item) => daysUntil(item.targetDate) === 0);
    const pending = dueToday.filter((item) => !state.notifiedItemIds.includes(item.id));
    if (pending.length === 0) return;

    for (const item of pending) {
      new Notification(`Today: ${item.title}`, {
        body: `Your countdown has reached ${item.targetDate}.`
      });
    }

    setState((current) => ({
      ...current,
      notifiedItemIds: [...current.notifiedItemIds, ...pending.map((item) => item.id)]
    }));
  }, [state.items, state.notificationsEnabled, state.notifiedItemIds]);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") {
      setStatusText("Notifications are not supported in this browser.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setState((current) => ({ ...current, notificationsEnabled: true }));
      setStatusText("Notifications enabled.");
    } else {
      setStatusText("Notification permission not granted.");
    }
  };

  const toggleNotifications = () => {
    setState((current) => ({
      ...current,
      notificationsEnabled: !current.notificationsEnabled
    }));
    setStatusText(
      state.notificationsEnabled
        ? "Notifications disabled."
        : "Notifications enabled if permission is granted."
    );
  };

  const addCountdown = () => {
    const title = titleInput.trim();
    if (!title) {
      setStatusText("Please enter a title.");
      return;
    }
    if (!dateInput || daysUntil(dateInput) === null) {
      setStatusText("Please choose a valid target date.");
      return;
    }

    const item: CountdownItem = {
      id: `countdown-${Date.now()}`,
      title,
      targetDate: dateInput,
      createdAtIso: new Date().toISOString()
    };

    setState((current) => ({
      ...current,
      items: [item, ...current.items]
    }));
    setTitleInput("");
    setStatusText(`Added countdown for ${title}.`);
  };

  const removeCountdown = (itemId: string) => {
    setState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
      notifiedItemIds: current.notifiedItemIds.filter((id) => id !== itemId)
    }));
    setStatusText("Countdown removed.");
  };

  const sortedItems = useMemo(
    () =>
      [...state.items].sort(
        (a, b) =>
          new Date(b.createdAtIso).getTime() - new Date(a.createdAtIso).getTime()
      ),
    [state.items]
  );

  return (
    <section className="slap-shell">
      <SlapInlineText>Track how many days until upcoming events.</SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="countdown-form">
        <SlapTextInput label="Event" value={titleInput} onChange={setTitleInput} />
        <label className="slap-input-wrap">
          <span>Target Date</span>
          <input
            className="slap-input"
            type="date"
            value={dateInput}
            onChange={(event) => setDateInput(event.target.value)}
          />
        </label>
      </div>

      <div className="slap-button-row">
        <SlapActionButton title="Add Countdown" onClick={addCountdown} />
        {typeof Notification !== "undefined" && Notification.permission !== "granted" ? (
          <SlapActionButton title="Enable Notifications" onClick={() => void requestNotifications()} />
        ) : (
          <SlapActionButton
            title={state.notificationsEnabled ? "Disable Notifications" : "Enable Notifications"}
            onClick={toggleNotifications}
          />
        )}
      </div>

      <section className="countdown-list">
        {sortedItems.length === 0 ? <SlapInlineText>No countdowns yet.</SlapInlineText> : null}
        {sortedItems.map((item) => {
          const remaining = daysUntil(item.targetDate);
          const isDue = remaining === 0;
          const isPast = typeof remaining === "number" && remaining < 0;
          return (
            <article key={item.id} className={`countdown-card${isDue ? " countdown-due" : ""}`}>
              <div className="countdown-card-head">
                <strong>{item.title}</strong>
                <SlapActionButton title="Remove" onClick={() => removeCountdown(item.id)} />
              </div>
              <p className="countdown-main-value">
                {remaining === null
                  ? "--"
                  : isDue
                  ? "Today"
                  : isPast
                  ? `${Math.abs(remaining)} days ago`
                  : `${remaining} days`}
              </p>
              <SlapInlineText>Target: {item.targetDate}</SlapInlineText>
            </article>
          );
        })}
      </section>
    </section>
  );
};

export const countdownManifest: SlapApplicationManifest = {
  id: "countdown",
  title: "Countdown",
  author: "Joel",
  description: "Track days until upcoming events with optional notifications.",
  icon: "⏳",
  Preview,
  Application: CountdownApp
};
