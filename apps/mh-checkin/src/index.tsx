import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type AssessmentType = "phq9" | "gad7" | "abc";
type ScaleType = "phq9" | "gad7";

type ScaleAssessmentRecord = {
  id: string;
  type: ScaleType;
  createdAtIso: string;
  answers: number[];
  score: number;
  severity: string;
};

type AbcAssessmentRecord = {
  id: string;
  type: "abc";
  createdAtIso: string;
  activatingEvent: string;
  beliefs: string;
  consequences: string;
  disputation?: string;
  effectiveBelief?: string;
  distressBefore?: number;
  distressAfter?: number;
};

type AssessmentRecord = ScaleAssessmentRecord | AbcAssessmentRecord;

type PersistedData = {
  app: "slap-mh-checkin";
  version: 1;
  records: AssessmentRecord[];
};

type AssessmentDefinition = {
  id: ScaleType;
  title: string;
  maxScore: number;
  questions: string[];
  getSeverity: (score: number) => string;
};

const STORAGE_PATH = "mh-checkin-results.json";
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

const GAD7: AssessmentDefinition = {
  id: "gad7",
  title: "GAD-7",
  maxScore: 21,
  questions: [
    "Feeling nervous, anxious, or on edge",
    "Not being able to stop or control worrying",
    "Worrying too much about different things",
    "Trouble relaxing",
    "Being so restless that it is hard to sit still",
    "Becoming easily annoyed or irritable",
    "Feeling afraid as if something awful might happen"
  ],
  getSeverity: (score) => {
    if (score <= 4) return "Minimal";
    if (score <= 9) return "Mild";
    if (score <= 14) return "Moderate";
    return "Severe";
  }
};

const DEFINITIONS: Record<ScaleType, AssessmentDefinition> = {
  phq9: PHQ9,
  gad7: GAD7
};

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>MH Checkin</strong>
    <p>PHQ-9, GAD-7, and ABC worksheet with trends/export.</p>
  </article>
);

const isScaleType = (value: AssessmentType): value is ScaleType => value === "phq9" || value === "gad7";

const isScaleRecord = (value: Record<string, unknown>): value is ScaleAssessmentRecord => {
  return (
    typeof value.id === "string" &&
    (value.type === "phq9" || value.type === "gad7") &&
    typeof value.createdAtIso === "string" &&
    Array.isArray(value.answers) &&
    value.answers.every((answer) => typeof answer === "number") &&
    typeof value.score === "number" &&
    typeof value.severity === "string"
  );
};

const isAbcRecord = (value: Record<string, unknown>): value is AbcAssessmentRecord => {
  return (
    typeof value.id === "string" &&
    value.type === "abc" &&
    typeof value.createdAtIso === "string" &&
    typeof value.activatingEvent === "string" &&
    typeof value.beliefs === "string" &&
    typeof value.consequences === "string" &&
    (typeof value.disputation === "string" || typeof value.disputation === "undefined") &&
    (typeof value.effectiveBelief === "string" || typeof value.effectiveBelief === "undefined") &&
    (typeof value.distressBefore === "number" || typeof value.distressBefore === "undefined") &&
    (typeof value.distressAfter === "number" || typeof value.distressAfter === "undefined")
  );
};

const isAssessmentRecord = (value: unknown): value is AssessmentRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return isScaleRecord(candidate) || isAbcRecord(candidate);
};

