import { useEffect, useMemo, useState } from "react";
import { createSlapAppContext, type SlapApplicationManifest } from "@slap/sdk";

type AppCatalogItem = {
  id: string;
  title: string;
  author: string;
  description: string;
  version: string;
  icon?: string;
  loadManifest: () => Promise<SlapApplicationManifest>;
};

type InstalledAppRecord = {
  id: string;
  version: string;
  installedAtIso: string;
  updatedAtIso: string;
};

type InstalledAppsState = Record<string, InstalledAppRecord>;

type Footprint = {
  localStorageBytes: number;
  appDataBytes: number;
  usedBytes: number | null;
  quotaBytes: number | null;
};

const INSTALLED_APPS_KEY = "slap:launcher:installed-apps";

const appCatalog: AppCatalogItem[] = [
  {
    id: "calculator",
    title: "Calculator",
    author: "Joel",
    description: "A tiny offline-first calculator.",
    version: "1.0.0",
    icon: "🧮",
    loadManifest: async () => (await import("@slap/calculator")).calculatorManifest
  },
  {
    id: "journal",
    title: "Journal",
    author: "Joel",
    description: "Password-protected journal with import/export.",
    version: "1.0.0",
    icon: "📓",
    loadManifest: async () => (await import("@slap/journal")).journalManifest
  }
];

const appCatalogById = new Map(appCatalog.map((app) => [app.id, app]));

const parseVersion = (value: string) =>
  value
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));

const isVersionNewer = (latest: string, current: string) => {
  const next = parseVersion(latest);
  const previous = parseVersion(current);
  const maxLength = Math.max(next.length, previous.length);

  for (let index = 0; index < maxLength; index += 1) {
    const nextPart = next[index] ?? 0;
    const previousPart = previous[index] ?? 0;

    if (nextPart > previousPart) {
      return true;
    }

    if (nextPart < previousPart) {
      return false;
    }
  }

  return false;
};

