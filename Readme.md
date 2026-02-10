# sucks-less app portal

![Deploy Pages](https://github.com/longjoel/sucks-less-app-portal/actions/workflows/deploy.yml/badge.svg)

sucks-less is a collection of offline-first progressive web apps that can be installed from a single launcher page.

Design goals:
- No telemetry
- Works offline after first load
- Local-first storage only
- Lightweight mobile-first UI

## Project Layout

- `apps/launcher`: PWA launcher shell that lists and opens sucks-less apps
- `apps/calculator`: example sucks-less app manifest + app component
- `packages/sdk`: shared app contracts (`SlapApplicationContext`, VFS, manifest)
- `packages/ui`: reusable sucks-less UI components
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

## GitHub Pages (CI Deploy)

The build outputs to `docs/`, but the folder is ignored in git. GitHub Pages is deployed via Actions.

1. Ensure GitHub Pages is set to **GitHub Actions** in repo settings.
2. Push to `main` and the workflow will build + deploy.

Optional helper:

```bash
pnpm deploy
```

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