const toPersisted = (records: AssessmentRecord[]): PersistedData => ({
  app: "slap-mh-checkin",
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

const getScaleTrendSummary = (records: AssessmentRecord[], type: ScaleType) => {
  const selected = records
    .filter((record): record is ScaleAssessmentRecord => record.type === type)
    .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));

  if (selected.length === 0) {
    return "No trend data yet.";
  }

  const last = selected.slice(-5);
  const previous = selected.slice(-10, -5);

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

const getAbcTrendSummary = (records: AssessmentRecord[]) => {
  const selected = records
    .filter((record): record is AbcAssessmentRecord => record.type === "abc")
    .sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));

  if (selected.length === 0) {
    return "No trend data yet.";
  }

  const distressSamples = selected.filter(
    (record) => typeof record.distressBefore === "number" && typeof record.distressAfter === "number"
  );

  if (distressSamples.length === 0) {
    return "Trend tip: include distress before/after (0-10) to track change over time.";
  }

  const recent = distressSamples.slice(-5);
  const averageBefore = recent.reduce((sum, item) => sum + (item.distressBefore ?? 0), 0) / recent.length;
  const averageAfter = recent.reduce((sum, item) => sum + (item.distressAfter ?? 0), 0) / recent.length;
  const improvement = averageBefore - averageAfter;

  if (Math.abs(improvement) < 0.2) {
    return `Recent distress change: stable (${averageBefore.toFixed(1)} -> ${averageAfter.toFixed(1)}).`;
  }

  if (improvement > 0) {
    return `Recent distress change: improved by ${improvement.toFixed(1)} points (${averageBefore.toFixed(1)} -> ${averageAfter.toFixed(1)}).`;
  }

  return `Recent distress change: increased by ${Math.abs(improvement).toFixed(1)} points (${averageBefore.toFixed(1)} -> ${averageAfter.toFixed(1)}).`;
};

const toDistressValue = (input: string): number | undefined => {
  if (!input.trim()) {
    return undefined;
  }

  const parsed = Number(input);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 10) {
    return Number.NaN;
  }

  return parsed;
};

const MhCheckinApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [activeType, setActiveType] = useState<AssessmentType>("phq9");
  const [records, setRecords] = useState<AssessmentRecord[]>([]);
  const [answers, setAnswers] = useState<number[]>(() => new Array(PHQ9.questions.length).fill(-1));
  const [status, setStatus] = useState<string>("");

  const [activatingEvent, setActivatingEvent] = useState("");
  const [beliefs, setBeliefs] = useState("");
  const [consequences, setConsequences] = useState("");
  const [disputation, setDisputation] = useState("");
  const [effectiveBelief, setEffectiveBelief] = useState("");
  const [distressBefore, setDistressBefore] = useState("");
  const [distressAfter, setDistressAfter] = useState("");

  const scaleDefinition = isScaleType(activeType) ? DEFINITIONS[activeType] : null;

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (typeof parsed === "object" && parsed !== null) {
          const candidate = parsed as { records?: unknown };
          if (Array.isArray(candidate.records)) {
            setRecords(candidate.records.filter(isAssessmentRecord));
          }
        }
      } catch {
        setStatus("Saved data was unreadable. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    setStatus("");

    if (isScaleType(activeType)) {
      setAnswers(new Array(DEFINITIONS[activeType].questions.length).fill(-1));
      return;
    }

    setActivatingEvent("");
    setBeliefs("");
    setConsequences("");
    setDisputation("");
    setEffectiveBelief("");
    setDistressBefore("");
    setDistressAfter("");
  }, [activeType]);

  const persist = async (nextRecords: AssessmentRecord[]) => {
    await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toPersisted(nextRecords), null, 2));
    setRecords(nextRecords);
  };

  const setAnswer = (index: number, value: number) => {
    setAnswers((current) => current.map((entry, entryIndex) => (entryIndex === index ? value : entry)));
  };

  const submitScale = async (type: ScaleType) => {
    const definition = DEFINITIONS[type];

    if (answers.some((value) => value < 0)) {
      setStatus("Please answer every question before submitting.");
      return;
    }

    const score = answers.reduce((sum, value) => sum + value, 0);
    const nextRecord: ScaleAssessmentRecord = {
      id: crypto.randomUUID(),
      type,
      createdAtIso: new Date().toISOString(),
      answers,
      score,
      severity: definition.getSeverity(score)
    };

    const next = [nextRecord, ...records].slice(0, 300);
    await persist(next);
    setStatus(`${definition.title} saved: ${score}/${definition.maxScore} (${nextRecord.severity})`);
    setAnswers(new Array(definition.questions.length).fill(-1));
  };

  const submitAbc = async () => {
    if (!activatingEvent.trim() || !beliefs.trim() || !consequences.trim()) {
      setStatus("Please fill A (event), B (beliefs), and C (consequences).");
      return;
    }

    const beforeValue = toDistressValue(distressBefore);
    const afterValue = toDistressValue(distressAfter);

    if (Number.isNaN(beforeValue) || Number.isNaN(afterValue)) {
      setStatus("Distress values must be between 0 and 10.");
      return;
    }

    const nextRecord: AbcAssessmentRecord = {
      id: crypto.randomUUID(),
      type: "abc",
      createdAtIso: new Date().toISOString(),
      activatingEvent: activatingEvent.trim(),
      beliefs: beliefs.trim(),
      consequences: consequences.trim(),
      disputation: disputation.trim() || undefined,
      effectiveBelief: effectiveBelief.trim() || undefined,
      distressBefore: beforeValue,
      distressAfter: afterValue
    };

    const next = [nextRecord, ...records].slice(0, 300);
    await persist(next);
    setStatus("ABC worksheet saved.");

    setActivatingEvent("");
    setBeliefs("");
    setConsequences("");
    setDisputation("");
    setEffectiveBelief("");
    setDistressBefore("");
    setDistressAfter("");
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
    anchor.download = "mh-checkin-results.json";
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const historyForType = useMemo(
    () => records.filter((record) => record.type === activeType).sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [records, activeType]
  );

  const latest = historyForType[0] ?? null;
  const trendSummary = isScaleType(activeType)
    ? getScaleTrendSummary(records, activeType)
    : getAbcTrendSummary(records);

  return (
    <SlapApplicationShell title="MH Checkin">
      <SlapApplicationTitle title="Mental Health Check-in" />
      <SlapInlineText>
        Screening support only, not a diagnosis. If you are in immediate danger, call 911 or local emergency services.
      </SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="PHQ-9" onClick={() => setActiveType("phq9")} />
        <SlapActionButton title="GAD-7" onClick={() => setActiveType("gad7")} />
        <SlapActionButton title="ABC Worksheet" onClick={() => setActiveType("abc")} />
        <SlapActionButton title="Export Results" onClick={() => void exportResults()} />
      </div>

      <SlapInlineText>
        Current form: {isScaleType(activeType) ? DEFINITIONS[activeType].title : "ABC Worksheet"}
      </SlapInlineText>

      {latest ? (
        isScaleType(activeType) && "score" in latest ? (
          <SlapInlineText>
            Last score: {latest.score}/{DEFINITIONS[activeType].maxScore} ({latest.severity})
          </SlapInlineText>
        ) : (
          <SlapInlineText>Last ABC worksheet saved: {formatDate(latest.createdAtIso)}</SlapInlineText>
        )
      ) : (
        <SlapInlineText>No completed assessments for this form yet.</SlapInlineText>
      )}

      <SlapInlineText>{trendSummary}</SlapInlineText>
      {status ? <SlapInlineText>{status}</SlapInlineText> : null}

      <SlapApplicationTitle title={`History (${historyForType.length})`} />
      {historyForType.length === 0 ? <SlapInlineText>No history yet.</SlapInlineText> : null}
      {historyForType.map((record) => (
        <details key={record.id} className="journal-entry-accordion">
          <summary className="journal-entry-summary">
            {record.type === "abc" ? (
              <strong>{formatDate(record.createdAtIso)} | ABC Worksheet</strong>
            ) : (
              <strong>
                {formatDate(record.createdAtIso)} | Score {record.score}/{DEFINITIONS[record.type].maxScore} ({record.severity})
              </strong>
            )}
          </summary>
          <article className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
            {record.type === "abc" ? (
              <>
                <SlapInlineText>A: {record.activatingEvent}</SlapInlineText>
                <SlapInlineText>B: {record.beliefs}</SlapInlineText>
                <SlapInlineText>C: {record.consequences}</SlapInlineText>
                {record.disputation ? <SlapInlineText>D: {record.disputation}</SlapInlineText> : null}
                {record.effectiveBelief ? <SlapInlineText>E: {record.effectiveBelief}</SlapInlineText> : null}
                {typeof record.distressBefore === "number" ? (
                  <SlapInlineText>Distress before: {record.distressBefore}/10</SlapInlineText>
                ) : null}
                {typeof record.distressAfter === "number" ? (
                  <SlapInlineText>Distress after: {record.distressAfter}/10</SlapInlineText>
                ) : null}
              </>
            ) : (
              record.answers.map((answer, index) => (
                <SlapInlineText key={`${record.id}-${index}`}>
                  Q{index + 1}: {answer} ({SCORE_LABELS[answer] ?? "Unknown"})
                </SlapInlineText>
              ))
            )}
          </article>
        </details>
      ))}

      {isScaleType(activeType) && scaleDefinition ? (
        <>
          {scaleDefinition.questions.map((question, index) => (
            <article key={question} className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.5rem" }}>
              <strong>
                {index + 1}. {question}
              </strong>
              <div className="slap-button-row">
                {SCORE_OPTIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    className="calc-key"
                    style={{
                      minHeight: "40px",
                      borderColor: answers[index] === option ? "#2d4030" : undefined,
                      fontWeight: answers[index] === option ? 800 : 600
                    }}
                    onClick={() => setAnswer(index, option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <SlapInlineText>
                {SCORE_LABELS.map((label, labelIndex) => `${labelIndex}: ${label}`).join(" | ")}
              </SlapInlineText>
            </article>
          ))}

          <SlapActionButton title={`Save ${scaleDefinition.title} Result`} onClick={() => void submitScale(activeType)} />
        </>
      ) : null}

      {activeType === "abc" ? (
        <>
          <label className="slap-input-wrap">
            <span>A: Activating Event</span>
            <textarea
              className="slap-input"
              rows={3}
              value={activatingEvent}
              onChange={(event) => setActivatingEvent(event.target.value)}
            />
          </label>

          <label className="slap-input-wrap">
            <span>B: Beliefs / Thoughts</span>
            <textarea
              className="slap-input"
              rows={3}
              value={beliefs}
              onChange={(event) => setBeliefs(event.target.value)}
            />
          </label>

          <label className="slap-input-wrap">
            <span>C: Consequences (emotions/behaviors)</span>
            <textarea
              className="slap-input"
              rows={3}
              value={consequences}
              onChange={(event) => setConsequences(event.target.value)}
            />
          </label>

          <label className="slap-input-wrap">
            <span>D: Dispute / Reframe (optional)</span>
            <textarea
              className="slap-input"
              rows={2}
              value={disputation}
              onChange={(event) => setDisputation(event.target.value)}
            />
          </label>

          <label className="slap-input-wrap">
            <span>E: Effective New Belief (optional)</span>
            <textarea
              className="slap-input"
              rows={2}
              value={effectiveBelief}
              onChange={(event) => setEffectiveBelief(event.target.value)}
            />
          </label>

          <div className="slap-button-row">
            <label className="slap-input-wrap" style={{ maxWidth: "140px" }}>
              <span>Distress Before (0-10)</span>
              <input
                className="slap-input"
                type="number"
                min={0}
                max={10}
                value={distressBefore}
                onChange={(event) => setDistressBefore(event.target.value)}
              />
            </label>
            <label className="slap-input-wrap" style={{ maxWidth: "140px" }}>
              <span>Distress After (0-10)</span>
              <input
                className="slap-input"
                type="number"
                min={0}
                max={10}
                value={distressAfter}
                onChange={(event) => setDistressAfter(event.target.value)}
              />
            </label>
          </div>

          <SlapActionButton title="Save ABC Worksheet" onClick={() => void submitAbc()} />
        </>
      ) : null}
    </SlapApplicationShell>
  );
};

export const mhCheckinManifest: SlapApplicationManifest = {
  id: "mh-checkin",
  title: "MH Checkin",
  author: "Joel",
  description: "PHQ-9, GAD-7, and ABC worksheet with trends/export.",
  icon: "🧠",
  Preview,
  Application: MhCheckinApp
};
