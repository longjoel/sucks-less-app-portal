import { useEffect, useMemo, useState } from "react";
import { createSlapAppContext, type SlapApplicationManifest } from "@slap/sdk";

type AppCatalogItem = {
  id: string;
  title: string;
  author: string;
  description: string;
  tags: string[];
  version: string;
  icon?: string;
  standalonePath?: string;
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

type InstallDebug = {
  displayModeStandalone: boolean;
  iosStandalone: boolean;
  hasBeforeInstallPrompt: boolean;
  serviceWorkerControlled: boolean;
  manifestLinkPresent: boolean;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type RouteState =
  | { kind: "launcher" }
  | { kind: "manage" }
  | { kind: "app"; appId: string };

const INSTALLED_APPS_KEY = "slap:launcher:installed-apps";
const HIDDEN_APPS_KEY = "slap:launcher:hidden-apps";
const FAVORITE_APPS_KEY = "slap:launcher:favorite-apps";
const RECENT_APPS_KEY = "slap:launcher:recent-apps";
const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const ROOT_GUARD_BASE = "slap-root-base";
const ROOT_GUARD_ACTIVE = "slap-root-active";

const standalonePathFor = (appId: string) => `${APP_BASE}/apps/${encodeURIComponent(appId)}/`;

const rawAppCatalog: AppCatalogItem[] = [
  {
    id: "calculator",
    title: "Calculator",
    author: "Joel",
    description: "A tiny offline-first calculator.",
    tags: ["utility", "math", "quick-tools"],
    version: "1.0.0",
    icon: "🧮",
    loadManifest: async () => (await import("@slap/calculator")).calculatorManifest
  },
  {
    id: "journal",
    title: "Journal",
    author: "Joel",
    description: "Mood-aware journal with optional prompts.",
    tags: ["writing", "reflection", "mental-health"],
    version: "1.0.0",
    icon: "📓",
    loadManifest: async () => (await import("@slap/journal")).journalManifest
  },
  {
    id: "mh-phq9",
    title: "PHQ-9 Check-in",
    author: "Joel",
    description: "PHQ-9 screening with history, trends, and export.",
    tags: ["mental-health", "assessment", "tracking"],
    version: "1.0.0",
    icon: "PHQ-9",
    loadManifest: async () => (await import("@slap/mh-phq9")).mhPhq9Manifest
  },
  {
    id: "mh-gad7",
    title: "GAD-7 Check-in",
    author: "Joel",
    description: "GAD-7 screening with history, trends, and export.",
    tags: ["mental-health", "assessment", "tracking"],
    version: "1.0.0",
    icon: "GAD-7",
    loadManifest: async () => (await import("@slap/mh-gad7")).mhGad7Manifest
  },
  {
    id: "mh-abc",
    title: "ABC Worksheet",
    author: "Joel",
    description: "ABC worksheet entries with trends and export.",
    tags: ["mental-health", "reflection", "worksheet"],
    version: "1.0.0",
    icon: "ABC",
    loadManifest: async () => (await import("@slap/mh-abc")).mhAbcManifest
  },
  {
    id: "box-breathing",
    title: "Box Breathing",
    author: "Joel",
    description: "Canvas-guided inhale/hold/exhale/hold breathing.",
    tags: ["wellness", "breathing", "timer"],
    version: "1.0.0",
    icon: "🫁",
    loadManifest: async () => (await import("@slap/box-breathing")).boxBreathingManifest
  },
  {
    id: "daily-checklist",
    title: "Daily Checklist",
    author: "Joel",
    description: "Check off daily tasks and edit your reusable list.",
    tags: ["productivity", "habits", "planning"],
    version: "1.0.0",
    icon: "✅",
    loadManifest: async () => (await import("@slap/daily-checklist")).dailyChecklistManifest
  },
  {
    id: "game-2048",
    title: "2048",
    author: "Joel",
    description: "Swipe and merge tiles to reach 2048.",
    tags: ["game", "puzzle", "numbers"],
    version: "1.0.0",
    icon: "🔢",
    loadManifest: async () => (await import("@slap/game-2048")).game2048Manifest
  },
  {
    id: "mastermind",
    title: "Mastermind",
    author: "Joel",
    description: "Crack the secret color code with feedback pegs.",
    tags: ["game", "puzzle", "logic"],
    version: "1.0.0",
    icon: "🧩",
    loadManifest: async () => (await import("@slap/mastermind")).mastermindManifest
  },
  {
    id: "sudoku",
    title: "Sudoku",
    author: "Joel",
    description: "Generate easy, medium, or hard Sudoku puzzles.",
    tags: ["game", "puzzle", "logic", "numbers"],
    version: "1.0.0",
    icon: "🔣",
    loadManifest: async () => (await import("@slap/sudoku")).sudokuManifest
  },
  {
    id: "fireplace",
    title: "Fireplace",
    author: "Joel",
    description: "Cozy particle fire with motion and sound response.",
    tags: ["ambient", "relax", "simulation"],
    version: "1.0.0",
    icon: "🔥",
    loadManifest: async () => (await import("@slap/fireplace")).fireplaceManifest
  },
  {
    id: "aquarium",
    title: "Aquarium",
    author: "Joel",
    description: "Relaxing fish tank you can feed and poke.",
    tags: ["ambient", "playset", "simulation"],
    version: "1.0.0",
    icon: "🐟",
    loadManifest: async () => (await import("@slap/aquarium")).aquariumManifest
  },
  {
    id: "zen-garden",
    title: "Zen Garden",
    author: "Joel",
    description: "Rake the sand, place stones, and reset when you need to breathe.",
    tags: ["ambient", "toy", "mindful"],
    version: "1.0.0",
    icon: "🪨",
    loadManifest: async () => (await import("@slap/zen-garden")).zenGardenManifest
  },
  {
    id: "whiteboard",
    title: "Whiteboard",
    author: "Joel",
    description: "Sketch ideas with a few markers, erase, and save to PNG.",
    tags: ["utility", "creative", "notes"],
    version: "1.0.0",
    icon: "📝",
    loadManifest: async () => (await import("@slap/whiteboard")).whiteboardManifest
  },
  {
    id: "notes",
    title: "Notes",
    author: "Joel",
    description: "Accordion notes you can update, append, clone, and delete.",
    tags: ["utility", "writing", "organize"],
    version: "1.0.0",
    icon: "🗒️",
    loadManifest: async () => (await import("@slap/notes")).notesManifest
  },
  {
    id: "minesweeper",
    title: "Minesweeper",
    author: "Joel",
    description: "Reveal safe tiles and avoid mines.",
    tags: ["game", "puzzle", "classic"],
    version: "1.0.0",
    icon: "💣",
    loadManifest: async () => (await import("@slap/minesweeper")).minesweeperManifest
  },
  {
    id: "ski-free",
    title: "Ski Free",
    author: "Joel",
    description: "Dodge obstacles and survive as long as possible.",
    tags: ["game", "arcade", "reflex"],
    version: "1.0.0",
    icon: "🎿",
    loadManifest: async () => (await import("@slap/ski-free")).skiFreeManifest
  },
  {
    id: "simon-says",
    title: "Simon Says",
    author: "Joel",
    description: "Repeat the growing 4-region light pattern.",
    tags: ["game", "memory", "reflex"],
    version: "1.0.0",
    icon: "🟩",
    loadManifest: async () => (await import("@slap/simon-says")).simonSaysManifest
  },
  {
    id: "dice-roller",
    title: "Dice Roller",
    author: "Joel",
    description: "Roll custom color-coded dice pools for tabletop sessions.",
    tags: ["tabletop", "randomizer", "utility"],
    version: "1.0.0",
    icon: "🎲",
    loadManifest: async () => (await import("@slap/dice-roller")).diceRollerManifest
  },
  {
    id: "compass",
    title: "Compass",
    author: "Joel",
    description: "Basic heading compass using device orientation sensors.",
    tags: ["utility", "sensors", "navigation"],
    version: "1.0.0",
    icon: "🧭",
    loadManifest: async () => (await import("@slap/compass")).compassManifest
  },
  {
    id: "countdown",
    title: "Countdown",
    author: "Joel",
    description: "Track days until upcoming events with optional notifications.",
    tags: ["planning", "dates", "notifications"],
    version: "1.0.0",
    icon: "⏳",
    loadManifest: async () => (await import("@slap/countdown")).countdownManifest
  },
  {
    id: "stopwatch",
    title: "Stopwatch",
    author: "Joel",
    description: "Simple stopwatch with lap recording.",
    tags: ["utility", "time", "productivity"],
    version: "1.0.0",
    icon: "⏱️",
    loadManifest: async () => (await import("@slap/stopwatch")).stopwatchManifest
  },
  {
    id: "minute-timer",
    title: "Minute Timer",
    author: "Joel",
    description: "Simple minute timer with optional notifications.",
    tags: ["utility", "time", "notifications"],
    version: "1.0.0",
    icon: "⏲️",
    loadManifest: async () => (await import("@slap/minute-timer")).minuteTimerManifest
  }
];

const appCatalog = rawAppCatalog.map((app) => ({ ...app, standalonePath: standalonePathFor(app.id) }));
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

    if (nextPart > previousPart) return true;
    if (nextPart < previousPart) return false;
  }

  return false;
};

