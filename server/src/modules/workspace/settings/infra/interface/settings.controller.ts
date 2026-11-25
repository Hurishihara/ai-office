import { Router } from "express";
import { BadRequestError } from "../../../../../core/errors.js";
import type { GetSettings } from "../../application/usecases/get-settings.usecase.js";
import type { UpdateSettings } from "../../application/usecases/update-settings.usecase.js";
import { settingsDto } from "./settings.dto.js";

export interface SettingsUseCases {
  get: Pick<GetSettings, "execute">;
  update: Pick<UpdateSettings, "execute">;
}

export function settingsController(uc: SettingsUseCases): Router {
  const r = Router();
  r.get("/", async (_req, res, next) => {
    try { res.json(await uc.get.execute()); } catch (e) { next(e); }
  });
  r.put("/", async (req, res, next) => {
    const p = settingsDto.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: p.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    try {
      res.json(await uc.update.execute(p.data));
    } catch (e) {
      if (e instanceof BadRequestError) return void res.status(400).json({ error: e.message });
      next(e);
    }
  });
  return r;
}
