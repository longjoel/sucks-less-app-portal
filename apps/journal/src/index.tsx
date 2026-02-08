import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import {
  SlapActionButton,
  SlapApplicationShell,
  SlapApplicationTitle,
  SlapInlineText,
  SlapTextInput
} from "@slap/ui";

type JournalEntry = {
  id: string;
  createdAtIso: string;
  updatedAtIso: string;
  subject: string;
  body: string;
};

type JournalPlain = {
  app: "slap-journal";
  version: 1;
  encrypted: false;
  entries: JournalEntry[];
};

type JournalEncrypted = {
  app: "slap-journal";
  version: 1;
  encrypted: true;
  kdf: {
    iterations: number;
    saltB64: string;
  };
  cipher: {
    ivB64: string;
    dataB64: string;
  };
};

const JOURNAL_PATH = "journal.json";
const KDF_ITERATIONS = 250000;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Journal</strong>
    <p>Notes with optional password encryption.</p>
  </article>
);

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const deriveAesKey = async (password: string, salt: Uint8Array, iterations: number) => {
  const keyMaterial = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, [
    "deriveKey"
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
};

const encryptEntries = async (entries: JournalEntry[], password: string): Promise<JournalEncrypted> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt, KDF_ITERATIONS);
  const plainText = textEncoder.encode(JSON.stringify(entries));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plainText);

  return {
    app: "slap-journal",
    version: 1,
    encrypted: true,
    kdf: {
      iterations: KDF_ITERATIONS,
      saltB64: toBase64(salt)
    },
    cipher: {
      ivB64: toBase64(iv),
      dataB64: toBase64(new Uint8Array(encrypted))
    }
  };
};

const decryptEntries = async (encrypted: JournalEncrypted, password: string): Promise<JournalEntry[]> => {
  const salt = fromBase64(encrypted.kdf.saltB64);
  const iv = fromBase64(encrypted.cipher.ivB64);
  const cipherBytes = fromBase64(encrypted.cipher.dataB64);
  const key = await deriveAesKey(password, salt, encrypted.kdf.iterations);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipherBytes)
  );
  const decoded = textDecoder.decode(plainBuffer);
  const parsed = JSON.parse(decoded) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Decrypted data is invalid.");
  }

  return parsed.filter(isJournalEntry);
};

const isJournalEntry = (value: unknown): value is JournalEntry => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.createdAtIso === "string" &&
    typeof candidate.updatedAtIso === "string" &&
    typeof candidate.subject === "string" &&
    typeof candidate.body === "string"
  );
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

