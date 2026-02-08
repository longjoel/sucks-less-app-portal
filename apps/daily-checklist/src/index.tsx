import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import {
  SlapActionButton,
  SlapApplicationShell,
  SlapApplicationTitle,
  SlapInlineText,
  SlapTextInput
} from "@slap/ui";

type ChecklistItem = {
  id: string;
  text: string;
};

type DayChecklist = {
  checkedItemIds: string[];
};

type ChecklistData = {
  app: "slap-daily-checklist";
  version: 1;
  templateItems: ChecklistItem[];
  days: Record<string, DayChecklist>;
};

const STORAGE_PATH = "daily-checklist.json";

const DEFAULT_ITEMS: ChecklistItem[] = [
  { id: "water", text: "Drink water" },
  { id: "walk", text: "Take a short walk" },
  { id: "pause", text: "Take one mindful pause" }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Daily Checklist</strong>
    <p>Check off daily tasks and manage your list.</p>
  </article>
);

const todayKey = () => new Date().toISOString().slice(0, 10);

const isChecklistItem = (value: unknown): value is ChecklistItem => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && typeof candidate.text === "string";
};

const getInitialData = (): ChecklistData => ({
  app: "slap-daily-checklist",
  version: 1,
  templateItems: DEFAULT_ITEMS,
  days: {}
});

const normalizeData = (value: unknown): ChecklistData => {
  if (typeof value !== "object" || value === null) {
    return getInitialData();
  }

  const candidate = value as Record<string, unknown>;
  const templateItems = Array.isArray(candidate.templateItems)
    ? candidate.templateItems.filter(isChecklistItem).map((item) => ({ id: item.id, text: item.text.trim() })).filter((item) => item.text)
    : [];

  const normalizedTemplate = templateItems.length > 0 ? templateItems : DEFAULT_ITEMS;

  const daysRaw = typeof candidate.days === "object" && candidate.days !== null ? (candidate.days as Record<string, unknown>) : {};
  const normalizedDays: Record<string, DayChecklist> = {};

  for (const [dateKey, dayData] of Object.entries(daysRaw)) {
    if (typeof dayData !== "object" || dayData === null) {
      continue;
    }

    const checkedItemIdsRaw = (dayData as { checkedItemIds?: unknown }).checkedItemIds;
    const checkedItemIds = Array.isArray(checkedItemIdsRaw)
      ? checkedItemIdsRaw.filter((entry): entry is string => typeof entry === "string")
      : [];

    normalizedDays[dateKey] = { checkedItemIds };
  }

  return {
    app: "slap-daily-checklist",
    version: 1,
    templateItems: normalizedTemplate,
    days: normalizedDays
  };
};

const asDisplayDate = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return date.toLocaleDateString();
};

const shiftDateKey = (dateKey: string, deltaDays: number) => {
  const date = new Date(`${dateKey}T00:00:00`);
  date.setDate(date.getDate() + deltaDays);
  return date.toISOString().slice(0, 10);
};

const DailyChecklistApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [data, setData] = useState<ChecklistData>(getInitialData());
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [newItemText, setNewItemText] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTexts, setEditTexts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) {
        const initial = getInitialData();
        setData(initial);
        await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(initial, null, 2));
        return;
      }

      try {
        const parsed = JSON.parse(raw) as unknown;
        setData(normalizeData(parsed));
      } catch {
        setStatus("Checklist data was unreadable. Reset to defaults.");
        setData(getInitialData());
      }
    })();
  }, [ctx.vfs]);

  const persist = async (nextData: ChecklistData) => {
    setData(nextData);
    await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(nextData, null, 2));
  };

  const checkedSet = useMemo(() => {
    const day = data.days[selectedDateKey];
    return new Set(day?.checkedItemIds ?? []);
  }, [data.days, selectedDateKey]);

  const completion = useMemo(() => {
    const total = data.templateItems.length;
    const done = data.templateItems.filter((item) => checkedSet.has(item.id)).length;
    return { total, done, percent: total === 0 ? 0 : Math.round((done / total) * 100) };
  }, [data.templateItems, checkedSet]);

  const toggleItem = async (itemId: string) => {
    const day = data.days[selectedDateKey] ?? { checkedItemIds: [] };
    const nextChecked = new Set(day.checkedItemIds);

    if (nextChecked.has(itemId)) {
      nextChecked.delete(itemId);
    } else {
      nextChecked.add(itemId);
    }

    const nextData: ChecklistData = {
      ...data,
      days: {
        ...data.days,
        [selectedDateKey]: {
          checkedItemIds: [...nextChecked]
        }
      }
    };

    await persist(nextData);
  };

  const addItem = async () => {
    setStatus("");

    const text = newItemText.trim();
    if (!text) {
      setStatus("Enter item text first.");
      return;
    }

    const nextItem: ChecklistItem = {
      id: crypto.randomUUID(),
      text
    };

    const nextData: ChecklistData = {
      ...data,
      templateItems: [...data.templateItems, nextItem]
    };

    await persist(nextData);
    setNewItemText("");
    setStatus("Item added.");
  };

  const startEditMode = () => {
    const nextEditTexts: Record<string, string> = {};
    for (const item of data.templateItems) {
      nextEditTexts[item.id] = item.text;
    }
    setEditTexts(nextEditTexts);
    setIsEditMode(true);
  };

  const saveEditMode = async () => {
    setStatus("");

    const nextItems = data.templateItems
      .map((item) => ({
        ...item,
        text: (editTexts[item.id] ?? item.text).trim()
      }))
      .filter((item) => item.text.length > 0);

    if (nextItems.length === 0) {
      setStatus("At least one checklist item is required.");
      return;
    }

    const nextData: ChecklistData = {
      ...data,
      templateItems: nextItems
    };

    await persist(nextData);
    setEditTexts({});
    setIsEditMode(false);
    setStatus("Checklist updated.");
  };

  const cancelEditMode = () => {
    setEditTexts({});
    setIsEditMode(false);
    setStatus("");
  };

  const onItemTouchStart = (event: TouchEvent) => {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onItemTouchEnd = (event: TouchEvent, itemId: string) => {
    if (isEditMode || !touchStartRef.current) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    touchStartRef.current = null;

    if (Math.abs(deltaX) >= 48 && Math.abs(deltaY) <= 32) {
      void toggleItem(itemId);
      setStatus(deltaX > 0 ? "Checked via swipe." : "Unchecked via swipe.");
    }
  };

  const completionHistory = useMemo(() => {
    const history = Object.entries(data.days)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 7)
      .map(([dateKey, day]) => {
        const validIds = new Set(data.templateItems.map((item) => item.id));
        const done = day.checkedItemIds.filter((id) => validIds.has(id)).length;
        const total = data.templateItems.length;
        const percent = total === 0 ? 0 : Math.round((done / total) * 100);

        return { dateKey, done, total, percent };
      });

    return history;
  }, [data.days, data.templateItems]);

  const exportHistory = async () => {
    const raw = await ctx.vfs.readText(STORAGE_PATH);
    if (!raw) {
      setStatus("No checklist history to export yet.");
      return;
    }

    const blob = new Blob([raw], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `daily-checklist-history-${selectedDateKey}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    setStatus("Checklist history exported.");
  };

  return (
    <SlapApplicationShell title="Daily Checklist">
      <div className="slap-button-row">
        <SlapActionButton title="Prev Day" onClick={() => setSelectedDateKey((current) => shiftDateKey(current, -1))} />
        <SlapActionButton title="Today" onClick={() => setSelectedDateKey(todayKey())} />
        <SlapActionButton title="Next Day" onClick={() => setSelectedDateKey((current) => shiftDateKey(current, 1))} />
        <SlapActionButton title="Export History" onClick={() => void exportHistory()} />
        {!isEditMode ? (
          <SlapActionButton title="Edit Mode" onClick={startEditMode} />
        ) : (
          <>
            <SlapActionButton title="Save Edits" onClick={() => void saveEditMode()} />
            <SlapActionButton title="Cancel Edit" onClick={cancelEditMode} />
          </>
        )}
      </div>

      <SlapInlineText>Date: {asDisplayDate(selectedDateKey)}</SlapInlineText>
      <SlapInlineText>
        Progress: {completion.done}/{completion.total} ({completion.percent}%)
      </SlapInlineText>
      {!isEditMode ? <SlapInlineText>Swipe left/right on an item to toggle checked.</SlapInlineText> : null}
      {status ? <SlapInlineText>{status}</SlapInlineText> : null}

      {data.templateItems.length === 0 ? <SlapInlineText>No checklist items. Add one below.</SlapInlineText> : null}

      {data.templateItems.map((item) => (
        <article
          key={item.id}
          className="slap-shell"
          style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.5rem" }}
          onTouchStart={onItemTouchStart}
          onTouchEnd={(event) => onItemTouchEnd(event, item.id)}
        >
          {!isEditMode ? (
            <label style={{ display: "flex", gap: "0.55rem", alignItems: "center" }}>
              <input type="checkbox" checked={checkedSet.has(item.id)} onChange={() => void toggleItem(item.id)} />
              <span>{item.text}</span>
            </label>
          ) : (
            <SlapTextInput
              label="Edit Item"
              value={editTexts[item.id] ?? item.text}
              onChange={(value) => setEditTexts((current) => ({ ...current, [item.id]: value }))}
            />
          )}
        </article>
      ))}

      <section className="slap-shell" style={{ borderTop: "1px solid #c5b9a5", paddingTop: "0.6rem" }}>
        <SlapApplicationTitle title="Add Item" />
        <SlapTextInput label="New Item" value={newItemText} onChange={setNewItemText} />
        <SlapActionButton title="Add To List" onClick={() => void addItem()} />
      </section>

      <SlapApplicationTitle title="Recent Completion" />
      {completionHistory.length === 0 ? <SlapInlineText>No history yet.</SlapInlineText> : null}
      {completionHistory.map((entry) => (
        <SlapInlineText key={entry.dateKey}>
          {asDisplayDate(entry.dateKey)}: {entry.done}/{entry.total} ({entry.percent}%)
        </SlapInlineText>
      ))}
    </SlapApplicationShell>
  );
};

export const dailyChecklistManifest: SlapApplicationManifest = {
  id: "daily-checklist",
  title: "Daily Checklist",
  author: "Joel",
  description: "Daily checkoffs with editable checklist items.",
  icon: "✅",
  Preview,
  Application: DailyChecklistApp
};
