import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles.css";

const updateSW = registerSW({
  onNeedRefresh() {
    const shouldReload = window.confirm(
      "A new version is available. Reload now to update the app?"
    );
    if (shouldReload) {
      void updateSW(true);
    }
  }
});

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
