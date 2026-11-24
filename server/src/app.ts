import express from "express";
import type { PreferencesStore } from "./preferences.js";
import type { SettingsStore } from "./settings.js";
import { preferencesRouter } from "./routes/preferences.js";
import { settingsRouter } from "./routes/settings.js";

export interface AppDeps { // grows one field per task; routers mount only when their dep is present
  preferences: PreferencesStore;
  settings: SettingsStore;
}

export function createApp(deps: Partial<AppDeps> = {}): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  if (deps.preferences) app.use("/api/preferences", preferencesRouter(deps.preferences));
  if (deps.settings) app.use("/api/settings", settingsRouter(deps.settings));
  return app;
}
