import { Router } from "express";
import { filterModels, type ModelCatalog } from "../models/catalog.js";

export function modelsRouter(catalog: ModelCatalog): Router {
  const r = Router();
  r.get("/", async (req, res) => {
    const role = req.query.role === "qa" ? "qa" : "writer";
    const freeOnly = req.query.freeOnly !== "false";
    try {
      res.json(filterModels(await catalog.list(), { role, freeOnly }));
    } catch {
      res.status(502).json({ error: "Could not reach OpenRouter to load the model list. Try again in a moment." });
    }
  });
  return r;
}
