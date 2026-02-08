import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import {
  SlapActionButton,
  SlapApplicationShell,
  SlapApplicationTitle,
  SlapInlineText,
  SlapTextInput
} from "@slap/ui";
import { JOURNAL_PROMPT_BANK } from "./prompts";

type JournalEntry = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  subject: string;
  body: string;
  mood: string;
  promptQuestion?: string;
};

type JournalPlain = {
  app: "slap-journal";
  version: 1;
  encrypted: false;
  entries: JournalEntry[];
};

const MOOD_OPTIONS = [
  "None",
  "Great",
  "Good",
  "Okay",
  "Tired",
  "Stressed",
  "Anxious",
  "Sad",
  "Excited",
  "Grateful",
  "Custom"
] as const;

const JOURNAL_PATH = "journal.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Journal</strong>
    <p>Mood check-in plus optional writing prompts.</p>
  </article>
);

const normalizeJournalEntry = (value: unknown): JournalEntry | null => {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.createdAtIso !== "string" ||
    typeof candidate.updatedAtIso !== "string" ||
    typeof candidate.subject !== "string" ||
    typeof candidate.body !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    createdAtIso: candidate.createdAtIso,
    updatedAtIso: candidate.updatedAtIso,
    subject: candidate.subject,
    body: candidate.body,
    mood: typeof candidate.mood === "string" && candidate.mood.trim() ? candidate.mood : "Unspecified",
    promptQuestion: typeof candidate.promptQuestion === "string" ? candidate.promptQuestion : undefined
  };
};

const isJournalPlain = (value: unknown): value is JournalPlain => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.app === "slap-journal" &&
    candidate.version === 1 &&
    candidate.encrypted === false &&
    Array.isArray(candidate.entries)
  );
};

const asDisplayDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return { date: "Unknown", time: "Unknown" };
  }

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  };
};

const toPlainDocument = (entries: JournalEntry[]): JournalPlain => ({
  app: "slap-journal",
  version: 1,
  encrypted: false,
  entries
});

const randomPrompt = (previous?: string) => {
  if (JOURNAL_PROMPT_BANK.length === 0) {
    return "";
  }

  if (JOURNAL_PROMPT_BANK.length === 1) {
    return JOURNAL_PROMPT_BANK[0];
  }

  let next = JOURNAL_PROMPT_BANK[Math.floor(Math.random() * JOURNAL_PROMPT_BANK.length)];
  while (next === previous) {
    next = JOURNAL_PROMPT_BANK[Math.floor(Math.random() * JOURNAL_PROMPT_BANK.length)];
  }
  return next;
};

const MarkdownBlock = ({
  html,
  className
}: {
  html: string;
  className?: string;
}) => <div className={className ?? "slap-markdown"} dangerouslySetInnerHTML={{ __html: html }} />;

const JournalApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [mood, setMood] = useState<string>(MOOD_OPTIONS[0]);
  const [customMood, setCustomMood] = useState("");
  const [promptQuestion, setPromptQuestion] = useState<string>(() => randomPrompt());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [legacyLockedDataDetected, setLegacyLockedDataDetected] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [entries]
  );

  const writeDoc = async (doc: JournalPlain) => {
    await ctx.vfs.writeText(JOURNAL_PATH, JSON.stringify(doc, null, 2));
  };

  const persistEntries = async (nextEntries: JournalEntry[]) => {
    await writeDoc(toPlainDocument(nextEntries));
    setEntries(nextEntries);
  };

  const loadFromDisk = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const raw = await ctx.vfs.readText(JOURNAL_PATH);

      if (!raw) {
        const initial = toPlainDocument([]);
        await writeDoc(initial);
        setEntries([]);
        setLegacyLockedDataDetected(false);
        return;
      }

      const parsed = JSON.parse(raw) as unknown;

      if (isJournalPlain(parsed)) {
        setEntries(parsed.entries.map(normalizeJournalEntry).filter((entry): entry is JournalEntry => entry !== null));
        setLegacyLockedDataDetected(false);
        return;
      }

      const candidate = parsed as { encrypted?: unknown };
      if (candidate && candidate.encrypted === true) {
        setLegacyLockedDataDetected(true);
        setEntries([]);
        setError("Legacy locked journal detected. Reset journal data to continue without password.");
        return;
      }

      throw new Error("journal.json has an unsupported format.");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load journal.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadFromDisk();
  }, [ctx.vfs]);

  const addEntry = async () => {
    setError(null);

    const finalMood = mood === "Custom" ? customMood.trim() || "None" : mood;

    if (!body.trim()) {
      setError("Entry text is required.");
      return;
    }

    const now = new Date().toISOString();
    const fallbackSubject = `Entry ${new Date(now).toLocaleDateString()} ${new Date(now).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;

    const nextEntry: JournalEntry = {
      id: crypto.randomUUID(),
      createdAtIso: now,
      updatedAtIso: now,
      subject: subject.trim() || fallbackSubject,
      body: body.trim(),
      mood: finalMood,
      promptQuestion: promptQuestion || undefined
    };

    try {
      await persistEntries([nextEntry, ...entries]);
      setSubject("");
      setBody("");
      setPromptQuestion((previous) => randomPrompt(previous));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save entry.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);

    try {
      await persistEntries(entries.filter((entry) => entry.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete entry.");
    }
  };

  const exportJournal = async () => {
    setError(null);

    try {
      const raw = await ctx.vfs.readText(JOURNAL_PATH);
      if (!raw) {
        setError("No journal data found to export.");
        return;
      }

      const blob = new Blob([raw], { type: "application/json" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = "journal.json";
      anchor.click();
      URL.revokeObjectURL(href);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    }
  };

  const importJournalText = async (raw: string) => {
    const parsed = JSON.parse(raw) as unknown;

    if (!isJournalPlain(parsed)) {
      throw new Error("Only non-encrypted journal.json imports are supported.");
    }

    const sanitized: JournalPlain = {
      ...parsed,
      entries: parsed.entries.map(normalizeJournalEntry).filter((entry): entry is JournalEntry => entry !== null)
    };

    await writeDoc(sanitized);
    setEntries(sanitized.entries);
    setLegacyLockedDataDetected(false);
  };

  const onImportPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file) {
      return;
    }

    setError(null);

    try {
      const raw = await file.text();
      await importJournalText(raw);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    }
  };

  const resetJournal = async () => {
    setError(null);

    try {
      await writeDoc(toPlainDocument([]));
      setEntries([]);
      setLegacyLockedDataDetected(false);
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Reset failed.");
    }
  };

  return (
    <SlapApplicationShell title="Journal">
      <SlapApplicationTitle title="New Entry" />

      {isLoading ? <SlapInlineText>Loading journal...</SlapInlineText> : null}
      {error ? <SlapInlineText>Error: {error}</SlapInlineText> : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void onImportPicked(event)}
        style={{ display: "none" }}
      />

      {!isLoading && !legacyLockedDataDetected ? (
        <>
          <label className="slap-input-wrap">
            <span>Mood</span>
            <select className="slap-input" value={mood} onChange={(event) => setMood(event.target.value)}>
              {MOOD_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {mood === "Custom" ? (
            <SlapTextInput label="Custom Mood" value={customMood} onChange={setCustomMood} />
          ) : null}

          <SlapTextInput label="Subject (optional)" value={subject} onChange={setSubject} />

          <label className="slap-input-wrap">
            <span>Entry</span>
            <textarea
              className="slap-input"
              rows={5}
              value={body}
              placeholder={promptQuestion}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>

          <div className="slap-button-row">
            <SlapActionButton
              title="New Prompt"
              onClick={() => setPromptQuestion((previous) => randomPrompt(previous))}
            />
            <SlapActionButton title="Save Entry" onClick={() => void addEntry()} />
          </div>

          <SlapApplicationTitle title="Entries" />
          {sortedEntries.length === 0 ? <SlapInlineText>No entries yet.</SlapInlineText> : null}

          {sortedEntries.map((entry) => {
            const created = asDisplayDate(entry.createdAtIso);
            const updated = asDisplayDate(entry.updatedAtIso);
            const subjectHtml = ctx.renderMarkdown(entry.subject);
            const bodyHtml = ctx.renderMarkdown(entry.body);
            const promptQuestionHtml = entry.promptQuestion ? ctx.renderMarkdown(entry.promptQuestion) : "";

            return (
              <details key={entry.id} className="journal-entry-accordion">
                <summary className="journal-entry-summary">
                  <strong>{entry.subject}</strong>
                </summary>
                <article className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
                  <MarkdownBlock html={subjectHtml} className="slap-markdown slap-markdown-title" />
                  <SlapInlineText>Mood: {entry.mood}</SlapInlineText>
                  <SlapInlineText>
                    Created: {created.date} at {created.time}
                  </SlapInlineText>
                  <SlapInlineText>
                    Updated: {updated.date} at {updated.time}
                  </SlapInlineText>
                  {entry.body ? <MarkdownBlock html={bodyHtml} /> : null}
                  {entry.promptQuestion ? (
                    <>
                      <SlapInlineText>Prompt</SlapInlineText>
                      <MarkdownBlock html={promptQuestionHtml} />
                    </>
                  ) : null}
                  <SlapActionButton title="Delete" onClick={() => void deleteEntry(entry.id)} />
                </article>
              </details>
            );
          })}
        </>
      ) : null}

      <div className="slap-button-row">
        <SlapActionButton title="Export journal.json" onClick={() => void exportJournal()} />
        <SlapActionButton title="Import journal.json" onClick={() => fileInputRef.current?.click()} />
        {legacyLockedDataDetected ? <SlapActionButton title="Reset Journal" onClick={() => void resetJournal()} /> : null}
      </div>
    </SlapApplicationShell>
  );
};

export const journalManifest: SlapApplicationManifest = {
  id: "journal",
  title: "Journal",
  author: "Joel",
  description: "Mood-aware journal with 700 optional prompts.",
  icon: "📓",
  Preview,
  Application: JournalApp
};
