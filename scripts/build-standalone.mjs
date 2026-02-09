import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { apps } from "../apps/standalone/apps.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const launcherDir = resolve(repoRoot, "apps/launcher");
const standaloneConfig = resolve(repoRoot, "apps/standalone/vite.config.ts");

for (const app of apps) {
  const env = {
    ...process.env,
    APP_ID: app.id,
    APP_ENTRY: app.entry,
    APP_EXPORT: app.exportName,
    APP_TITLE: app.title,
    APP_SHORT: app.shortName ?? app.title,
    APP_DESCRIPTION: app.description ?? ""
  };

  const result = spawnSync(
    pnpmBin,
    ["exec", "vite", "build", "--config", standaloneConfig],
    {
      stdio: "inherit",
      env,
      cwd: launcherDir
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
