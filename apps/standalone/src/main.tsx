import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createSlapAppContext, type SlapApplicationManifest } from "@slap/sdk";
import { registerSW } from "virtual:pwa-register";
import "../../launcher/src/styles.css";

const root = document.getElementById("root");

const renderError = (message: string) => {
  if (!root) return;
  root.innerHTML = `<main class="page"><p class="slap-inline-text">${message}</p></main>`;
};

const mount = async () => {
  if (!root) {
    return;
  }

  try {
    const module = await import(__APP_ENTRY__);
    const manifest = module[__APP_EXPORT__] as SlapApplicationManifest | undefined;

    if (!manifest) {
      renderError("Unable to load app manifest.");
      return;
    }

    document.title = __APP_TITLE__ || manifest.title;

    const App = manifest.Application;
    const ctx = createSlapAppContext(manifest.id);

    createRoot(root).render(
      <StrictMode>
        <main className="page">
          <App ctx={ctx} />
        </main>
      </StrictMode>
    );
  } catch (error) {
    renderError("Failed to load this app.");
    // eslint-disable-next-line no-console
    console.error(error);
  }
};

void mount();

const updateSW = registerSW({
  onNeedRefresh() {
    const shouldReload = window.confirm("A new version is available. Reload now to update the app?");
    if (shouldReload) {
      void updateSW(true);
    }
  }
});

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});
