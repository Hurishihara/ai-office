import express from "express";

export interface AppDeps {} // grows one field per task; routers mount only when their dep is present

export function createApp(_deps: Partial<AppDeps> = {}): express.Express {
  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
