import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { apps } from "../apps/standalone/apps.mjs";

const viteBin = resolve("node_modules/.bin/vite");
const viteCommand = process.platform === "win32" ? `${viteBin}.cmd` : viteBin;

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
    viteCommand,
    ["build", "--config", "apps/standalone/vite.config.ts"],
    {
      stdio: "inherit",
      env
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
