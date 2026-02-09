# Suck Less App Portal
## S.L.A.P.

SLAP is a collection of offline-first progressive web apps that can be installed from a single launcher page.

Design goals:
- No telemetry
- Works offline after first load
- Local-first storage only
- Lightweight mobile-first UI

## Project Layout

- `apps/launcher`: PWA launcher shell that lists and opens SLAP apps
- `apps/calculator`: example SLAP app manifest + app component
- `packages/sdk`: shared app contracts (`SlapApplicationContext`, VFS, manifest)
- `packages/ui`: reusable SLAP UI components
- `docs/`: static build output for GitHub Pages

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Start local dev server:

```bash
pnpm dev
```

3. Build production output into `docs/`:

```bash
pnpm build
```

4. Preview production build locally:

```bash
pnpm preview
```

## Monorepo Tooling

This repo uses `pnpm` workspaces and `turbo` for task orchestration:
- `pnpm dev` runs the launcher dev server
- `pnpm build` builds the launcher and all standalone app bundles
- `pnpm typecheck` runs TypeScript checks across workspaces

## GitHub Pages

This repo is configured so the launcher build is emitted to `docs/`.

1. Run:

```bash
pnpm build
```

2. In GitHub repo settings, set Pages source to:
- Branch: `main` (or your default branch)
- Folder: `/docs`

3. Commit and push `docs/` whenever you publish updates.

## App Model

Each app exports a `SlapApplicationManifest`:
- `Preview`: lightweight card content for launcher view
- `Application(ctx)`: the full app component with injected dependencies

The launcher injects a per-app virtual file system through `ctx.vfs`.

## Current Status

MVP scaffold complete:
- Launcher shell
- Shared SDK and UI packages
- Calculator sample app
- Journal app (optional encryption + import/export)
- PWA config
- Docs-targeted build for GitHub Pages
