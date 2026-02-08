export interface VirtualFileSystem {
  readText(path: string): Promise<string | null>;
  writeText(path: string, content: string): Promise<void>;
  delete(path: string): Promise<void>;
  listPaths(): Promise<string[]>;
}

export interface SlapApplicationContext {
  appId: string;
  vfs: VirtualFileSystem;
}

export interface SlapApplicationManifest {
  id: string;
  title: string;
  author: string;
  description: string;
  icon?: string;
  Preview: (props: Record<string, never>) => any;
  Application: (props: { ctx: SlapApplicationContext }) => any;
}

const keyFor = (appId: string, path: string) => `slap:v1:${appId}:${path}`;

const keyPrefix = (appId: string) => `slap:v1:${appId}:`;

const inMemoryStore = new Map<string, string>();

const hasLocalStorage = () => {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
};

export const createLocalVfs = (appId: string): VirtualFileSystem => {
  const prefix = keyPrefix(appId);

  return {
    async readText(path) {
      const key = keyFor(appId, path);
      if (hasLocalStorage()) {
        return window.localStorage.getItem(key);
      }
      return inMemoryStore.get(key) ?? null;
    },

    async writeText(path, content) {
      const key = keyFor(appId, path);
      if (hasLocalStorage()) {
        window.localStorage.setItem(key, content);
      } else {
        inMemoryStore.set(key, content);
      }
    },

    async delete(path) {
      const key = keyFor(appId, path);
      if (hasLocalStorage()) {
        window.localStorage.removeItem(key);
      } else {
        inMemoryStore.delete(key);
      }
    },

    async listPaths() {
      if (hasLocalStorage()) {
        const paths: string[] = [];
        for (let i = 0; i < window.localStorage.length; i += 1) {
          const key = window.localStorage.key(i);
          if (key && key.startsWith(prefix)) {
            paths.push(key.slice(prefix.length));
          }
        }
        return paths;
      }

      return [...inMemoryStore.keys()]
        .filter((key) => key.startsWith(prefix))
        .map((key) => key.slice(prefix.length));
    }
  };
};

export const createSlapAppContext = (appId: string): SlapApplicationContext => ({
  appId,
  vfs: createLocalVfs(appId)
});
