import express from "express";
import { preferencesController, type PreferencesUseCases } from "./modules/workspace/preferences/infra/interface/preferences.controller.js";
import { settingsController, type SettingsUseCases } from "./modules/workspace/settings/infra/interface/settings.controller.js";
import type { NoteService } from "./notes/noteService.js";
import { notesRouter } from "./routes/notes.js";
import { modelsController, type ModelsUseCases } from "./modules/workspace/model-catalog/infra/interface/models.controller.js";
import type { AssignmentService } from "./pipeline/assignments.js";
import { assignmentsRouter } from "./routes/assignments.js";
import type { EventBus } from "./core/event-bus.js";
import { eventsRouter } from "./routes/events.js";

export interface AppDeps { // grows one field per task; routers mount only when their dep is present
  preferences: PreferencesUseCases;
  settings: SettingsUseCases;
  notes: NoteService;
  models: ModelsUseCases;
  chromaUrl: string; // only used in the notes 503 message
  assignments: AssignmentService;
  bus: EventBus;
}

export function createApp(deps: Partial<AppDeps> = {}): express.Express {
  const app = express();
  // DNS-rebinding guard: only the local hostnames may talk to this API.
  app.use((req, res, next) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    if (host === "localhost" || host === "127.0.0.1") return next();
    res.status(403).json({ error: "Forbidden host" });
  });
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  if (deps.preferences) app.use("/api/preferences", preferencesController(deps.preferences));
  if (deps.settings) app.use("/api/settings", settingsController(deps.settings));
  if (deps.notes) app.use("/api/notes", notesRouter(deps.notes, deps.chromaUrl ?? "http://localhost:8000"));
  if (deps.models) app.use("/api/models", modelsController(deps.models));
  if (deps.assignments) app.use("/api/assignments", assignmentsRouter(deps.assignments));
  if (deps.bus) app.use("/api/events", eventsRouter(deps.bus));
  return app;
}
