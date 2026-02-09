import { useEffect, useMemo, useState } from "react";
import type { SlapApplicationContext, SlapApplicationManifest } from "@slap/sdk";
import { SlapActionButton, SlapInlineText } from "@slap/ui";

type PoolColor = "red" | "blue" | "neutral";
type DiceSide = 4 | 6 | 8 | 10 | 12 | 20 | 100;

type DicePool = {
  id: string;
  color: PoolColor;
  count: number;
  sides: DiceSide;
};

type PoolRollResult = {
  poolId: string;
  color: PoolColor;
  count: number;
  sides: DiceSide;
  rolls: number[];
  subtotal: number;
};

type RollResult = {
  id: string;
  createdAtIso: string;
  pools: PoolRollResult[];
  grandTotal: number;
};

type SavedState = {
  pools: DicePool[];
  history: RollResult[];
  showTotals: boolean;
  sortResults: boolean;
  autoClearHistory: boolean;
};

const STORAGE_PATH = "dice-roller-state.json";
const MAX_HISTORY = 10;
const MAX_DICE_PER_POOL = 100;
const DICE_OPTIONS: DiceSide[] = [4, 6, 8, 10, 12, 20, 100];
const COLOR_OPTIONS: Array<{ value: PoolColor; label: string }> = [
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "neutral", label: "Neutral" }
];

const Preview = (_props: Record<string, never>) => (
  <article>
    <strong>Dice Roller</strong>
    <p>Roll multiple color-coded dice pools for tabletop sessions.</p>
  </article>
);

const createPool = (seed?: number): DicePool => ({
  id: `pool-${Date.now()}-${seed ?? Math.floor(Math.random() * 100_000)}`,
  color: seed === 2 ? "blue" : "red",
  count: seed === 2 ? 2 : 3,
  sides: seed === 2 ? 8 : 6
});

const createDefaultState = (): SavedState => ({
  pools: [createPool(1), createPool(2)],
  history: [],
  showTotals: true,
  sortResults: false,
  autoClearHistory: false
});

const randomRoll = (sides: number) => Math.floor(Math.random() * sides) + 1;

const asSides = (value: unknown): DiceSide | null => {
  if (typeof value !== "number") return null;
  return DICE_OPTIONS.includes(value as DiceSide) ? (value as DiceSide) : null;
};

const asColor = (value: unknown): PoolColor | null => {
  if (value === "red" || value === "blue" || value === "neutral") return value;
  return null;
};

const clampCount = (value: number) => Math.max(1, Math.min(MAX_DICE_PER_POOL, Math.floor(value)));
const toEquation = (rolls: number[], subtotal: number) => `${rolls.join(" + ")} = ${subtotal}`;

const normalizePool = (value: unknown): DicePool | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string") return null;

  const color = asColor(candidate.color);
  const sides = asSides(candidate.sides);
  const count = typeof candidate.count === "number" ? clampCount(candidate.count) : NaN;

  if (!color || !sides || Number.isNaN(count)) return null;

  return {
    id: candidate.id,
    color,
    count,
    sides
  };
};

const normalizeRollResult = (value: unknown): RollResult | null => {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.createdAtIso !== "string") return null;
  if (!Array.isArray(candidate.pools) || typeof candidate.grandTotal !== "number") return null;

  const pools: PoolRollResult[] = [];
  for (const poolValue of candidate.pools) {
    if (typeof poolValue !== "object" || poolValue === null) continue;
    const pool = poolValue as Record<string, unknown>;
    const color = asColor(pool.color);
    const sides = asSides(pool.sides);
    if (!color || !sides || typeof pool.poolId !== "string" || typeof pool.count !== "number" || !Array.isArray(pool.rolls)) {
      continue;
    }

    const rolls = pool.rolls.filter((roll): roll is number => typeof roll === "number");
    const subtotal = typeof pool.subtotal === "number" ? pool.subtotal : rolls.reduce((sum, roll) => sum + roll, 0);

    pools.push({
      poolId: pool.poolId,
      color,
      count: clampCount(pool.count),
      sides,
      rolls,
      subtotal
    });
  }

  return {
    id: candidate.id,
    createdAtIso: candidate.createdAtIso,
    pools,
    grandTotal: Math.floor(candidate.grandTotal)
  };
};

