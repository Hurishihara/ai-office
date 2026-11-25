import { Router } from "express";
import { BadRequestError } from "../../../../../core/errors.js";
import type { GetPreferences } from "../../application/usecases/get-preferences.usecase.js";
import type { UpdatePreferences } from "../../application/usecases/update-preferences.usecase.js";
import { preferencesDto } from "./preferences.dto.js";

export interface PreferencesUseCases {
  get: Pick<GetPreferences, "execute">;
  update: Pick<UpdatePreferences, "execute">;
}

export function preferencesController(uc: PreferencesUseCases): Router {
  const r = Router();
  r.get("/", async (_req, res, next) => {
    try { res.json(await uc.get.execute()); } catch (e) { next(e); }
  });
  r.put("/", async (req, res, next) => {
    const p = preferencesDto.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    try {
      // dto types emoji as string; Preferences.create validates the level
      res.json(await uc.update.execute(p.data as Parameters<UpdatePreferences["execute"]>[0]));
    } catch (e) {
      if (e instanceof BadRequestError) return void res.status(400).json({ error: e.message });
      next(e);
    }
  });
  return r;
}
