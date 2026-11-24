import { Router } from "express";
import { UUID_RE } from "@ai-office/shared";
import type { NoteService } from "../notes/noteService.js";
import { validateNoteInput } from "../notes/validate.js";

export function notesRouter(notes: NoteService, chromaUrl: string): Router {
  const r = Router();
  r.use(async (_req, res, next) => {
    try {
      if (await notes.heartbeat()) return next();
      res.status(503).json({ error: `Chroma is not reachable at ${chromaUrl}. Start it with: docker compose up -d` });
    } catch (e) { next(e); }
  });
  r.get("/", async (_req, res, next) => {
    try { res.json(await notes.list()); } catch (e) { next(e); }
  });
  r.post("/", async (req, res, next) => {
    const v = validateNoteInput(req.body);
    if (!v.ok) return void res.status(400).json({ error: v.error });
    try { res.status(201).json(await notes.add(v.value)); } catch (e) { next(e); }
  });
  r.delete("/:id", async (req, res, next) => {
    if (!UUID_RE.test(req.params.id)) return void res.status(400).json({ error: "Invalid note id" });
    try { res.sendStatus((await notes.remove(req.params.id)) ? 204 : 404); } catch (e) { next(e); }
  });
  return r;
}
