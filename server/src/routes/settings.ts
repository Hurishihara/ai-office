import { Router } from "express";
import { SettingsSchema, type SettingsStore } from "../settings.js";

export function settingsRouter(store: SettingsStore): Router {
  const r = Router();
  r.get("/", async (_req, res, next) => {
    try { res.json(await store.get()); } catch (e) { next(e); }
  });
  r.put("/", async (req, res, next) => {
    const p = SettingsSchema.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    try { res.json(await store.save(p.data)); } catch (e) { next(e); }
  });
  return r;
}
