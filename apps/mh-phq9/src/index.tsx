import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type ScaleAssessmentRecord = {
  id: string;
  type: "phq9";
  createdAtIso: string;
  answers: number[];
  score: number;
  severity: string;
};

type PersistedData = {
  app: "slap-mh-phq9";
  version: 1;
  records: ScaleAssessmentRecord[];
};

type AssessmentDefinition = {
  id: "phq9";
  title: string;
  maxScore: number;
  questions: string[];
  getSeverity: (score: number) => string;
};

const STORAGE_PATH = "mh-phq9-results.json";
const LEGACY_APP_ID = "mh-checkin";
const LEGACY_STORAGE_PATH = "mh-checkin-results.json";
const SCORE_OPTIONS = [0, 1, 2, 3] as const;
const SCORE_LABELS = [
  "Not at all",
  "Several days",
  "More than half the days",
  "Nearly every day"
] as const;

const PHQ9: AssessmentDefinition = {
  id: "phq9",
  title: "PHQ-9",
  maxScore: 27,
  questions: [
    "Little interest or pleasure in doing things",
    "Feeling down, depressed, or hopeless",
    "Trouble falling or staying asleep, or sleeping too much",
    "Feeling tired or having little energy",
    "Poor appetite or overeating",
    "Feeling bad about yourself or that you are a failure",
    "Trouble concentrating on things",
    "Moving or speaking slowly, or being fidgety/restless",
    "Thoughts that you would be better off dead or hurting yourself"
  ],
  getSeverity: (score) => {
    if (score <= 4) return "Minimal";
    if (score <= 9) return "Mild";
    if (score <= 14) return "Moderate";
    if (score <= 19) return "Moderately Severe";
    return "Severe";
  }
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>PHQ-9 Check-in</strong>
    <p>PHQ-9 screening with history, trends, and export.</p>
  </article>
);

const readLegacyText = () => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage?.getItem(`slap:v1:${LEGACY_APP_ID}:${LEGACY_STORAGE_PATH}`) ?? null;
  } catch {
    return null;
  }
};

const isScaleRecord = (value: unknown): value is ScaleAssessmentRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.type === "phq9" &&
    typeof candidate.createdAtIso === "string" &&
    Array.isArray(candidate.answers) &&
    candidate.answers.every((answer) => typeof answer === "number") &&
    typeof candidate.score === "number" &&
    typeof candidate.severity === "string"
  );
};

const toPersisted = (records: ScaleAssessmentRecord[]): PersistedData => ({
  app: "slap-mh-phq9",
  version: 1,
  records
});

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const getTrendSummary = (records: ScaleAssessmentRecord[]) => {
  const sorted = [...records].sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  if (sorted.length === 0) {
    return "No trend data yet.";
  }

  const last = sorted.slice(-5);
  const previous = sorted.slice(-10, -5);
  const lastAverage = last.reduce((sum, item) => sum + item.score, 0) / last.length;

  if (previous.length === 0) {
    return `Recent average: ${lastAverage.toFixed(1)}.`;
  }

  const previousAverage = previous.reduce((sum, item) => sum + item.score, 0) / previous.length;
  const delta = Number((lastAverage - previousAverage).toFixed(1));

  if (Math.abs(delta) < 0.3) {
    return `Recent average: ${lastAverage.toFixed(1)} (stable).`;
  }

  return delta > 0
    ? `Recent average: ${lastAverage.toFixed(1)} (up ${delta.toFixed(1)} from prior period).`
    : `Recent average: ${lastAverage.toFixed(1)} (down ${Math.abs(delta).toFixed(1)} from prior period).`;
};

