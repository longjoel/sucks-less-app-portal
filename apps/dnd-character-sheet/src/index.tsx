import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapApplicationShell, SlapApplicationTitle, SlapInlineText } from "@slap/ui";

type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

type AbilityScores = Record<AbilityKey, number>;

type Character = {
  id: string;
  name: string;
  className: string;
  level: number;
  background: string;
  race: string;
  alignment: string;
  playerName: string;
  campaign: string;
  xp: number;
  inspiration: boolean;
  proficiencyBonus: number;
  abilities: AbilityScores;
  savingThrows: Record<AbilityKey, boolean>;
  skills: Record<string, boolean>;
  armorClass: number;
  initiative: number;
  speed: number;
  hpMax: number;
  hpCurrent: number;
  hpTemp: number;
  hitDice: string;
  deathSaves: { success: number; failure: number };
  attacks: string;
  equipment: string;
  features: string;
  spells: string;
  notes: string;
  createdAtIso: string;
  updatedAtIso: string;
};

type DndDocument = {
  app: "slap-dnd-sheet";
  version: 1;
  characters: Character[];
  activeId?: string;
};

type SkillDef = {
  key: string;
  label: string;
  ability: AbilityKey;
};

const STORAGE_PATH = "dnd-character-sheets.json";

const ABILITY_KEYS: AbilityKey[] = ["str", "dex", "con", "int", "wis", "cha"];

const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma"
};

const ABILITY_SHORT: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA"
};

const SKILLS: SkillDef[] = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animal-handling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleight-of-hand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>D&D Character Sheet</strong>
    <p>Keep multiple character sheets organized and ready for game night.</p>
  </article>
);

const getCharacterIdFromHash = () => {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "");
  if (!raw) return null;
  if (raw.startsWith("character=")) {
    return decodeURIComponent(raw.slice("character=".length));
  }
  if (raw.startsWith("character/")) {
    return decodeURIComponent(raw.slice("character/".length));
  }
  return null;
};

