import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

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

type PersistedData = {
  app: "slap-mh-abc";
  version: 1;
  records: AbcAssessmentRecord[];
};

const STORAGE_PATH = "mh-abc-results.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>ABC Worksheet</strong>
    <p>ABC worksheet entries with trends and export.</p>
  </article>
);

const isAbcRecord = (value: unknown): value is AbcAssessmentRecord => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    candidate.type === "abc" &&
    typeof candidate.createdAtIso === "string" &&
    typeof candidate.activatingEvent === "string" &&
    typeof candidate.beliefs === "string" &&
    typeof candidate.consequences === "string" &&
    (typeof candidate.disputation === "string" || typeof candidate.disputation === "undefined") &&
    (typeof candidate.effectiveBelief === "string" || typeof candidate.effectiveBelief === "undefined") &&
    (typeof candidate.distressBefore === "number" || typeof candidate.distressBefore === "undefined") &&
    (typeof candidate.distressAfter === "number" || typeof candidate.distressAfter === "undefined")
  );
};

const toPersisted = (records: AbcAssessmentRecord[]): PersistedData => ({
  app: "slap-mh-abc",
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

const getTrendSummary = (records: AbcAssessmentRecord[]) => {
  const sorted = [...records].sort((a, b) => a.createdAtIso.localeCompare(b.createdAtIso));
  if (sorted.length === 0) {
    return "No trend data yet.";
  }

  const distressSamples = sorted.filter(
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

const MhAbcApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [records, setRecords] = useState<AbcAssessmentRecord[]>([]);
  const [status, setStatus] = useState<string>("");

  const [activatingEvent, setActivatingEvent] = useState("");
  const [beliefs, setBeliefs] = useState("");
  const [consequences, setConsequences] = useState("");
  const [disputation, setDisputation] = useState("");
  const [effectiveBelief, setEffectiveBelief] = useState("");
  const [distressBefore, setDistressBefore] = useState("");
  const [distressAfter, setDistressAfter] = useState("");

  const persist = async (nextRecords: AbcAssessmentRecord[]) => {
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
              setRecords(candidate.records.filter(isAbcRecord));
            }
          }
        } catch {
          setStatus("Saved data was unreadable. Starting fresh.");
        }
        return;
      }

    })();
  }, [ctx.vfs]);

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
    anchor.download = "abc-worksheet-results.json";
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
    <SlapApplicationShell title="ABC Worksheet">
      <SlapApplicationTitle title="ABC Worksheet" />
      <SlapInlineText>
        Worksheet support only, not a diagnosis. If you are in immediate danger, call 911 or local emergency services.
      </SlapInlineText>

      <div className="slap-button-row">
        <SlapActionButton title="Export Results" onClick={() => void exportResults()} />
      </div>

      {latest ? (
        <SlapInlineText>Last ABC worksheet saved: {formatDate(latest.createdAtIso)}</SlapInlineText>
      ) : (
        <SlapInlineText>No ABC worksheets saved yet.</SlapInlineText>
      )}

      <SlapInlineText>{trendSummary}</SlapInlineText>
      {status ? <SlapInlineText>{status}</SlapInlineText> : null}

      <SlapApplicationTitle title={`History (${history.length})`} />
      {history.length === 0 ? <SlapInlineText>No history yet.</SlapInlineText> : null}
      {history.map((record) => (
        <details key={record.id} className="journal-entry-accordion">
          <summary className="journal-entry-summary">
            <strong>{formatDate(record.createdAtIso)} | ABC Worksheet</strong>
          </summary>
          <article className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
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
          </article>
        </details>
      ))}

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
    </SlapApplicationShell>
  );
};

export const mhAbcManifest: SlapApplicationManifest = {
  id: "mh-abc",
  title: "ABC Worksheet",
  author: "Joel",
  description: "ABC worksheet entries with trends and export.",
  icon: "ABC",
  Preview,
  Application: MhAbcApp
};