const isJournalEncrypted = (value: unknown): value is JournalEncrypted => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.app !== "slap-journal" || candidate.version !== 1 || candidate.encrypted !== true) {
    return false;
  }

  const kdf = candidate.kdf as Record<string, unknown> | undefined;
  const cipher = candidate.cipher as Record<string, unknown> | undefined;

  return (
    !!kdf &&
    typeof kdf.iterations === "number" &&
    typeof kdf.saltB64 === "string" &&
    !!cipher &&
    typeof cipher.ivB64 === "string" &&
    typeof cipher.dataB64 === "string"
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

const JournalApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isEncrypted, setIsEncrypted] = useState(false);
  const [encryptedBlob, setEncryptedBlob] = useState<JournalEncrypted | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(true);
  const [sessionPassword, setSessionPassword] = useState("");
  const [unlockPassword, setUnlockPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => b.createdAtIso.localeCompare(a.createdAtIso)),
    [entries]
  );

  const writeDoc = async (doc: JournalPlain | JournalEncrypted) => {
    await ctx.vfs.writeText(JOURNAL_PATH, JSON.stringify(doc, null, 2));
  };

  const loadFromDisk = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const raw = await ctx.vfs.readText(JOURNAL_PATH);
      if (!raw) {
        setIsEncrypted(false);
        setEncryptedBlob(null);
        setIsUnlocked(true);
        setEntries([]);
        await writeDoc(toPlainDocument([]));
        return;
      }

      const parsed = JSON.parse(raw) as unknown;
      if (isJournalPlain(parsed)) {
        setIsEncrypted(false);
        setEncryptedBlob(null);
        setIsUnlocked(true);
        setSessionPassword("");
        setEntries(parsed.entries.filter(isJournalEntry));
        return;
      }

      if (isJournalEncrypted(parsed)) {
        setIsEncrypted(true);
        setEncryptedBlob(parsed);
        setIsUnlocked(false);
        setSessionPassword("");
        setEntries([]);
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

  const persistEntries = async (nextEntries: JournalEntry[]) => {
    if (!isEncrypted) {
      await writeDoc(toPlainDocument(nextEntries));
      setEntries(nextEntries);
      return;
    }

    if (!isUnlocked || !sessionPassword) {
      throw new Error("Unlock journal before saving changes.");
    }

    const nextBlob = await encryptEntries(nextEntries, sessionPassword);
    await writeDoc(nextBlob);
    setEncryptedBlob(nextBlob);
    setEntries(nextEntries);
  };

  const addEntry = async () => {
    setError(null);

    if (!subject.trim()) {
      setError("Subject is required.");
      return;
    }

    const now = new Date().toISOString();
    const nextEntry: JournalEntry = {
      id: crypto.randomUUID(),
      createdAtIso: now,
      updatedAtIso: now,
      subject: subject.trim(),
      body: body.trim()
    };

    try {
      const next = [nextEntry, ...entries];
      await persistEntries(next);
      setSubject("");
      setBody("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save journal entry.");
    }
  };

  const deleteEntry = async (id: string) => {
    setError(null);

    try {
      const next = entries.filter((entry) => entry.id !== id);
      await persistEntries(next);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to delete entry.");
    }
  };

  const enableEncryption = async () => {
    setError(null);

    if (!newPassword || newPassword !== confirmPassword) {
      setError("Passwords must match.");
      return;
    }

    try {
      const encrypted = await encryptEntries(entries, newPassword);
      await writeDoc(encrypted);
      setIsEncrypted(true);
      setEncryptedBlob(encrypted);
      setIsUnlocked(true);
      setSessionPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
    } catch (encryptError) {
      setError(encryptError instanceof Error ? encryptError.message : "Failed to enable encryption.");
    }
  };

  const unlock = async () => {
    setError(null);

    if (!encryptedBlob) {
      setError("No encrypted journal found.");
      return;
    }

    try {
      const decrypted = await decryptEntries(encryptedBlob, unlockPassword);
      setEntries(decrypted);
      setSessionPassword(unlockPassword);
      setUnlockPassword("");
      setIsUnlocked(true);
    } catch {
      setError("Incorrect password or corrupted encrypted journal.");
    }
  };

  const lock = () => {
    setIsUnlocked(false);
    setEntries([]);
    setSessionPassword("");
    setError(null);
  };

  const disableEncryption = async () => {
    setError(null);

    if (!isUnlocked) {
      setError("Unlock before disabling encryption.");
      return;
    }

    try {
      await writeDoc(toPlainDocument(entries));
      setIsEncrypted(false);
      setEncryptedBlob(null);
      setIsUnlocked(true);
      setSessionPassword("");
    } catch (decryptError) {
      setError(decryptError instanceof Error ? decryptError.message : "Failed to disable encryption.");
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

    if (isJournalPlain(parsed)) {
      const sanitized: JournalPlain = {
        ...parsed,
        entries: parsed.entries.filter(isJournalEntry)
      };
      await writeDoc(sanitized);
      setIsEncrypted(false);
      setEncryptedBlob(null);
      setIsUnlocked(true);
      setSessionPassword("");
      setEntries(sanitized.entries);
      return;
    }

    if (isJournalEncrypted(parsed)) {
      await writeDoc(parsed);
      setIsEncrypted(true);
      setEncryptedBlob(parsed);
      setIsUnlocked(false);
      setSessionPassword("");
      setEntries([]);
      return;
    }

    throw new Error("Unsupported journal.json format.");
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

  const encryptionSummary = isEncrypted
    ? isUnlocked
      ? "Encryption is enabled and journal is unlocked."
      : "Encryption is enabled. Unlock required to view entries."
    : "Encryption is disabled.";

  return (
    <SlapApplicationShell title="Journal">
      <SlapApplicationTitle title="Private Journal" />

      {isLoading ? <SlapInlineText>Loading journal...</SlapInlineText> : null}
      {!isLoading ? <SlapInlineText>{encryptionSummary}</SlapInlineText> : null}
      {error ? <SlapInlineText>Error: {error}</SlapInlineText> : null}

      <div className="slap-button-row">
        <SlapActionButton title="Export journal.json" onClick={() => void exportJournal()} />
        <SlapActionButton title="Import journal.json" onClick={() => fileInputRef.current?.click()} />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => void onImportPicked(event)}
        style={{ display: "none" }}
      />

      {!isLoading && isEncrypted && !isUnlocked ? (
        <>
          <SlapTextInput
            label="Unlock Password"
            value={unlockPassword}
            onChange={setUnlockPassword}
            type="password"
          />
          <SlapActionButton title="Unlock Journal" onClick={() => void unlock()} />
        </>
      ) : null}

      {!isLoading && !isEncrypted ? (
        <>
          <SlapTextInput label="New Password" value={newPassword} onChange={setNewPassword} type="password" />
          <SlapTextInput
            label="Confirm Password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            type="password"
          />
          <SlapActionButton title="Enable Encryption" onClick={() => void enableEncryption()} />
        </>
      ) : null}

      {!isLoading && isEncrypted && isUnlocked ? (
        <div className="slap-button-row">
          <SlapActionButton title="Lock" onClick={lock} />
          <SlapActionButton title="Disable Encryption" onClick={() => void disableEncryption()} />
        </div>
      ) : null}

      {!isLoading && (!isEncrypted || isUnlocked) ? (
        <>
          <SlapTextInput label="Subject" value={subject} onChange={setSubject} />
          <label className="slap-input-wrap">
            <span>More</span>
            <textarea
              className="slap-input"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>
          <SlapActionButton title="Save Entry" onClick={() => void addEntry()} />

          {sortedEntries.length === 0 ? <SlapInlineText>No entries yet.</SlapInlineText> : null}

          {sortedEntries.map((entry) => {
            const created = asDisplayDate(entry.createdAtIso);
            const updated = asDisplayDate(entry.updatedAtIso);
            return (
              <article key={entry.id} className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
                <SlapApplicationTitle title={entry.subject} />
                <SlapInlineText>
                  Created: {created.date} at {created.time}
                </SlapInlineText>
                <SlapInlineText>
                  Updated: {updated.date} at {updated.time}
                </SlapInlineText>
                <SlapInlineText>{entry.body || "(No additional notes)"}</SlapInlineText>
                <SlapActionButton title="Delete" onClick={() => void deleteEntry(entry.id)} />
              </article>
            );
          })}
        </>
      ) : null}
    </SlapApplicationShell>
  );
};

export const journalManifest: SlapApplicationManifest = {
  id: "journal",
  title: "Journal",
  author: "Joel",
  description: "Password-protected journal with import/export.",
  icon: "📓",
  Preview,
  Application: JournalApp
};
