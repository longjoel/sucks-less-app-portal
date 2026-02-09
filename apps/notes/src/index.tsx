import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type Note = {
  id: string;
  title: string;
  body: string;
  createdAtIso: string;
  updatedAtIso: string;
};

type NotesDocument = {
  app: "slap-notes";
  version: 1;
  notes: Note[];
};

const STORAGE_PATH = "notes.json";

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Notes</strong>
    <p>Accordion notes you can update, append, clone, and delete.</p>
  </article>
);

const normalizeNote = (value: unknown): Note | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.body !== "string" ||
    typeof candidate.createdAtIso !== "string" ||
    typeof candidate.updatedAtIso !== "string"
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    body: candidate.body,
    createdAtIso: candidate.createdAtIso,
    updatedAtIso: candidate.updatedAtIso
  };
};

const isNotesDocument = (value: unknown): value is NotesDocument => {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.app === "slap-notes" && candidate.version === 1 && Array.isArray(candidate.notes);
};

const toDocument = (notes: Note[]): NotesDocument => ({
  app: "slap-notes",
  version: 1,
  notes
});

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
};

const syncMap = (current: Record<string, string>, notes: Note[], fallback: (note: Note) => string) => {
  const next: Record<string, string> = {};
  for (const note of notes) {
    next[note.id] = current[note.id] ?? fallback(note);
  }
  return next;
};

const NotesApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [editTitles, setEditTitles] = useState<Record<string, string>>({});
  const [editBodies, setEditBodies] = useState<Record<string, string>>({});
  const [appendBodies, setAppendBodies] = useState<Record<string, string>>({});

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso)),
    [notes]
  );

  const persistNotes = async (next: Note[]) => {
    await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument(next), null, 2));
    setNotes(next);
  };

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument([]), null, 2));
        setNotes([]);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        if (isNotesDocument(parsed)) {
          setNotes(parsed.notes.map(normalizeNote).filter((note): note is Note => note !== null));
          return;
        }
      } catch {
        setStatus("Saved data was unreadable. Starting fresh.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    setEditTitles((current) => syncMap(current, notes, (note) => note.title));
    setEditBodies((current) => syncMap(current, notes, (note) => note.body));
    setAppendBodies((current) => syncMap(current, notes, () => ""));
  }, [notes]);

  const createNote = async () => {
    const title = draftTitle.trim() || "Untitled Note";
    const body = draftBody.trim();
    const now = new Date().toISOString();
    const next: Note = {
      id: crypto.randomUUID(),
      title,
      body,
      createdAtIso: now,
      updatedAtIso: now
    };
    await persistNotes([next, ...notes]);
    setDraftTitle("");
    setDraftBody("");
    setStatus(`Created "${title}".`);
  };

  const renameNote = async (note: Note) => {
    const title = (editTitles[note.id] ?? note.title).trim() || "Untitled Note";
    const next = notes.map((entry) =>
      entry.id === note.id ? { ...entry, title, updatedAtIso: new Date().toISOString() } : entry
    );
    await persistNotes(next);
    setStatus(`Renamed to "${title}".`);
  };

  const updateNote = async (note: Note) => {
    const body = editBodies[note.id] ?? note.body;
    const next = notes.map((entry) =>
      entry.id === note.id ? { ...entry, body, updatedAtIso: new Date().toISOString() } : entry
    );
    await persistNotes(next);
    setStatus(`Updated "${note.title}".`);
  };

  const appendNote = async (note: Note) => {
    const addition = (appendBodies[note.id] ?? "").trim();
    if (!addition) return;
    const separator = note.body.trim() ? "\n\n" : "";
    const body = `${note.body}${separator}${addition}`;
    const next = notes.map((entry) =>
      entry.id === note.id ? { ...entry, body, updatedAtIso: new Date().toISOString() } : entry
    );
    await persistNotes(next);
    setAppendBodies((current) => ({ ...current, [note.id]: "" }));
    setEditBodies((current) => ({ ...current, [note.id]: body }));
    setStatus(`Added to "${note.title}".`);
  };

  const cloneNote = async (note: Note) => {
    const now = new Date().toISOString();
    const clone: Note = {
      id: crypto.randomUUID(),
      title: `Copy of ${note.title}`,
      body: note.body,
      createdAtIso: now,
      updatedAtIso: now
    };
    await persistNotes([clone, ...notes]);
    setStatus(`Cloned "${note.title}".`);
  };

  const deleteNote = async (note: Note) => {
    await persistNotes(notes.filter((entry) => entry.id !== note.id));
    setStatus(`Deleted "${note.title}".`);
  };

  return (
    <SlapApplicationShell title="Notes">
      <SlapApplicationTitle title="Notes" />
      <SlapInlineText>Create, update, append to, clone, and delete notes.</SlapInlineText>
      {status ? <p className="status-line">{status}</p> : null}

      <section className="notes-create">
        <label className="slap-input-wrap">
          <span>New note title</span>
          <input
            className="slap-input"
            type="text"
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            placeholder="Untitled Note"
          />
        </label>
        <label className="slap-input-wrap">
          <span>New note body</span>
          <textarea
            className="slap-input notes-textarea"
            rows={4}
            value={draftBody}
            onChange={(event) => setDraftBody(event.target.value)}
            placeholder="Write something..."
          />
        </label>
        <div className="slap-button-row">
          <SlapActionButton title="Create Note" onClick={() => void createNote()} />
        </div>
      </section>

      <section className="notes-list">
        {sortedNotes.length === 0 ? <SlapInlineText>No notes yet.</SlapInlineText> : null}
        {sortedNotes.map((note) => (
          <details key={note.id} className="journal-entry-accordion notes-accordion">
            <summary className="journal-entry-summary">
              <strong>{note.title || "Untitled Note"}</strong>
              <span className="note-meta">Updated {formatDate(note.updatedAtIso)}</span>
            </summary>
            <div className="notes-card">
              <label className="slap-input-wrap">
                <span>Title</span>
                <input
                  className="slap-input"
                  type="text"
                  value={editTitles[note.id] ?? ""}
                  onChange={(event) =>
                    setEditTitles((current) => ({ ...current, [note.id]: event.target.value }))
                  }
                />
              </label>
              <div className="notes-actions">
                <SlapActionButton title="Rename" onClick={() => void renameNote(note)} />
                <SlapActionButton title="Clone" onClick={() => void cloneNote(note)} />
                <SlapActionButton title="Delete" onClick={() => void deleteNote(note)} />
              </div>

              <label className="slap-input-wrap">
                <span>Body</span>
                <textarea
                  className="slap-input notes-textarea"
                  rows={6}
                  value={editBodies[note.id] ?? ""}
                  onChange={(event) =>
                    setEditBodies((current) => ({ ...current, [note.id]: event.target.value }))
                  }
                />
              </label>
              <div className="notes-actions">
                <SlapActionButton title="Update Body" onClick={() => void updateNote(note)} />
              </div>

              <label className="slap-input-wrap">
                <span>Add to this note</span>
                <textarea
                  className="slap-input notes-textarea notes-append"
                  rows={3}
                  value={appendBodies[note.id] ?? ""}
                  onChange={(event) =>
                    setAppendBodies((current) => ({ ...current, [note.id]: event.target.value }))
                  }
                  placeholder="Append a new thought..."
                />
              </label>
              <div className="notes-actions">
                <SlapActionButton title="Add to Note" onClick={() => void appendNote(note)} />
              </div>
            </div>
          </details>
        ))}
      </section>
    </SlapApplicationShell>
  );
};

export const notesManifest: SlapApplicationManifest = {
  id: "notes",
  title: "Notes",
  author: "Joel",
  description: "Accordion notes you can update, append, clone, and delete.",
  icon: "🗒️",
  Preview,
  Application: NotesApp
};
