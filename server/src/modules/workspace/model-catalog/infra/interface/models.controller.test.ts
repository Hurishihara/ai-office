import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import type { ListModels } from "../../application/usecases/list-models.usecase.js";
import { modelsController } from "./models.controller.js";

function setup() {
  const list = { execute: vi.fn().mockResolvedValue([]) } satisfies Pick<ListModels, "execute">;
  const app = express().use("/", modelsController({ list }));
  return { app, list };
}

describe("modelsController", () => {
  it("defaults to writer and freeOnly", async () => {
    const { app, list } = setup();
    expect((await request(app).get("/")).status).toBe(200);
    expect(list.execute).toHaveBeenCalledWith({ role: "writer", freeOnly: true });
  });
  it("role=qa and freeOnly=false reach the use case", async () => {
    const { app, list } = setup();
    await request(app).get("/?role=qa&freeOnly=false");
    expect(list.execute).toHaveBeenCalledWith({ role: "qa", freeOnly: false });
  });
  it("anything but freeOnly=false means freeOnly true", async () => {
    const { app, list } = setup();
    await request(app).get("/?freeOnly=0");
    expect(list.execute).toHaveBeenCalledWith({ role: "writer", freeOnly: true });
  });
  it("use case failure → 502 with today's message", async () => {
    const { app, list } = setup();
    list.execute.mockRejectedValue(new Error("down"));
    const res = await request(app).get("/");
    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "Could not reach OpenRouter to load the model list. Try again in a moment." });
  });
});