const MhPhq9App = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [records, setRecords] = useState<ScaleAssessmentRecord[]>([]);
  const [answers, setAnswers] = useState<number[]>(() => new Array(PHQ9.questions.length).fill(0));
  const [status, setStatus] = useState<string>("");

  const persist = async (nextRecords: ScaleAssessmentRecord[]) => {
    await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toPersisted(nextRecords), null, 2));
    setRecords(nextRecords);
  };

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as unknown;
          if (typeof parsed === "object" && parsed !== null) {
            const candidate = parsed as { records?: unknown };
            if (Array.isArray(candidate.records)) {
              setRecords(candidate.records.filter(isScaleRecord));
            }
          }
        } catch {
          setStatus("Saved data was unreadable. Starting fresh.");
        }
        return;
      }

      const legacyRaw = readLegacyText();
      if (!legacyRaw) {
        return;
      }

      try {
        const parsed = JSON.parse(legacyRaw) as unknown;
        if (typeof parsed === "object" && parsed !== null) {
          const candidate = parsed as { records?: unknown };
          if (Array.isArray(candidate.records)) {
            const migrated = candidate.records.filter(isScaleRecord);
            if (migrated.length > 0) {
              await persist(migrated);
              setStatus(`Imported ${migrated.length} legacy entries.`);
            }
          }
        }
      } catch {
        setStatus("Legacy data was unreadable.");
      }
    })();
  }, [ctx.vfs]);

  const setAnswer = (index: number, value: number) => {
    setAnswers((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const submitScale = async () => {
    const score = answers.reduce((sum, value) => sum + value, 0);
    const nextRecord: ScaleAssessmentRecord = {
      id: crypto.randomUUID(),
      type: "phq9",
      createdAtIso: new Date().toISOString(),
      answers,
      score,
      severity: PHQ9.getSeverity(score)
    };

    const next = [nextRecord, ...records].slice(0, 300);
    await persist(next);
    setStatus(`${PHQ9.title} saved: ${score}/${PHQ9.maxScore} (${nextRecord.severity})`);
    setAnswers(new Array(PHQ9.questions.length).fill(0));
  };

  const exportResults = async () => {
    const raw = await ctx.vfs.readText(STORAGE_PATH);
    if (!raw) {
      setStatus("No results to export yet.");
      return;
    }

    const blob = new Blob([raw], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = "phq9-results.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const history = useMemo(
    () => [...records].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [records]
  );
  const latest = history[0] ?? null;
  const trendSummary = getTrendSummary(records);

  return (
    <SlapApplicationShell title="PHQ-9 Check-in">
      <SlapApplicationTitle title="PHQ-9 Check-in" />
      <SlapInlineText>
        Screening support only, not a diagnosis. If you are in immediate danger, call 911 or local emergency services.
      </SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="Export Results" onClick={() => void exportResults()} />
      </div>

      {latest ? (
        <SlapInlineText>
          Last score: {latest.score}/{PHQ9.maxScore} ({latest.severity})
        </SlapInlineText>
      ) : (
        <SlapInlineText>No completed assessments yet.</SlapInlineText>
      )}

      <SlapInlineText>{trendSummary}</SlapInlineText>
      {status ? <SlapInlineText>{status}</SlapInlineText> : null}

      <SlapApplicationTitle title={`History (${history.length})`} />
      {history.length === 0 ? <SlapInlineText>No history yet.</SlapInlineText> : null}
      {history.map((record) => (
        <details key={record.id} className="journal-entry-accordion">
          <summary className="journal-entry-summary">
            <strong>
              {formatDate(record.createdAtIso)} | Score {record.score}/{PHQ9.maxScore} ({record.severity})
            </strong>
          </summary>
          <article className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
            {record.answers.map((answer, index) => (
              <SlapInlineText key={`${record.id}-${index}`}>
                Q{index + 1}: {answer} ({SCORE_LABELS[answer] ?? "Unknown"})
              </SlapInlineText>
            ))}
          </article>
        </details>
      ))}

      {PHQ9.questions.map((question, index) => {
        const value = answers[index] ?? 0;
        return (
          <article key={question} className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.5rem" }}>
            <strong>
              {index + 1}. {question}
            </strong>
            <div className="slap-slider-row">
              <input
                className="slap-slider"
                type="range"
                min={0}
                max={3}
                step={1}
                value={value}
                onChange={(event) => setAnswer(index, Number(event.target.value))}
              />
              <div className="slap-slider-labels">
                {SCORE_OPTIONS.map((option) => (
                  <span key={option}>{option}</span>
                ))}
              </div>
            </div>
            <SlapInlineText>
              Selected: {value} — {SCORE_LABELS[value]}
            </SlapInlineText>
            <SlapInlineText>{SCORE_LABELS.map((label, labelIndex) => `${labelIndex}: ${label}`).join(" | ")}</SlapInlineText>
          </article>
        );
      })}

      <SlapActionButton title={`Save ${PHQ9.title} Result`} onClick={() => void submitScale()} />
    </SlapApplicationShell>
  );
};

export const mhPhq9Manifest: SlapApplicationManifest = {
  id: "mh-phq9",
  title: "PHQ-9 Check-in",
  author: "Joel",
  description: "PHQ-9 screening with history, trends, and export.",
  icon: "PHQ-9",
  Preview,
  Application: MhPhq9App
};