const formatBytes = (bytes: number | null) => {
  if (bytes === null || Number.isNaN(bytes)) {
    return "Unknown";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(2)} MB`;
};

const getLocalStorageFootprint = (): { localStorageBytes: number; appDataBytes: number } => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { localStorageBytes: 0, appDataBytes: 0 };
  }

  let localStorageBytes = 0;
  let appDataBytes = 0;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) {
      continue;
    }

    const value = window.localStorage.getItem(key) ?? "";
    const bytes = (key.length + value.length) * 2;

    localStorageBytes += bytes;
    if (key.startsWith("slap:v1:")) {
      appDataBytes += bytes;
    }
  }

  return { localStorageBytes, appDataBytes };
};

const getDefaultInstalledApps = (): InstalledAppsState => {
  const now = new Date().toISOString();
  return {
    calculator: {
      id: "calculator",
      version: appCatalogById.get("calculator")?.version ?? "1.0.0",
      installedAtIso: now,
      updatedAtIso: now
    }
  };
};

const isStandaloneDisplayMode = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  const displayModeStandalone = window.matchMedia("(display-mode: standalone)").matches;

  return iosStandalone || displayModeStandalone;
};

const getInitialInstalledApps = (): InstalledAppsState => {
  if (typeof window === "undefined" || !window.localStorage) {
    return getDefaultInstalledApps();
  }

  try {
    const raw = window.localStorage.getItem(INSTALLED_APPS_KEY);
    if (!raw) {
      return getDefaultInstalledApps();
    }

    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      const migrated: InstalledAppsState = {};
      const now = new Date().toISOString();

      for (const value of parsed) {
        if (typeof value !== "string") {
          continue;
        }

        const catalog = appCatalogById.get(value);
        if (!catalog) {
          continue;
        }

        migrated[value] = {
          id: value,
          version: "0.0.0",
          installedAtIso: now,
          updatedAtIso: now
        };
      }

      return Object.keys(migrated).length > 0 ? migrated : getDefaultInstalledApps();
    }

    if (typeof parsed === "object" && parsed !== null) {
      const normalized: InstalledAppsState = {};

      for (const [id, record] of Object.entries(parsed as Record<string, unknown>)) {
        const catalog = appCatalogById.get(id);
        if (!catalog || typeof record !== "object" || record === null) {
          continue;
        }

        const candidate = record as Record<string, unknown>;
        const now = new Date().toISOString();

        normalized[id] = {
          id,
          version: typeof candidate.version === "string" ? candidate.version : "0.0.0",
          installedAtIso: typeof candidate.installedAtIso === "string" ? candidate.installedAtIso : now,
          updatedAtIso: typeof candidate.updatedAtIso === "string" ? candidate.updatedAtIso : now
        };
      }

      return Object.keys(normalized).length > 0 ? normalized : getDefaultInstalledApps();
    }

    return getDefaultInstalledApps();
  } catch {
    return getDefaultInstalledApps();
  }
};

export const App = () => {
  const [installedApps, setInstalledApps] = useState<InstalledAppsState>(getInitialInstalledApps);
  const [activeManifest, setActiveManifest] = useState<SlapApplicationManifest | null>(null);
  const [screen, setScreen] = useState<"launcher" | "manage">("launcher");
  const [isStandalone, setIsStandalone] = useState(isStandaloneDisplayMode);
  const [launcherError, setLauncherError] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);
  const [isSyncingApps, setIsSyncingApps] = useState(false);
  const [footprint, setFootprint] = useState<Footprint>({
    localStorageBytes: 0,
    appDataBytes: 0,
    usedBytes: null,
    quotaBytes: null
  });

  const installedAppList = useMemo(() => {
    return Object.values(installedApps)
      .map((record) => ({
        record,
        catalog: appCatalogById.get(record.id) ?? null
      }))
      .filter((entry): entry is { record: InstalledAppRecord; catalog: AppCatalogItem } => entry.catalog !== null)
      .sort((a, b) => a.catalog.title.localeCompare(b.catalog.title));
  }, [installedApps]);

  const availableAppCatalog = useMemo(
    () => appCatalog.filter((app) => !installedApps[app.id]),
    [installedApps]
  );

  const activeCtx = useMemo(
    () => (activeManifest ? createSlapAppContext(activeManifest.id) : null),
    [activeManifest?.id]
  );

  const refreshFootprint = async () => {
    const localData = getLocalStorageFootprint();

    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      const estimate = await navigator.storage.estimate();
      setFootprint({
        localStorageBytes: localData.localStorageBytes,
        appDataBytes: localData.appDataBytes,
        usedBytes: estimate.usage ?? null,
        quotaBytes: estimate.quota ?? null
      });
      return;
    }

    setFootprint({
      localStorageBytes: localData.localStorageBytes,
      appDataBytes: localData.appDataBytes,
      usedBytes: null,
      quotaBytes: null
    });
  };

  const syncInstalledApps = async () => {
    setIsSyncingApps(true);
    setLauncherError(null);
    setUpdateMessage(null);

    try {
      const entries = Object.values(installedApps);
      const next: InstalledAppsState = { ...installedApps };
      let updatesApplied = 0;

      for (const entry of entries) {
        const catalog = appCatalogById.get(entry.id);
        if (!catalog) {
          continue;
        }

        if (isVersionNewer(catalog.version, entry.version)) {
          await catalog.loadManifest();
          next[entry.id] = {
            ...entry,
            version: catalog.version,
            updatedAtIso: new Date().toISOString()
          };
          updatesApplied += 1;
        }
      }

      if (updatesApplied > 0) {
        setInstalledApps(next);
        setUpdateMessage(`Updated ${updatesApplied} app${updatesApplied === 1 ? "" : "s"} to latest version.`);
      } else {
        setUpdateMessage("All installed apps are already on the latest version.");
      }
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "App update check failed.");
    } finally {
      setIsSyncingApps(false);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(INSTALLED_APPS_KEY, JSON.stringify(installedApps));
    void refreshFootprint();
  }, [installedApps]);

  useEffect(() => {
    void refreshFootprint();
  }, []);

  useEffect(() => {
    if (!activeManifest) {
      void refreshFootprint();
    }
  }, [activeManifest]);

  useEffect(() => {
    void syncInstalledApps();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateMode = () => setIsStandalone(isStandaloneDisplayMode());

    updateMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMode);
      return () => mediaQuery.removeEventListener("change", updateMode);
    }

    mediaQuery.addListener(updateMode);
    return () => mediaQuery.removeListener(updateMode);
  }, []);

  const installApp = async (app: AppCatalogItem) => {
    setLauncherError(null);

    try {
      await app.loadManifest();

      const now = new Date().toISOString();
      setInstalledApps((current) => ({
        ...current,
        [app.id]: {
          id: app.id,
          version: app.version,
          installedAtIso: current[app.id]?.installedAtIso ?? now,
          updatedAtIso: now
        }
      }));

      setUpdateMessage(`Installed ${app.title} v${app.version}.`);
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Unable to install app.");
    }
  };

  const updateApp = async (app: AppCatalogItem, currentVersion: string) => {
    setLauncherError(null);

    if (!isVersionNewer(app.version, currentVersion)) {
      setUpdateMessage(`${app.title} is already up to date.`);
      return;
    }

    try {
      await app.loadManifest();
      setInstalledApps((current) => ({
        ...current,
        [app.id]: {
          ...current[app.id],
          id: app.id,
          version: app.version,
          updatedAtIso: new Date().toISOString()
        }
      }));
      setUpdateMessage(`Updated ${app.title} to v${app.version}.`);
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Unable to update app.");
    }
  };

  const openApp = async (app: AppCatalogItem) => {
    setLauncherError(null);

    try {
      const manifest = await app.loadManifest();
      setActiveManifest(manifest);
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Unable to load app.");
    }
  };

  if (activeManifest && activeCtx) {
    const ActiveApplication = activeManifest.Application;

    return (
      <main className="page">
        <header className="header">
          <button type="button" className="back-button" onClick={() => setActiveManifest(null)}>
            Back
          </button>
          <h1>{activeManifest.title}</h1>
        </header>
        <section className="app-panel">
          <ActiveApplication ctx={activeCtx} />
        </section>
      </main>
    );
  }

  if (screen === "manage") {
    return (
      <main className="page">
        <header className="header">
          <button type="button" className="back-button" onClick={() => setScreen("launcher")}>
            Back To Launcher
          </button>
          <h1>Manage Apps</h1>
          <p>Install and update app packages.</p>
        </header>

        <div className="slap-button-row">
          <SlapButton title={isSyncingApps ? "Checking..." : "Check For Updates"} onClick={() => void syncInstalledApps()} disabled={isSyncingApps} />
        </div>

        {updateMessage ? <p className="status-line">{updateMessage}</p> : null}
        {launcherError ? <p className="status-line">Error: {launcherError}</p> : null}

        <section>
          <h2 className="section-title">Installed Apps</h2>
          <div className="app-grid">
            {installedAppList.map(({ catalog, record }) => {
              const hasUpdate = isVersionNewer(catalog.version, record.version);

              return (
                <article key={catalog.id} className="app-card">
                  <span className="icon">{catalog.icon ?? "◻"}</span>
                  <div className="card-copy">
                    <strong>{catalog.title}</strong>
                    <span>{catalog.description}</span>
                    <small>Installed v{record.version}</small>
                    <small>Latest v{catalog.version}</small>
                  </div>
                  <div className="slap-button-row">
                    <SlapButton
                      title={hasUpdate ? "Install Latest" : "Up To Date"}
                      onClick={() => void updateApp(catalog, record.version)}
                      disabled={!hasUpdate}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="section-title">Available Apps</h2>
          <div className="app-grid">
            {availableAppCatalog.map((app) => (
              <article key={app.id} className="app-card">
                <span className="icon">{app.icon ?? "◻"}</span>
                <div className="card-copy">
                  <strong>{app.title}</strong>
                  <span>{app.description}</span>
                  <small>Latest v{app.version}</small>
                </div>
                <div className="slap-button-row">
                  <SlapButton title="Install" onClick={() => void installApp(app)} />
                </div>
              </article>
            ))}
            {availableAppCatalog.length === 0 ? <p className="status-line">All apps are installed.</p> : null}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="header">
        <h1>SLAP</h1>
        <p>Installable offline-first app portal.</p>
      </header>

      <section className="status-panel">
        <p className="status-line">
          PWA mode: <strong>{isStandalone ? "Installed" : "Browser tab"}</strong>
        </p>
        <p className="status-line">
          SLAP app data footprint: <strong>{formatBytes(footprint.appDataBytes)}</strong>
        </p>
        <p className="status-line">
          Total origin usage: <strong>{formatBytes(footprint.usedBytes)}</strong>
          {footprint.quotaBytes !== null ? ` / ${formatBytes(footprint.quotaBytes)}` : ""}
        </p>
        <p className="status-line">
          Local storage usage: <strong>{formatBytes(footprint.localStorageBytes)}</strong>
        </p>
      </section>

      <div className="slap-button-row">
        <SlapButton title="Manage Apps" onClick={() => setScreen("manage")} />
        <SlapButton title={isSyncingApps ? "Checking..." : "Check Updates"} onClick={() => void syncInstalledApps()} disabled={isSyncingApps} />
      </div>

      {updateMessage ? <p className="status-line">{updateMessage}</p> : null}
      {launcherError ? <p className="status-line">Error: {launcherError}</p> : null}

      <section>
        <h2 className="section-title">Installed Apps</h2>
        <div className="app-grid">
          {installedAppList.map(({ catalog, record }) => (
            <article key={catalog.id} className="app-card">
              <span className="icon">{catalog.icon ?? "◻"}</span>
              <div className="card-copy">
                <strong>{catalog.title}</strong>
                <span>{catalog.description}</span>
                <small>Installed v{record.version}</small>
                <small>Latest v{catalog.version}</small>
              </div>
              <div className="slap-button-row">
                <SlapButton title="Open" onClick={() => void openApp(catalog)} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
};

const SlapButton = ({
  title,
  onClick,
  disabled
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button type="button" className="slap-button" onClick={onClick} disabled={disabled}>
    {title}
  </button>
);
