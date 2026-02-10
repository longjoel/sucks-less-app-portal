import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type AxisKey = "calmAnxious" | "happySad" | "energizedTired";

type AxisValues = Record<AxisKey, number>;

type MoodEntry = {
  id: string;
  createdAtIso: string;
  axes: AxisValues;
  note: string;
};

type MoodDocument = {
  app: "slap-mood-tracker";
  version: 1;
  entries: MoodEntry[];
};

type AxisDef = {
  key: AxisKey;
  label: string;
  left: string;
  right: string;
};

const STORAGE_PATH = "mood-tracker.json";

const AXES: AxisDef[] = [
  { key: "calmAnxious", label: "Calm vs Anxious", left: "Calm", right: "Anxious" },
  { key: "happySad", label: "Happy vs Sad", left: "Happy", right: "Sad" },
  { key: "energizedTired", label: "Energized vs Tired", left: "Energized", right: "Tired" }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Mood Tracker</strong>
    <p>Track how you feel in a few quick dimensions, plus a note.</p>
  </article>
);

const clampAxis = (value: number) => Math.max(-5, Math.min(5, Math.round(value)));

const axisDisplay = (value: number, left: string, right: string) => {
  if (value === 0) return "Balanced";
  const strength = Math.abs(value);
  return `${value < 0 ? left : right} +${strength}`;
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const toDocument = (entries: MoodEntry[]): MoodDocument => ({
  app: "slap-mood-tracker",
  version: 1,
  entries
});

const normalizeAxes = (value: unknown): AxisValues => {
  const fallback: AxisValues = { calmAnxious: 0, happySad: 0, energizedTired: 0 };
  if (typeof value !== "object" || value === null) return fallback;
  const candidate = value as Record<string, unknown>;
  return {
    calmAnxious: typeof candidate.calmAnxious === "number" ? clampAxis(candidate.calmAnxious) : 0,
    happySad: typeof candidate.happySad === "number" ? clampAxis(candidate.happySad) : 0,
    energizedTired: typeof candidate.energizedTired === "number" ? clampAxis(candidate.energizedTired) : 0
  };
};

const normalizeEntry = (value: unknown): MoodEntry | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string") return null;
  const createdAtIso = typeof candidate.createdAtIso === "string" ? candidate.createdAtIso : new Date().toISOString();
  const note = typeof candidate.note === "string" ? candidate.note : "";

  return {
    id: candidate.id,
    createdAtIso,
    axes: normalizeAxes(candidate.axes),
    note
  };
};

const isDocument = (value: unknown): value is MoodDocument => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.app === "slap-mood-tracker" && candidate.version === 1 && Array.isArray(candidate.entries);
};

const MoodTrackerApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [entries, setEntries] = useState<MoodEntry[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [axes, setAxes] = useState<AxisValues>({ calmAnxious: 0, happySad: 0, energizedTired: 0 });
  const [note, setNote] = useState("");

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [entries]
  );

  const persistEntries = async (next: MoodEntry[]) => {
    await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument(next), null, 2));
    setEntries(next);
  };

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument([]), null, 2));
        setEntries([]);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isDocument(parsed)) {
          setEntries(parsed.entries.map(normalizeEntry).filter((entry): entry is MoodEntry => entry !== null));
          return;
        }
      } catch {
        setStatus("Saved data was unreadable. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  const updateAxis = (key: AxisKey, value: number) => {
    setAxes((current) => ({ ...current, [key]: clampAxis(value) }));
  };

  const resetForm = () => {
    setAxes({ calmAnxious: 0, happySad: 0, energizedTired: 0 });
    setNote("");
  };

  const saveEntry = async () => {
    const now = new Date().toISOString();
    const next: MoodEntry = {
      id: crypto.randomUUID(),
      createdAtIso: now,
      axes: { ...axes },
      note: note.trim()
    };
    await persistEntries([next, ...entries]);
    resetForm();
    setStatus("Check-in saved.");
  };

  const exportEntries = async () => {
    const raw = await ctx.vfs.readText(STORAGE_PATH);
    if (!raw) {
      setStatus("No entries to export yet.");
      return;
    }

    const blob = new Blob([raw], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "mood-tracker.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const deleteEntry = async (entry: MoodEntry) => {
    await persistEntries(entries.filter((item) => item.id !== entry.id));
    setStatus("Entry deleted.");
  };

  return (
    <SlapApplicationShell title="Mood Tracker">
      <SlapApplicationTitle title="Mood Tracker" />
      <SlapInlineText>
        Quick mood check-in with multiple dimensions. Track the good, the hard, and anything in between.
      </SlapInlineText>
      {status ? <p className="status-line">{status}</p> : null}

      <section className="mood-tracker-form">
        {AXES.map((axis) => (
          <div key={axis.key} className="mood-axis">
            <div className="mood-axis-header">
              <span>{axis.label}</span>
              <span className="mood-axis-value">{axisDisplay(axes[axis.key], axis.left, axis.right)}</span>
            </div>
            <div className="mood-axis-scale">
              <span>{axis.left}</span>
              <input
                type="range"
                min={-5}
                max={5}
                step={1}
                value={axes[axis.key]}
                onChange={(event) => updateAxis(axis.key, Number(event.target.value))}
              />
              <span>{axis.right}</span>
            </div>
          </div>
        ))}

        <label className="slap-input-wrap mood-note">
          <span>What's on your mind? (good, bad, or both)</span>
          <textarea
            className="slap-input"
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="A small win, a worry, or something you want to remember."
          />
        </label>
      </section>

      <div className="slap-button-row">
        <SlapActionButton title="Save Check-in" onClick={saveEntry} />
        <SlapActionButton title="Reset" onClick={resetForm} />
        <SlapActionButton title="Export JSON" onClick={() => void exportEntries()} />
      </div>

      <h3 className="section-title">Recent Check-ins</h3>
      {sortedEntries.length === 0 ? (
        <p className="slap-inline-text">No entries yet. Save your first check-in above.</p>
      ) : (
        <ul className="mood-entry-list">
          {sortedEntries.map((entry) => (
            <li key={entry.id} className="mood-entry">
              <div className="mood-entry-header">
                <strong>{formatTimestamp(entry.createdAtIso)}</strong>
                <div className="mood-entry-actions">
                  <button type="button" className="mood-mini-button" onClick={() => void deleteEntry(entry)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="mood-entry-chips">
                {AXES.map((axis) => (
                  <span key={axis.key} className="mood-chip">
                    {axis.label}: {axisDisplay(entry.axes[axis.key], axis.left, axis.right)}
                  </span>
                ))}
              </div>
              {entry.note ? (
                <p className="mood-entry-note">{entry.note}</p>
              ) : (
                <p className="mood-entry-note is-empty">No note added.</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </SlapApplicationShell>
  );
};

export const moodTrackerManifest: SlapApplicationManifest = {
  id: "mood-tracker",
  title: "Mood Tracker",
  author: "Joel",
  description: "Track your mood across calm/anxious, happy/sad, and energy levels.",
  icon: "😊",
  Preview,
  Application: MoodTrackerApp
};
