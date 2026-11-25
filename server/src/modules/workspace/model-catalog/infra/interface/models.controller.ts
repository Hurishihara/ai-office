import { Router } from "express";
import type { ListModels } from "../../application/usecases/list-models.usecase.js";
import { modelsQueryDto } from "./models.dto.js";

export interface ModelsUseCases {
  list: Pick<ListModels, "execute">;
}

export function modelsController(uc: ModelsUseCases): Router {
  const r = Router();
  r.get("/", async (req, res) => {
    try {
      res.json(await uc.list.execute(modelsQueryDto(req.query)));
    } catch {
      res.status(502).json({ error: "Could not reach OpenRouter to load the model list. Try again in a moment." });
    }
  });
  return r;
}
