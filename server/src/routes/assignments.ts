import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { PLATFORMS, type Platform } from "@ai-office/shared";
import { BadRequestError, ConflictError, NotFoundError, type AssignmentService } from "../pipeline/assignments.js";

const StartSchema = z.object({ platform: z.enum(PLATFORMS as [Platform, ...Platform[]]), ask: z.string().min(1).max(2000) });
const DecisionSchema = z.object({ action: z.enum(["approve", "revise", "discard"]), feedback: z.string().optional() });

const issues = (e: z.ZodError) => e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");

export function assignmentsRouter(assignments: AssignmentService): Router {
  const r = Router();
  r.post("/", async (req, res, next) => {
    const p = StartSchema.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: issues(p.error) });
    try { res.status(202).json(await assignments.start(p.data)); } catch (e) { next(e); }
  });
  r.get("/", async (_req, res, next) => {
    try { res.json(await assignments.list()); } catch (e) { next(e); }
  });
  r.get("/:id", async (req, res, next) => {
    try {
      const view = await assignments.get(req.params.id);
      if (!view) return void res.status(404).json({ error: "Assignment not found" });
      res.json(view);
    } catch (e) { next(e); }
  });
  r.post("/:id/decision", async (req, res, next) => {
    const p = DecisionSchema.safeParse(req.body);
    if (!p.success) return void res.status(400).json({ error: issues(p.error) });
    try { res.json(await assignments.decide(req.params.id, p.data)); } catch (e) { next(e); }
  });
  r.post("/:id/retry", async (req, res, next) => {
    try { res.json(await assignments.retry(req.params.id)); } catch (e) { next(e); }
  });
  r.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const status = err instanceof NotFoundError ? 404 : err instanceof ConflictError ? 409 : err instanceof BadRequestError ? 400 : 0;
    if (!status) return next(err);
    res.status(status).json({ error: (err as Error).message });
  });
  return r;
}
