# Building A Dice Roller Mini App (Tutorial Transcript)

## Intro
Hey everyone, in this walkthrough we are adding a brand new **Dice Roller** mini applet to the sucks-less portal.

Goal:
- Support multiple dice pools in one roll (example: `3d6 red` + `2d8 blue`)
- Keep a short roll history
- Persist settings and history offline
- Integrate into the existing launcher so it is installable from **Manage Apps**

---

## Step 1: Scaffold the app package
First, we create a new workspace app at:
- `apps/dice-roller/package.json`
- `apps/dice-roller/tsconfig.json`
- `apps/dice-roller/src/index.tsx`

We mirror the same package shape as other mini apps so TypeScript and workspace scripts continue to work without extra configuration.

---

## Step 2: Define the app state model
Inside `apps/dice-roller/src/index.tsx`, we define:
- `DicePool` (id, color, count, sides)
- `RollResult` with per-pool rolls/subtotals and grand total
- `SavedState` with:
  - pools
  - history
  - toggles (`showTotals`, `sortResults`, `autoClearHistory`)

We also add constants:
- `DICE_OPTIONS = [4, 6, 8, 10, 12, 20, 100]`
- `MAX_DICE_PER_POOL = 100`
- `MAX_HISTORY = 10`

---

## Step 3: Add persistence (offline-ready)
We use the app VFS (`ctx.vfs`) with:
- `STORAGE_PATH = "dice-roller-state.json"`

On load:
- read saved JSON
- validate/normalize pools and history
- fallback to defaults if invalid

On change:
- write the latest state back to VFS

This keeps the roller functional offline and restores recent setup.

---

## Step 4: Build pool management UI
We add a pool editor where each pool has:
- Color (`red`, `blue`, `neutral`)
- Count (with `-` / input / `+`)
- Die type (`d4...d100`)

And actions:
- Add Pool
- Remove Pool (keeps at least one pool)
- Reset Defaults

---

## Step 5: Implement rolling logic
`rollAll()`:
1. Roll each pool (`count` times from `1..sides`)
2. Optionally sort results
3. Compute subtotals and grand total
4. Push to history (or replace history if `autoClearHistory` is enabled)

History is capped to the newest 10 entries.

---

## Step 6: Present latest result + history
We render:
- **Latest Roll** section with per-pool lines and optional totals
- **History** section using collapsible rows (`details/summary`)

This makes quick reads easy while still exposing deeper previous results.

---

## Step 7: Integrate with launcher
We register the new app in:
- `apps/launcher/vite.config.ts` alias map:
  - `@slap/dice-roller -> ../dice-roller/src/index.tsx`
- `apps/launcher/src/App.tsx` catalog:
  - id: `dice-roller`
  - title/icon/description
  - `loadManifest: () => import("@slap/dice-roller")...`

Now it appears in **Manage Apps** and can be installed like other applets.

---

## Step 8: Add styling
In `apps/launcher/src/styles.css`, we add dedicated classes:
- `.dice-options`
- `.dice-pool-list`, `.dice-pool-card`, `.dice-pool-controls`
- `.dice-count-controls`
- `.dice-results`, `.dice-roll-row`
- `.dice-red`, `.dice-blue`, `.dice-neutral`

This keeps the app compact and readable on mobile while still showing rich roll output.

---

## Step 9: Verify the build
Run:

```bash
npm run build
```

Expected result:
- Build succeeds
- New dice app bundle is included
- PWA output updates normally

---

## Wrap-up
We now have a complete `@slap/dice-roller` mini app with:
- Multi-pool tabletop rolling
- D&D-friendly dice options
- Color-coded pools
- Persisted settings/history
- Launcher integration

Next enhancement ideas:
- Advantage/disadvantage quick actions
- Roll notation parser (`2d20kh1 + 5`)
- Per-pool modifiers and target checks