const formatBytes = (bytes: number | null) => {
  if (bytes === null || Number.isNaN(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(1)} KB`;

  return `${(kilobytes / 1024).toFixed(2)} MB`;
};

const getLocalStorageFootprint = (): { localStorageBytes: number; appDataBytes: number } => {
  if (typeof window === "undefined" || !window.localStorage) {
    return { localStorageBytes: 0, appDataBytes: 0 };
  }

  let localStorageBytes = 0;
  let appDataBytes = 0;

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;

    const value = window.localStorage.getItem(key) ?? "";
    const bytes = (key.length + value.length) * 2;
    localStorageBytes += bytes;

    if (key.startsWith("slap:v1:")) appDataBytes += bytes;
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

const getInstallDebugSnapshot = (): InstallDebug => {
  if (typeof window === "undefined") {
    return {
      displayModeStandalone: false,
      iosStandalone: false,
      hasBeforeInstallPrompt: false,
      serviceWorkerControlled: false,
      manifestLinkPresent: false
    };
  }

  return {
    displayModeStandalone: window.matchMedia("(display-mode: standalone)").matches,
    iosStandalone: Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    hasBeforeInstallPrompt: false,
    serviceWorkerControlled: Boolean(window.navigator.serviceWorker?.controller),
    manifestLinkPresent: Boolean(document.querySelector('link[rel="manifest"]'))
  };
};

const isStandaloneDisplayMode = () => {
  const snapshot = getInstallDebugSnapshot();
  return snapshot.displayModeStandalone || snapshot.iosStandalone;
};

const getInitialInstalledApps = (): InstalledAppsState => {
  if (typeof window === "undefined" || !window.localStorage) return getDefaultInstalledApps();

  try {
    const raw = window.localStorage.getItem(INSTALLED_APPS_KEY);
    if (!raw) return getDefaultInstalledApps();

    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      const migrated: InstalledAppsState = {};
      const now = new Date().toISOString();

      for (const value of parsed) {
        if (typeof value !== "string") continue;
        const catalog = appCatalogById.get(value);
        if (!catalog) continue;

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
        if (!catalog || typeof record !== "object" || record === null) continue;

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

const getInitialHiddenAppIds = (): string[] => {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(HIDDEN_APPS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const validIds = new Set(appCatalog.map((app) => app.id));
    return parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
  } catch {
    return [];
  }
};

const getInitialFavoriteAppIds = (): string[] => {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(FAVORITE_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set(appCatalog.map((app) => app.id));
    return parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
  } catch {
    return [];
  }
};

const getInitialRecentAppIds = (): string[] => {
  if (typeof window === "undefined" || !window.localStorage) return [];

  try {
    const raw = window.localStorage.getItem(RECENT_APPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const validIds = new Set(appCatalog.map((app) => app.id));
    return parsed.filter((id): id is string => typeof id === "string" && validIds.has(id));
  } catch {
    return [];
  }
};

const routeToPath = (route: RouteState) => {
  if (route.kind === "manage") return "/manage";
  if (route.kind === "app") return `/app/${encodeURIComponent(route.appId)}`;
  return "/";
};

const pathWithBase = (path: string) => `${APP_BASE}${path}`;

const routeFromLocation = (): RouteState => {
  if (typeof window === "undefined") return { kind: "launcher" };

  const basePrefix = APP_BASE || "";
  const pathname = window.location.pathname.startsWith(basePrefix)
    ? window.location.pathname.slice(basePrefix.length) || "/"
    : window.location.pathname;
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "manage" && segments.length === 1) return { kind: "manage" };
  if (segments[0] === "app" && segments[1] && segments.length === 2) {
    return { kind: "app", appId: decodeURIComponent(segments[1]) };
  }

  return { kind: "launcher" };
};

const routesMatch = (left: RouteState, right: RouteState) =>
  left.kind === right.kind && (left.kind !== "app" || left.appId === right.appId);

export const App = () => {
  const [installedApps, setInstalledApps] = useState<InstalledAppsState>(getInitialInstalledApps);
  const [hiddenAppIds, setHiddenAppIds] = useState<string[]>(getInitialHiddenAppIds);
  const [favoriteAppIds, setFavoriteAppIds] = useState<string[]>(getInitialFavoriteAppIds);
  const [recentAppIds, setRecentAppIds] = useState<string[]>(getInitialRecentAppIds);
  const [homeTab, setHomeTab] = useState<"favorites" | "recent" | "all">("all");
  const [route, setRoute] = useState<RouteState>(routeFromLocation);
  const [activeManifest, setActiveManifest] = useState<SlapApplicationManifest | null>(null);
  const [manageFilter, setManageFilter] = useState("");
  const [manageExpandedId, setManageExpandedId] = useState<string | null>(null);
  const [cleanupMode, setCleanupMode] = useState(false);
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
  const [installDebug, setInstallDebug] = useState<InstallDebug>(getInstallDebugSnapshot);
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const installedAppList = useMemo(
    () =>
      Object.values(installedApps)
        .map((record) => ({ record, catalog: appCatalogById.get(record.id) ?? null }))
        .filter((entry): entry is { record: InstalledAppRecord; catalog: AppCatalogItem } => entry.catalog !== null)
        .sort((a, b) => a.catalog.title.localeCompare(b.catalog.title)),
    [installedApps]
  );

  const visibleInstalledAppList = useMemo(
    () => installedAppList.filter(({ catalog }) => !hiddenAppIds.includes(catalog.id)),
    [installedAppList, hiddenAppIds]
  );
  const visibleById = useMemo(
    () => new Map(visibleInstalledAppList.map((entry) => [entry.catalog.id, entry])),
    [visibleInstalledAppList]
  );
  const favoriteVisibleInstalledAppList = useMemo(
    () =>
      visibleInstalledAppList.filter(({ catalog }) => favoriteAppIds.includes(catalog.id)),
    [visibleInstalledAppList, favoriteAppIds]
  );
  const recentVisibleInstalledAppList = useMemo(
    () =>
      recentAppIds
        .map((id) => visibleById.get(id) ?? null)
        .filter((entry): entry is { record: InstalledAppRecord; catalog: AppCatalogItem } => entry !== null),
    [recentAppIds, visibleById]
  );
  const homeTabOptions = useMemo(() => {
    const options: Array<"favorites" | "recent" | "all"> = [];
    if (favoriteVisibleInstalledAppList.length > 0) options.push("favorites");
    if (recentVisibleInstalledAppList.length > 0) options.push("recent");
    options.push("all");
    return options;
  }, [favoriteVisibleInstalledAppList.length, recentVisibleInstalledAppList.length]);
  const homeActiveList = useMemo(() => {
    if (homeTab === "favorites") return favoriteVisibleInstalledAppList;
    if (homeTab === "recent") return recentVisibleInstalledAppList;
    return visibleInstalledAppList;
  }, [homeTab, favoriteVisibleInstalledAppList, recentVisibleInstalledAppList, visibleInstalledAppList]);

  const availableAppCatalog = useMemo(
    () => appCatalog.filter((app) => !installedApps[app.id]),
    [installedApps]
  );
  const normalizedManageFilter = manageFilter.trim().toLowerCase();
  const matchesManageFilters = (app: AppCatalogItem) => {
    const matchesText =
      !normalizedManageFilter ||
      `${app.title} ${app.description} ${app.id} ${app.tags.join(" ")}`.toLowerCase().includes(normalizedManageFilter);
    return matchesText;
  };
  const filteredAllAppCatalog = useMemo(
    () => appCatalog.filter((app) => matchesManageFilters(app)),
    [normalizedManageFilter]
  );

  const activeCtx = useMemo(
    () => (activeManifest ? createSlapAppContext(activeManifest.id) : null),
    [activeManifest?.id]
  );
  const activeRouteAppId = route.kind === "app" ? route.appId : null;

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

  const refreshInstallDebug = () => {
    const snapshot = getInstallDebugSnapshot();
    setInstallDebug({ ...snapshot, hasBeforeInstallPrompt: installPromptEvent !== null });
  };

  const navigateToRoute = (nextRoute: RouteState, options?: { replace?: boolean }) => {
    if (typeof window !== "undefined") {
      const targetPath = pathWithBase(routeToPath(nextRoute));
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (targetPath !== currentPath) {
        if (options?.replace) {
          window.history.replaceState(null, "", targetPath);
        } else {
          window.history.pushState(null, "", targetPath);
        }
      }
    }
    setRoute(nextRoute);
  };

  const navigateToLauncher = (options?: { replace?: boolean }) => {
    navigateToRoute({ kind: "launcher" }, options);
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
        if (!catalog) continue;

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
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(INSTALLED_APPS_KEY, JSON.stringify(installedApps));
    void refreshFootprint();
  }, [installedApps]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify(hiddenAppIds));
  }, [hiddenAppIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(FAVORITE_APPS_KEY, JSON.stringify(favoriteAppIds));
  }, [favoriteAppIds]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(RECENT_APPS_KEY, JSON.stringify(recentAppIds));
  }, [recentAppIds]);

  useEffect(() => {
    if (!homeTabOptions.includes(homeTab)) {
      setHomeTab(homeTabOptions[0]);
    }
  }, [homeTabOptions, homeTab]);

  useEffect(() => {
    void refreshFootprint();
    refreshInstallDebug();
  }, []);

  useEffect(() => {
    if (!activeManifest) void refreshFootprint();
  }, [activeManifest]);

  useEffect(() => {
    void syncInstalledApps();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const popStateHandler = (event: PopStateEvent) => {
      const nextRoute = routeFromLocation();
      const guardState = (event.state as { slapRootGuard?: string } | null)?.slapRootGuard;

      if (isStandaloneDisplayMode() && nextRoute.kind === "launcher" && guardState === ROOT_GUARD_BASE) {
        window.history.pushState({ slapRootGuard: ROOT_GUARD_ACTIVE }, "", pathWithBase("/"));
      }

      setRoute((current) => (routesMatch(current, nextRoute) ? current : nextRoute));
    };

    window.addEventListener("popstate", popStateHandler);
    return () => window.removeEventListener("popstate", popStateHandler);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isStandalone || route.kind !== "launcher") return;

    const currentState = window.history.state as { slapRootGuard?: string } | null;
    if (currentState?.slapRootGuard === ROOT_GUARD_ACTIVE) return;

    const launcherPath = pathWithBase("/");
    window.history.replaceState({ slapRootGuard: ROOT_GUARD_BASE }, "", launcherPath);
    window.history.pushState({ slapRootGuard: ROOT_GUARD_ACTIVE }, "", launcherPath);
  }, [isStandalone, route.kind]);

  useEffect(() => {
    if (!activeRouteAppId) {
      setActiveManifest(null);
      return;
    }

    const app = appCatalogById.get(activeRouteAppId);
    if (!app || !installedApps[activeRouteAppId]) {
      setLauncherError("That app is not installed.");
      navigateToLauncher({ replace: true });
      return;
    }

    let cancelled = false;
    setLauncherError(null);

    void app
      .loadManifest()
      .then((manifest) => {
        if (!cancelled) setActiveManifest(manifest);
      })
      .catch((error) => {
        if (cancelled) return;
        setLauncherError(error instanceof Error ? error.message : "Unable to load app.");
        navigateToLauncher({ replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [activeRouteAppId, installedApps]);

  useEffect(() => {
    refreshInstallDebug();
  }, [installPromptEvent]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    const updateMode = () => {
      setIsStandalone(isStandaloneDisplayMode());
      refreshInstallDebug();
    };

    const beforeInstallPromptHandler = (event: Event) => {
      event.preventDefault();
      setInstallPromptEvent(event as BeforeInstallPromptEvent);
    };

    const appInstalledHandler = () => {
      setInstallPromptEvent(null);
      setUpdateMessage("App installed to device.");
      refreshInstallDebug();
    };

    updateMode();
    window.addEventListener("beforeinstallprompt", beforeInstallPromptHandler);
    window.addEventListener("appinstalled", appInstalledHandler);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMode);
    } else {
      mediaQuery.addListener(updateMode);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstallPromptHandler);
      window.removeEventListener("appinstalled", appInstalledHandler);
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.removeEventListener("change", updateMode);
      } else {
        mediaQuery.removeListener(updateMode);
      }
    };
  }, []);

  const promptInstall = async () => {
    if (!installPromptEvent) return;

    setLauncherError(null);

    try {
      await installPromptEvent.prompt();
      const choice = await installPromptEvent.userChoice;
      setUpdateMessage(
        choice.outcome === "accepted" ? "Install prompt accepted." : "Install prompt dismissed."
      );
    } catch (error) {
      setLauncherError(error instanceof Error ? error.message : "Unable to show install prompt.");
    } finally {
      setInstallPromptEvent(null);
    }
  };

  const sharePortal = async () => {
    if (typeof window === "undefined") return;
    setLauncherError(null);

    try {
      const url = window.location.href || "https://longjoel.github.io/sucks-less-app-portal/";
      const shareData = {
        title: "SLAP",
        text: "Suck Less App Portal",
        url
      };

      if (navigator.share) {
        await navigator.share(shareData);
        setUpdateMessage("Share sheet opened.");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setUpdateMessage("Link copied to clipboard.");
        return;
      }

      window.prompt("Copy this link:", url);
    } catch (error) {
      const err = error as { name?: string };
      if (err?.name === "AbortError") return;
      setLauncherError(error instanceof Error ? error.message : "Unable to share.");
    }
  };

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

  const uninstallApp = (appId: string) => {
    setInstalledApps((current) => {
      const next = { ...current };
      delete next[appId];
      return next;
    });

    setHiddenAppIds((current) => current.filter((id) => id !== appId));
    setFavoriteAppIds((current) => current.filter((id) => id !== appId));
    setRecentAppIds((current) => current.filter((id) => id !== appId));
    setUpdateMessage(`Uninstalled ${appCatalogById.get(appId)?.title ?? appId}.`);
  };

  const toggleHiddenApp = (appId: string) => {
    setHiddenAppIds((current) =>
      current.includes(appId) ? current.filter((id) => id !== appId) : [...current, appId]
    );
  };

  const toggleFavoriteApp = (appId: string) => {
    setFavoriteAppIds((current) =>
      current.includes(appId) ? current.filter((id) => id !== appId) : [appId, ...current]
    );
  };

  const trackRecentApp = (appId: string) => {
    setRecentAppIds((current) => [appId, ...current.filter((id) => id !== appId)].slice(0, 8));
  };

  const openApp = (app: AppCatalogItem) => {
    trackRecentApp(app.id);
    if (import.meta.env.PROD && app.standalonePath) {
      window.location.assign(app.standalonePath);
      return;
    }

    navigateToRoute({ kind: "app", appId: app.id });
  };

  if (route.kind === "app" && activeManifest && activeCtx) {
    const ActiveApplication = activeManifest.Application;

    return (
      <main className="page">
        <header className="header">
          <div className="header-inline">
            <button type="button" className="back-button" onClick={() => navigateToLauncher()}>
              Back
            </button>
            <h1>{activeManifest.title}</h1>
          </div>
        </header>
        <section className="app-panel">
          <ActiveApplication ctx={activeCtx} />
        </section>
      </main>
    );
  }

  if (route.kind === "manage") {
    return (
      <main className="page">
        <header className="header">
          <div className="header-inline">
            <button type="button" className="back-button" onClick={() => navigateToLauncher()}>
              Back
            </button>
            <h1>Manage Apps</h1>
          </div>
          <p>Install, hide, update, or uninstall app packages.</p>
        </header>

        <div className="slap-button-row">
          <SlapButton
            title={isSyncingApps ? "Checking..." : "Check For Updates"}
            onClick={() => void syncInstalledApps()}
            disabled={isSyncingApps}
          />
        </div>

        {updateMessage ? <p className="status-line">{updateMessage}</p> : null}
        {launcherError ? <p className="status-line">Error: {launcherError}</p> : null}

        <label className="manage-filter-wrap">
          <span>Filter Apps</span>
          <input
            className="slap-input manage-filter-input"
            type="text"
            value={manageFilter}
            onChange={(event) => {
              setManageFilter(event.target.value);
              setManageExpandedId(null);
            }}
            placeholder="Search by name or description"
          />
        </label>

        <section>
          <h2 className="section-title">All Apps</h2>
          <div className="app-grid app-grid-compact">
            {filteredAllAppCatalog.map((app) => {
              const installedRecord = installedApps[app.id] ?? null;
              const hasUpdate = installedRecord ? isVersionNewer(app.version, installedRecord.version) : false;
              const isHidden = hiddenAppIds.includes(app.id);
              const itemId = `all:${app.id}`;
              return (
                <details key={app.id} className="manage-app-item" open={manageExpandedId === itemId}>
                  <summary
                    className="manage-app-summary"
                    onClick={(event) => {
                      event.preventDefault();
                      setManageExpandedId((current) => (current === itemId ? null : itemId));
                    }}
                  >
                    <span className="icon">{app.icon ?? "◻"}</span>
                    <span className="manage-app-copy">
                      <strong>{app.title}</strong>
                      <small>
                        {installedRecord
                          ? `Installed v${installedRecord.version} | Latest v${app.version}`
                          : `Not installed | Latest v${app.version}`}
                        {hasUpdate ? " | Update available" : ""}
                      </small>
                    </span>
                  </summary>
                  <div className="manage-app-body">
                    <span>{app.description}</span>
                    <div className="manage-app-tags">
                      {app.tags.map((tag) => (
                        <span key={`${app.id}:${tag}`} className="manage-inline-tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                    {installedRecord ? (
                      <>
                        <small>{isHidden ? "Hidden on main screen" : "Visible on main screen"}</small>
                        <div className="slap-button-row">
                          <SlapButton
                            title={hasUpdate ? "Install Latest" : "Up To Date"}
                            onClick={() => void updateApp(app, installedRecord.version)}
                            disabled={!hasUpdate}
                          />
                          <SlapButton
                            title={isHidden ? "Unhide" : "Hide"}
                            onClick={() => toggleHiddenApp(app.id)}
                          />
                          <SlapButton title="Uninstall" onClick={() => uninstallApp(app.id)} />
                        </div>
                      </>
                    ) : (
                      <div className="slap-button-row">
                        <SlapButton title="Install" onClick={() => void installApp(app)} />
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
            {filteredAllAppCatalog.length === 0 ? <p className="status-line">No apps match this filter.</p> : null}
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

      <section>
        <h2 className="section-title">Apps</h2>
        {homeTabOptions.length > 1 ? (
          <div className="home-tabs" role="tablist" aria-label="Home app groups">
            {homeTabOptions.includes("favorites") ? (
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === "favorites"}
                className={`home-tab${homeTab === "favorites" ? " is-active" : ""}`}
                onClick={() => setHomeTab("favorites")}
              >
                Favorites ({favoriteVisibleInstalledAppList.length})
              </button>
            ) : null}
            {homeTabOptions.includes("recent") ? (
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === "recent"}
                className={`home-tab${homeTab === "recent" ? " is-active" : ""}`}
                onClick={() => setHomeTab("recent")}
              >
                Recent
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={homeTab === "all"}
              className={`home-tab${homeTab === "all" ? " is-active" : ""}`}
              onClick={() => setHomeTab("all")}
            >
              All
            </button>
          </div>
        ) : null}
        <div className="app-launch-grid">
          {homeActiveList.map(({ catalog }) => (
            <article key={catalog.id} className="app-launch-item">
              <button type="button" className="app-launch-tile" onClick={() => void openApp(catalog)}>
                <span className="icon">{catalog.icon ?? "◻"}</span>
                <span className="tile-caption">{catalog.title}</span>
              </button>
              {homeTab === "all" && cleanupMode ? (
                <button
                  type="button"
                  className="app-remove-badge"
                  aria-label={`Remove ${catalog.title}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    uninstallApp(catalog.id);
                  }}
                >
                  ×
                </button>
              ) : null}
              <button
                type="button"
                className={`app-fav-toggle${favoriteAppIds.includes(catalog.id) ? " is-active" : ""}`}
                aria-label={favoriteAppIds.includes(catalog.id) ? `Unfavorite ${catalog.title}` : `Favorite ${catalog.title}`}
                onClick={() => toggleFavoriteApp(catalog.id)}
              >
                {favoriteAppIds.includes(catalog.id) ? "★" : "☆"}
              </button>
            </article>
          ))}
        </div>
        {homeActiveList.length === 0 ? (
          <p className="status-line">No visible installed apps. Unhide or install apps from Manage Apps.</p>
        ) : null}
      </section>

      {updateMessage ? <p className="status-line">{updateMessage}</p> : null}
      {launcherError ? <p className="status-line">Error: {launcherError}</p> : null}

      <div className="slap-button-row">
        {!isStandalone && installPromptEvent ? (
          <SlapButton title="Install App" onClick={() => void promptInstall()} buttonClassName="install-button" />
        ) : null}
        <SlapButton title={cleanupMode ? "Done" : "Cleanup"} onClick={() => setCleanupMode((current) => !current)} />
        <SlapButton title="Manage Apps" onClick={() => navigateToRoute({ kind: "manage" })} />
        <SlapButton title="Share" onClick={() => void sharePortal()} />
        <SlapButton
          title={isSyncingApps ? "Checking..." : "Check Updates"}
          onClick={() => void syncInstalledApps()}
          disabled={isSyncingApps}
        />
      </div>

      <details className="status-panel">
        <summary className="status-panel-summary">Diagnostics</summary>
        <p className="status-line">
          PWA mode: <strong>{isStandalone ? "Installed" : "Browser tab"}</strong>
        </p>
        <p className="status-line">
          Install debug: <strong>{installDebug.displayModeStandalone ? "display-mode standalone" : "display-mode browser"}</strong>, {" "}
          <strong>{installDebug.iosStandalone ? "ios standalone" : "ios browser"}</strong>
        </p>
        <p className="status-line">
          Manifest link: <strong>{installDebug.manifestLinkPresent ? "present" : "missing"}</strong>, SW controller:{" "}
          <strong>{installDebug.serviceWorkerControlled ? "active" : "none"}</strong>
        </p>
        <p className="status-line">
          beforeinstallprompt seen: <strong>{installDebug.hasBeforeInstallPrompt ? "yes" : "no"}</strong>
        </p>
        <p className="status-line">
          Hidden apps: <strong>{hiddenAppIds.length}</strong>
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
      </details>
    </main>
  );
};

const SlapButton = ({
  title,
  onClick,
  disabled,
  buttonClassName
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  buttonClassName?: string;
}) => (
  <button type="button" className={`slap-button${buttonClassName ? ` ${buttonClassName}` : ""}`} onClick={onClick} disabled={disabled}>
    {title}
  </button>
);