const DiceRollerApp = ({ ctx }: { ctx: SlapApplicationContext }) => {
  const [state, setState] = useState<SavedState>(createDefaultState);
  const [statusText, setStatusText] = useState("Configure pools, then roll.");
  const [isRollAnimating, setIsRollAnimating] = useState(false);

  useEffect(() => {
    void (async () => {
      const raw = await ctx.vfs.readText(STORAGE_PATH);
      if (!raw) return;

      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const pools = Array.isArray(parsed.pools)
          ? parsed.pools.map(normalizePool).filter((pool): pool is DicePool => pool !== null)
          : [];
        const history = Array.isArray(parsed.history)
          ? parsed.history.map(normalizeRollResult).filter((result): result is RollResult => result !== null)
          : [];

        setState({
          pools: pools.length > 0 ? pools : createDefaultState().pools,
          history: history.slice(0, MAX_HISTORY),
          showTotals: parsed.showTotals !== false,
          sortResults: parsed.sortResults === true,
          autoClearHistory: parsed.autoClearHistory === true
        });
      } catch {
        setStatusText("Saved data was invalid. Loaded defaults.");
      }
    })();
  }, [ctx.vfs]);

  useEffect(() => {
    void ctx.vfs.writeText(STORAGE_PATH, JSON.stringify(state, null, 2));
  }, [ctx.vfs, state]);

  const addPool = () => {
    setState((current) => ({
      ...current,
      pools: [...current.pools, createPool()]
    }));
  };

  const removePool = (poolId: string) => {
    setState((current) => {
      const nextPools = current.pools.filter((pool) => pool.id !== poolId);
      if (nextPools.length === 0) return current;
      return {
        ...current,
        pools: nextPools
      };
    });
  };

  const patchPool = (poolId: string, patch: Partial<Omit<DicePool, "id">>) => {
    setState((current) => ({
      ...current,
      pools: current.pools.map((pool) =>
        pool.id === poolId
          ? {
              ...pool,
              ...patch,
              count: patch.count !== undefined ? clampCount(patch.count) : pool.count
            }
          : pool
      )
    }));
  };

  const toggleOption = (key: "showTotals" | "sortResults" | "autoClearHistory") => {
    setState((current) => ({ ...current, [key]: !current[key] }));
  };

  const rollAll = () => {
    setIsRollAnimating(true);
    window.setTimeout(() => setIsRollAnimating(false), 720);

    const rolledPools = state.pools.map((pool) => {
      const rolls = Array.from({ length: pool.count }, () => randomRoll(pool.sides));
      const normalizedRolls = state.sortResults ? [...rolls].sort((a, b) => a - b) : rolls;
      const subtotal = normalizedRolls.reduce((sum, roll) => sum + roll, 0);

      return {
        poolId: pool.id,
        color: pool.color,
        count: pool.count,
        sides: pool.sides,
        rolls: normalizedRolls,
        subtotal
      } satisfies PoolRollResult;
    });

    const grandTotal = rolledPools.reduce((sum, pool) => sum + pool.subtotal, 0);
    const result: RollResult = {
      id: `roll-${Date.now()}`,
      createdAtIso: new Date().toISOString(),
      pools: rolledPools,
      grandTotal
    };

    setState((current) => ({
      ...current,
      history: current.autoClearHistory
        ? [result]
        : [result, ...current.history].slice(0, MAX_HISTORY)
    }));

    setStatusText(`Rolled ${rolledPools.length} pool${rolledPools.length === 1 ? "" : "s"}.`);
  };

  const clearHistory = () => {
    setState((current) => ({ ...current, history: [] }));
    setStatusText("Roll history cleared.");
  };

  const resetDefaults = () => {
    setState((current) => ({
      ...createDefaultState(),
      history: current.history
    }));
    setStatusText("Pools reset to defaults.");
  };

  const latestRoll = state.history[0] ?? null;
  const totalDice = useMemo(
    () => state.pools.reduce((sum, pool) => sum + pool.count, 0),
    [state.pools]
  );

  return (
    <section className="slap-shell">
      <SlapInlineText>Build custom pools like 3 red d6 + 2 blue d8, then roll.</SlapInlineText>
      <SlapInlineText>
        Pools: {state.pools.length} | Dice: {totalDice}
      </SlapInlineText>
      <SlapInlineText>{statusText}</SlapInlineText>

      <div className="dice-primary-action">
        <SlapActionButton title="Roll" onClick={rollAll} />
      </div>

      <section className="dice-results">
        <h3 className="slap-title">Latest Roll</h3>
        {!latestRoll ? (
          <SlapInlineText>No rolls yet.</SlapInlineText>
        ) : (
          <>
            {latestRoll.pools.map((pool) => (
              <article
                key={pool.poolId}
                className={`dice-roll-row dice-${pool.color}${isRollAnimating ? " dice-roll-animate" : ""}`}
              >
                <strong>
                  {pool.count}d{pool.sides} {pool.color}
                </strong>
                <p className="dice-roll-equation">{toEquation(pool.rolls, pool.subtotal)}</p>
              </article>
            ))}
            {state.showTotals ? (
              <SlapInlineText>
                Grand total: <strong>{latestRoll.grandTotal}</strong>
              </SlapInlineText>
            ) : null}
          </>
        )}
      </section>

      <section className="dice-options">
        <label>
          <input
            type="checkbox"
            checked={state.showTotals}
            onChange={() => toggleOption("showTotals")}
          />
          Show totals
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.sortResults}
            onChange={() => toggleOption("sortResults")}
          />
          Sort rolls
        </label>
        <label>
          <input
            type="checkbox"
            checked={state.autoClearHistory}
            onChange={() => toggleOption("autoClearHistory")}
          />
          Auto-clear history
        </label>
      </section>

      <section className="dice-pool-list">
        {state.pools.map((pool) => (
          <article key={pool.id} className={`dice-pool-card dice-${pool.color}`}>
            <div className="dice-pool-head">
              <strong>{pool.color.toUpperCase()} Pool</strong>
              <button
                type="button"
                className="dice-remove-btn"
                onClick={() => removePool(pool.id)}
                disabled={state.pools.length <= 1}
              >
                Remove
              </button>
            </div>
            <div className="dice-pool-controls">
              <label className="dice-inline-field">
                <span>Count</span>
                <div className="dice-count-controls">
                  <button type="button" onClick={() => patchPool(pool.id, { count: pool.count - 1 })}>
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={MAX_DICE_PER_POOL}
                    value={pool.count}
                    onChange={(event) => patchPool(pool.id, { count: Number(event.target.value) || 1 })}
                  />
                  <button type="button" onClick={() => patchPool(pool.id, { count: pool.count + 1 })}>
                    +
                  </button>
                </div>
              </label>

              <label className="dice-inline-field">
                <span>Die</span>
                <select
                  value={pool.sides}
                  onChange={(event) => patchPool(pool.id, { sides: Number(event.target.value) as DiceSide })}
                >
                  {DICE_OPTIONS.map((sides) => (
                    <option key={sides} value={sides}>
                      d{sides}
                    </option>
                  ))}
                </select>
              </label>

              <label className="dice-inline-field">
                <span>Color</span>
                <select
                  value={pool.color}
                  onChange={(event) => patchPool(pool.id, { color: event.target.value as PoolColor })}
                >
                  {COLOR_OPTIONS.map((color) => (
                    <option key={color.value} value={color.value}>
                      {color.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </article>
        ))}
      </section>

      <div className="dice-actions">
        <SlapActionButton title="Add Pool" onClick={addPool} />
        <SlapActionButton title="Clear History" onClick={clearHistory} />
        <SlapActionButton title="Reset Defaults" onClick={resetDefaults} />
      </div>

      <section className="dice-results">
        <h3 className="slap-title">History ({state.history.length})</h3>
        {state.history.length === 0 ? <SlapInlineText>History is empty.</SlapInlineText> : null}
        {state.history.map((result) => (
          <details key={result.id}>
            <summary>
              {new Date(result.createdAtIso).toLocaleTimeString()} | {result.pools.length} pools
              {state.showTotals ? ` | total ${result.grandTotal}` : ""}
            </summary>
            {result.pools.map((pool) => (
              <article key={`${result.id}:${pool.poolId}`} className={`dice-roll-row dice-${pool.color}`}>
                <strong>
                  {pool.count}d{pool.sides} {pool.color}
                </strong>
                <p className="dice-roll-equation">{toEquation(pool.rolls, pool.subtotal)}</p>
              </article>
            ))}
          </details>
        ))}
      </section>
    </section>
  );
};

export const diceRollerManifest: SlapApplicationManifest = {
  id: "dice-roller",
  title: "Dice Roller",
  author: "Joel",
  description: "Roll custom color-coded dice pools for tabletop sessions.",
  icon: "🎲",
  Preview,
  Application: DiceRollerApp
};
