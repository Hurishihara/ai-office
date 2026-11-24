import express from "express";
import type { PreferencesStore } from "./preferences.js";
import type { SettingsStore } from "./settings.js";
import { preferencesRouter } from "./routes/preferences.js";
import type { NoteService } from "./notes/noteService.js";
import { notesRouter } from "./routes/notes.js";
import type { ModelCatalog } from "./models/catalog.js";
import { modelsRouter } from "./routes/models.js";
import { settingsRouter } from "./routes/settings.js";

export interface AppDeps { // grows one field per task; routers mount only when their dep is present
  preferences: PreferencesStore;
  settings: SettingsStore;
  notes: NoteService;
  catalog: ModelCatalog;
  chromaUrl: string; // only used in the notes 503 message
}

export function createApp(deps: Partial<AppDeps> = {}): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  if (deps.preferences) app.use("/api/preferences", preferencesRouter(deps.preferences));
  if (deps.settings) app.use("/api/settings", settingsRouter(deps.settings));
  if (deps.notes) app.use("/api/notes", notesRouter(deps.notes, deps.chromaUrl ?? "http://localhost:8000"));
  if (deps.catalog) app.use("/api/models", modelsRouter(deps.catalog));
  return app;
}