const setCharacterHash = (id: string | null) => {
  if (typeof window === "undefined") return;
  const nextHash = id ? `#character=${encodeURIComponent(id)}` : "";
  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`;
  window.history.replaceState(null, "", nextUrl);
};

const toInt = (value: string, fallback = 0) => {
  const next = Number.parseInt(value, 10);
  return Number.isFinite(next) ? next : fallback;
};

const clampScore = (value: number) => Math.max(1, Math.min(30, Math.floor(value)));

const formatMod = (value: number) => (value >= 0 ? `+${value}` : `${value}`);

const abilityMod = (score: number) => Math.floor((score - 10) / 2);

const createBooleanMap = (keys: string[]) =>
  keys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = false;
    return acc;
  }, {});

const defaultAbilities = (): AbilityScores => ({
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10
});

const defaultSavingThrows = (): Record<AbilityKey, boolean> => ({
  str: false,
  dex: false,
  con: false,
  int: false,
  wis: false,
  cha: false
});

const defaultSkills = () => createBooleanMap(SKILLS.map((skill) => skill.key));

const createDefaultCharacter = (overrides: Partial<Character> = {}): Character => {
  const now = new Date().toISOString();
  const base: Character = {
    id: crypto.randomUUID(),
    name: "New Adventurer",
    className: "Fighter",
    level: 1,
    background: "",
    race: "",
    alignment: "",
    playerName: "",
    campaign: "",
    xp: 0,
    inspiration: false,
    proficiencyBonus: 2,
    abilities: defaultAbilities(),
    savingThrows: defaultSavingThrows(),
    skills: defaultSkills(),
    armorClass: 10,
    initiative: 0,
    speed: 30,
    hpMax: 10,
    hpCurrent: 10,
    hpTemp: 0,
    hitDice: "1d10",
    deathSaves: { success: 0, failure: 0 },
    attacks: "",
    equipment: "",
    features: "",
    spells: "",
    notes: "",
    createdAtIso: now,
    updatedAtIso: now
  };

  return {
    ...base,
    ...overrides,
    abilities: { ...base.abilities, ...(overrides.abilities ?? {}) },
    savingThrows: { ...base.savingThrows, ...(overrides.savingThrows ?? {}) },
    skills: { ...base.skills, ...(overrides.skills ?? {}) },
    deathSaves: { ...base.deathSaves, ...(overrides.deathSaves ?? {}) }
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeAbilities = (value: unknown, fallback: AbilityScores) => {
  if (!isRecord(value)) return { ...fallback };
  const next: AbilityScores = { ...fallback };
  for (const key of ABILITY_KEYS) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) {
      next[key] = clampScore(raw);
    }
  }
  return next;
};

const normalizeSavingThrows = (value: unknown, fallback: Record<AbilityKey, boolean>) => {
  if (!isRecord(value)) return { ...fallback };
  const next = { ...fallback };
  for (const key of ABILITY_KEYS) {
    const raw = value[key];
    if (typeof raw === "boolean") next[key] = raw;
  }
  return next;
};

const normalizeSkills = (value: unknown, fallback: Record<string, boolean>) => {
  if (!isRecord(value)) return { ...fallback };
  const next = { ...fallback };
  for (const skill of SKILLS) {
    const raw = value[skill.key];
    if (typeof raw === "boolean") next[skill.key] = raw;
  }
  return next;
};

const normalizeCharacter = (value: unknown): Character | null => {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string") return null;
  const base = createDefaultCharacter({ id: value.id });

  const next: Character = {
    ...base,
    name: typeof value.name === "string" ? value.name : base.name,
    className: typeof value.className === "string" ? value.className : base.className,
    level: typeof value.level === "number" ? Math.max(1, Math.floor(value.level)) : base.level,
    background: typeof value.background === "string" ? value.background : base.background,
    race: typeof value.race === "string" ? value.race : base.race,
    alignment: typeof value.alignment === "string" ? value.alignment : base.alignment,
    playerName: typeof value.playerName === "string" ? value.playerName : base.playerName,
    campaign: typeof value.campaign === "string" ? value.campaign : base.campaign,
    xp: typeof value.xp === "number" ? Math.max(0, Math.floor(value.xp)) : base.xp,
    inspiration: typeof value.inspiration === "boolean" ? value.inspiration : base.inspiration,
    proficiencyBonus:
      typeof value.proficiencyBonus === "number" ? Math.max(0, Math.floor(value.proficiencyBonus)) : base.proficiencyBonus,
    abilities: normalizeAbilities(value.abilities, base.abilities),
    savingThrows: normalizeSavingThrows(value.savingThrows, base.savingThrows),
    skills: normalizeSkills(value.skills, base.skills),
    armorClass: typeof value.armorClass === "number" ? Math.max(0, Math.floor(value.armorClass)) : base.armorClass,
    initiative: typeof value.initiative === "number" ? Math.floor(value.initiative) : base.initiative,
    speed: typeof value.speed === "number" ? Math.max(0, Math.floor(value.speed)) : base.speed,
    hpMax: typeof value.hpMax === "number" ? Math.max(0, Math.floor(value.hpMax)) : base.hpMax,
    hpCurrent: typeof value.hpCurrent === "number" ? Math.max(0, Math.floor(value.hpCurrent)) : base.hpCurrent,
    hpTemp: typeof value.hpTemp === "number" ? Math.max(0, Math.floor(value.hpTemp)) : base.hpTemp,
    hitDice: typeof value.hitDice === "string" ? value.hitDice : base.hitDice,
    deathSaves: {
      success:
        isRecord(value.deathSaves) && typeof value.deathSaves.success === "number"
          ? Math.max(0, Math.min(3, Math.floor(value.deathSaves.success)))
          : base.deathSaves.success,
      failure:
        isRecord(value.deathSaves) && typeof value.deathSaves.failure === "number"
          ? Math.max(0, Math.min(3, Math.floor(value.deathSaves.failure)))
          : base.deathSaves.failure
    },
    attacks: typeof value.attacks === "string" ? value.attacks : base.attacks,
    equipment: typeof value.equipment === "string" ? value.equipment : base.equipment,
    features: typeof value.features === "string" ? value.features : base.features,
    spells: typeof value.spells === "string" ? value.spells : base.spells,
    notes: typeof value.notes === "string" ? value.notes : base.notes,
    createdAtIso: typeof value.createdAtIso === "string" ? value.createdAtIso : base.createdAtIso,
    updatedAtIso: typeof value.updatedAtIso === "string" ? value.updatedAtIso : base.updatedAtIso
  };

  return next;
};

const formatTimestamp = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString();
};

const toDocument = (characters: Character[], activeId: string | null): DndDocument => ({
  app: "slap-dnd-sheet",
  version: 1,
  characters,
  activeId: activeId ?? undefined
});

const parseDocument = (raw: string): { characters: Character[]; activeId: string | null } | null => {
  const parsed = JSON.parse(raw) as unknown;
  let charactersRaw: unknown;
  let activeIdRaw: unknown;

  if (Array.isArray(parsed)) {
    charactersRaw = parsed;
  } else if (isRecord(parsed)) {
    if ("version" in parsed && parsed.version !== 1) return null;
    charactersRaw = parsed.characters;
    activeIdRaw = parsed.activeId;
  } else {
    return null;
  }

  if (!Array.isArray(charactersRaw)) return null;

  const normalized = charactersRaw
    .map((entry) => normalizeCharacter(entry))
    .filter((entry): entry is Character => entry !== null);

  const activeId = typeof activeIdRaw === "string" ? activeIdRaw : null;

  return { characters: normalized, activeId };
};

const LEGACY_STORAGE_KEYS = ["slap:v1:slap-dnd-sheet:dnd-character-sheets.json"];

const readLegacyRaw = () => {
  if (typeof window === "undefined") return null;
  try {
    if (!window.localStorage) return null;
    for (const key of LEGACY_STORAGE_KEYS) {
      const raw = window.localStorage.getItem(key);
      if (raw) return raw;
    }
  } catch {
    return null;
  }
  return null;
};

const DndCharacterSheetApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftClass, setDraftClass] = useState("");
  const [draftLevel, setDraftLevel] = useState("1");

  useEffect(() => {
    let isActive = true;
    void (async () => {
      try {
        const raw = await ctx.vfs.readText(STORAGE_PATH);
        const legacyRaw = !raw ? readLegacyRaw() : null;
        const payload = raw ?? legacyRaw;
        if (!payload) {
          if (!isActive) return;
          setCharacters([]);
          setActiveId(null);
          return;
        }

        const parsed = parseDocument(payload);
        if (!parsed) {
          throw new Error("Invalid document");
        }

        if (!isActive) return;
        setCharacters(parsed.characters);
        const hashActive = getCharacterIdFromHash();
        const hashMatch =
          hashActive && parsed.characters.some((character) => character.id === hashActive) ? hashActive : null;
        const storedMatch =
          parsed.activeId && parsed.characters.some((character) => character.id === parsed.activeId)
            ? parsed.activeId
            : null;
        const nextActive = hashMatch ?? storedMatch ?? parsed.characters[0]?.id ?? null;
        setActiveId(nextActive);
        if (nextActive) setCharacterHash(nextActive);

        if (legacyRaw) {
          await ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument(parsed.characters, nextActive), null, 2));
        }
      } catch {
        if (!isActive) return;
        setStatus("Saved data was invalid. Starting fresh.");
        setCharacters([]);
        setActiveId(null);
      } finally {
        if (isActive) setHasLoaded(true);
      }
    })();
    return () => {
      isActive = false;
    };
  }, [ctx.vfs]);

  useEffect(() => {
    if (!hasLoaded) return;
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(toDocument(characters, activeId), null, 2));
  }, [ctx.vfs, characters, activeId, hasLoaded]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const hashId = getCharacterIdFromHash();
      if (!hashId) return;
      if (characters.some((character) => character.id === hashId)) {
        setActiveId(hashId);
      }
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [characters]);

  useEffect(() => {
    if (characters.length === 0) {
      setActiveId(null);
      setCharacterHash(null);
      return;
    }

    const hashId = getCharacterIdFromHash();
    if (hashId && characters.some((character) => character.id === hashId)) {
      if (activeId !== hashId) setActiveId(hashId);
      return;
    }

    if (activeId && characters.some((character) => character.id === activeId)) {
      setCharacterHash(activeId);
      return;
    }

    const fallback = characters[0].id;
    setActiveId(fallback);
    setCharacterHash(fallback);
  }, [activeId, characters]);

  const activeCharacter = useMemo(
    () => characters.find((character) => character.id === activeId) ?? null,
    [characters, activeId]
  );

  const createCharacter = () => {
    const name = draftName.trim() || "New Adventurer";
    const className = draftClass.trim() || "Fighter";
    const level = Math.max(1, toInt(draftLevel, 1));
    const character = createDefaultCharacter({ name, className, level });
    setCharacters((current) => [character, ...current]);
    setActiveId(character.id);
    setCharacterHash(character.id);
    setDraftName("");
    setDraftClass("");
    setDraftLevel("1");
    setStatus(`Created ${name}.`);
  };

  const cloneCharacter = (character: Character) => {
    const clone = createDefaultCharacter({
      ...character,
      id: crypto.randomUUID(),
      name: `Copy of ${character.name}`,
      createdAtIso: new Date().toISOString(),
      updatedAtIso: new Date().toISOString()
    });
    setCharacters((current) => [clone, ...current]);
    setActiveId(clone.id);
    setCharacterHash(clone.id);
    setStatus(`Cloned ${character.name}.`);
  };

  const deleteCharacter = (character: Character) => {
    setCharacters((current) => current.filter((entry) => entry.id !== character.id));
    setStatus(`Deleted ${character.name}.`);
  };

  const selectCharacter = (id: string) => {
    setActiveId(id);
    setCharacterHash(id);
  };

  const updateCharacter = (id: string, updater: (character: Character) => Character) => {
    setCharacters((current) =>
      current.map((character) =>
        character.id === id
          ? {
              ...updater(character),
              updatedAtIso: new Date().toISOString()
            }
          : character
      )
    );
  };

  const updateField = (field: keyof Character, value: string | number | boolean) => {
    if (!activeCharacter) return;
    updateCharacter(activeCharacter.id, (character) => ({ ...character, [field]: value }));
  };

  const updateAbility = (ability: AbilityKey, value: number) => {
    if (!activeCharacter) return;
    updateCharacter(activeCharacter.id, (character) => ({
      ...character,
      abilities: { ...character.abilities, [ability]: clampScore(value) }
    }));
  };

  const updateSavingThrow = (ability: AbilityKey, value: boolean) => {
    if (!activeCharacter) return;
    updateCharacter(activeCharacter.id, (character) => ({
      ...character,
      savingThrows: { ...character.savingThrows, [ability]: value }
    }));
  };

  const updateSkill = (skillKey: string, value: boolean) => {
    if (!activeCharacter) return;
    updateCharacter(activeCharacter.id, (character) => ({
      ...character,
      skills: { ...character.skills, [skillKey]: value }
    }));
  };

  const updateDeathSave = (type: "success" | "failure", index: number) => {
    if (!activeCharacter) return;
    updateCharacter(activeCharacter.id, (character) => {
      const currentValue = character.deathSaves[type];
      const nextValue = index <= currentValue ? index - 1 : index;
      return {
        ...character,
        deathSaves: { ...character.deathSaves, [type]: Math.max(0, Math.min(3, nextValue)) }
      };
    });
  };

  const passivePerception = useMemo(() => {
    if (!activeCharacter) return 10;
    const wisdomMod = abilityMod(activeCharacter.abilities.wis);
    const proficient = activeCharacter.skills["perception"];
    return 10 + wisdomMod + (proficient ? activeCharacter.proficiencyBonus : 0);
  }, [activeCharacter]);

  return (
    <SlapApplicationShell title="D&D Character Sheet">
      <SlapApplicationTitle title="D&D Character Sheet" />
      <SlapInlineText>Manage multiple character sheets across campaigns.</SlapInlineText>
      {status ? <p className="status-line">{status}</p> : null}

      <details className="dnd-section" open>
        <summary className="dnd-section-summary">
          <strong>Characters</strong>
          <span className="dnd-pill">{characters.length}</span>
        </summary>
        <div className="dnd-section-actions">
          <SlapActionButton title="New Character" onClick={createCharacter} />
        </div>
        <div className="dnd-grid-2">
          <label className="slap-input-wrap">
            <span>Name</span>
            <input
              className="slap-input"
              type="text"
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Elowen"
            />
          </label>
          <label className="slap-input-wrap">
            <span>Class</span>
            <input
              className="slap-input"
              type="text"
              value={draftClass}
              onChange={(event) => setDraftClass(event.target.value)}
              placeholder="Rogue"
            />
          </label>
          <label className="slap-input-wrap">
            <span>Level</span>
            <input
              className="slap-input"
              type="number"
              min={1}
              max={20}
              value={draftLevel}
              onChange={(event) => setDraftLevel(event.target.value)}
            />
          </label>
        </div>
        <div className="dnd-character-list">
          {characters.map((character) => (
            <article
              key={character.id}
              className={`dnd-character-card${character.id === activeId ? " is-active" : ""}`}
            >
              <button
                type="button"
                className="dnd-character-select"
                onClick={() => selectCharacter(character.id)}
              >
                <strong>{character.name}</strong>
                <span>
                  {character.className} {character.level} {character.race ? `• ${character.race}` : ""}
                </span>
                <span className="dnd-character-meta">Updated {formatTimestamp(character.updatedAtIso)}</span>
              </button>
              <div className="dnd-character-actions">
                <button type="button" className="dnd-mini-button" onClick={() => cloneCharacter(character)}>
                  Clone
                </button>
                <button type="button" className="dnd-mini-button" onClick={() => deleteCharacter(character)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
          {characters.length === 0 ? (
            <p className="status-line">No characters yet. Create one above.</p>
          ) : null}
        </div>
      </details>

      {!activeCharacter ? null : (
        <section className="dnd-sheet">
          <details className="dnd-section" open>
            <summary className="dnd-section-summary">
              <strong>Basics</strong>
              <span className="dnd-pill">Active</span>
            </summary>
            <div className="dnd-grid-2">
              <label className="slap-input-wrap">
                <span>Name</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.name}
                  onChange={(event) => updateField("name", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Player</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.playerName}
                  onChange={(event) => updateField("playerName", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Class</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.className}
                  onChange={(event) => updateField("className", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Level</span>
                <input
                  className="slap-input"
                  type="number"
                  min={1}
                  max={20}
                  value={activeCharacter.level}
                  onChange={(event) => updateField("level", Math.max(1, toInt(event.target.value, 1)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Race</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.race}
                  onChange={(event) => updateField("race", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Background</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.background}
                  onChange={(event) => updateField("background", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Alignment</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.alignment}
                  onChange={(event) => updateField("alignment", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Campaign</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.campaign}
                  onChange={(event) => updateField("campaign", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>XP</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.xp}
                  onChange={(event) => updateField("xp", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Proficiency Bonus</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.proficiencyBonus}
                  onChange={(event) => updateField("proficiencyBonus", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="dnd-toggle">
                <input
                  type="checkbox"
                  checked={activeCharacter.inspiration}
                  onChange={(event) => updateField("inspiration", event.target.checked)}
                />
                Inspiration
              </label>
            </div>
          </details>

          <details className="dnd-section" open>
            <summary className="dnd-section-summary">
              <strong>Abilities & Saves</strong>
            </summary>
            <div className="dnd-abilities">
              {ABILITY_KEYS.map((ability) => {
                const score = activeCharacter.abilities[ability];
                const mod = abilityMod(score);
                const saveBonus = mod + (activeCharacter.savingThrows[ability] ? activeCharacter.proficiencyBonus : 0);
                return (
                  <div key={ability} className="dnd-ability-card">
                    <div className="dnd-ability-head">
                      <span>{ABILITY_SHORT[ability]}</span>
                      <strong>{formatMod(mod)}</strong>
                    </div>
                    <label className="slap-input-wrap">
                      <span>{ABILITY_LABELS[ability]}</span>
                      <input
                        className="slap-input"
                        type="number"
                        min={1}
                        max={30}
                        value={score}
                        onChange={(event) => updateAbility(ability, toInt(event.target.value, score))}
                      />
                    </label>
                    <div className="dnd-ability-meta">
                      <span>Save {formatMod(saveBonus)}</span>
                      <label className="dnd-toggle">
                        <input
                          type="checkbox"
                          checked={activeCharacter.savingThrows[ability]}
                          onChange={(event) => updateSavingThrow(ability, event.target.checked)}
                        />
                        Save Proficient
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Skills</strong>
            </summary>
            <SlapInlineText>Tap a skill to mark proficiency. Bonuses update automatically.</SlapInlineText>
            <div className="dnd-skills">
              {SKILLS.map((skill) => {
                const mod = abilityMod(activeCharacter.abilities[skill.ability]);
                const bonus = mod + (activeCharacter.skills[skill.key] ? activeCharacter.proficiencyBonus : 0);
                return (
                  <label key={skill.key} className="dnd-skill">
                    <input
                      type="checkbox"
                      checked={activeCharacter.skills[skill.key]}
                      onChange={(event) => updateSkill(skill.key, event.target.checked)}
                    />
                    <span className="dnd-skill-label">
                      {skill.label} <small>({ABILITY_SHORT[skill.ability]})</small>
                    </span>
                    <strong className="dnd-skill-bonus">{formatMod(bonus)}</strong>
                  </label>
                );
              })}
            </div>
            <SlapInlineText>Passive Perception: {passivePerception}</SlapInlineText>
          </details>

          <details className="dnd-section" open>
            <summary className="dnd-section-summary">
              <strong>Combat & Health</strong>
            </summary>
            <div className="dnd-grid-2">
              <label className="slap-input-wrap">
                <span>Armor Class</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.armorClass}
                  onChange={(event) => updateField("armorClass", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Initiative</span>
                <input
                  className="slap-input"
                  type="number"
                  value={activeCharacter.initiative}
                  onChange={(event) => updateField("initiative", toInt(event.target.value, 0))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Speed</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.speed}
                  onChange={(event) => updateField("speed", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>Hit Dice</span>
                <input
                  className="slap-input"
                  type="text"
                  value={activeCharacter.hitDice}
                  onChange={(event) => updateField("hitDice", event.target.value)}
                />
              </label>
              <label className="slap-input-wrap">
                <span>HP Max</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.hpMax}
                  onChange={(event) => updateField("hpMax", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>HP Current</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.hpCurrent}
                  onChange={(event) => updateField("hpCurrent", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
              <label className="slap-input-wrap">
                <span>HP Temp</span>
                <input
                  className="slap-input"
                  type="number"
                  min={0}
                  value={activeCharacter.hpTemp}
                  onChange={(event) => updateField("hpTemp", Math.max(0, toInt(event.target.value, 0)))}
                />
              </label>
            </div>

            <div className="dnd-death-saves">
              <strong>Death Saves</strong>
              <div className="dnd-death-row">
                <span>Success</span>
                {[1, 2, 3].map((index) => (
                  <label key={`success-${index}`}>
                    <input
                      type="checkbox"
                      checked={activeCharacter.deathSaves.success >= index}
                      onChange={() => updateDeathSave("success", index)}
                    />
                    <span>{index}</span>
                  </label>
                ))}
              </div>
              <div className="dnd-death-row">
                <span>Failure</span>
                {[1, 2, 3].map((index) => (
                  <label key={`failure-${index}`}>
                    <input
                      type="checkbox"
                      checked={activeCharacter.deathSaves.failure >= index}
                      onChange={() => updateDeathSave("failure", index)}
                    />
                    <span>{index}</span>
                  </label>
                ))}
              </div>
            </div>
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Attacks & Spells</strong>
            </summary>
            <textarea
              className="slap-input dnd-textarea"
              value={activeCharacter.attacks}
              onChange={(event) => updateField("attacks", event.target.value)}
              placeholder="Weapon, attack bonus, damage..."
            />
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Equipment</strong>
            </summary>
            <textarea
              className="slap-input dnd-textarea"
              value={activeCharacter.equipment}
              onChange={(event) => updateField("equipment", event.target.value)}
              placeholder="Gear, gold, magic items..."
            />
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Features & Traits</strong>
            </summary>
            <textarea
              className="slap-input dnd-textarea"
              value={activeCharacter.features}
              onChange={(event) => updateField("features", event.target.value)}
              placeholder="Class features, feats, traits..."
            />
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Spells</strong>
            </summary>
            <textarea
              className="slap-input dnd-textarea"
              value={activeCharacter.spells}
              onChange={(event) => updateField("spells", event.target.value)}
              placeholder="Prepared spells, slots, notes..."
            />
          </details>

          <details className="dnd-section">
            <summary className="dnd-section-summary">
              <strong>Notes</strong>
            </summary>
            <textarea
              className="slap-input dnd-textarea"
              value={activeCharacter.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Session notes, quests, reminders..."
            />
          </details>
        </section>
      )}
    </SlapApplicationShell>
  );
};

export const dndCharacterSheetManifest: SlapApplicationManifest = {
  id: "dnd-character-sheet",
  title: "D&D Character Sheet",
  author: "Joel",
  description: "Manage multiple D&D character sheets across campaigns.",
  icon: "🧙",
  Preview,
  Application: DndCharacterSheetApp
};
