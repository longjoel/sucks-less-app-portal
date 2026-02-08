import { useMemo, useState } from "react";
import { calculatorManifest } from "@slap/calculator";
import { createSlapAppContext, type SlapApplicationManifest } from "@slap/sdk";

const appRegistry: SlapApplicationManifest[] = [calculatorManifest];

export const App = () => {
  const [activeAppId, setActiveAppId] = useState<string | null>(null);

  const activeApp = useMemo(
    () => appRegistry.find((app) => app.id === activeAppId) ?? null,
    [activeAppId]
  );

  const activeCtx = useMemo(
    () => (activeApp ? createSlapAppContext(activeApp.id) : null),
    [activeApp]
  );

  if (activeApp && activeCtx) {
    const ActiveApplication = activeApp.Application;
    return (
      <main className="page">
        <header className="header">
          <button type="button" className="back-button" onClick={() => setActiveAppId(null)}>
            Back
          </button>
          <h1>{activeApp.title}</h1>
        </header>
        <section className="app-panel">
          <ActiveApplication ctx={activeCtx} />
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
      <section className="app-grid">
        {appRegistry.map((app) => {
          const Preview = app.Preview;
          return (
            <button key={app.id} type="button" className="app-card" onClick={() => setActiveAppId(app.id)}>
              <span className="icon">{app.icon ?? "◻"}</span>
              <div className="card-copy">
                <strong>{app.title}</strong>
                <span>{app.description}</span>
                <small>by {app.author}</small>
              </div>
              <div className="preview">
                <Preview />
              </div>
            </button>
          );
        })}
      </section>
    </main>
  );
};
