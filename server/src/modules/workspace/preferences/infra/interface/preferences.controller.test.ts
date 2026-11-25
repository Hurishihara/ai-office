import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { BadRequestError } from "../../../../../core/errors.js";
import type { GetPreferences } from "../../application/usecases/get-preferences.usecase.js";
import type { UpdatePreferences } from "../../application/usecases/update-preferences.usecase.js";
import { preferencesController } from "./preferences.controller.js";

const valid = { tone: "dry", audience: "devs", emoji: "none" as const, hashtags: "2 max", extra: "" };

function setup() {
  const get = { execute: vi.fn().mockResolvedValue(valid) } satisfies Pick<GetPreferences, "execute">;
  const update = { execute: vi.fn().mockResolvedValue(valid) } satisfies Pick<UpdatePreferences, "execute">;
  const app = express().use(express.json()).use("/", preferencesController({ get, update }));
  return { app, get, update };
}

describe("preferencesController", () => {
  it("GET returns the preferences", async () => {
    const { app } = setup();
    expect((await request(app).get("/")).body).toEqual(valid);
  });
  it("PUT strips unknown fields before the use case", async () => {
    const { app, update } = setup();
    expect((await request(app).put("/").send({ ...valid, foo: 1 })).status).toBe(200);
    expect(update.execute).toHaveBeenCalledWith(valid);
  });
  it("PUT with a missing field → 400 and update not called", async () => {
    const { app, update } = setup();
    const { tone: _t, ...rest } = valid;
    const res = await request(app).put("/").send(rest);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("tone");
    expect(update.execute).not.toHaveBeenCalled();
  });
  it("domain BadRequestError → 400 { error }", async () => {
    const { app, update } = setup();
    update.execute.mockRejectedValue(new BadRequestError("emoji: must be one of none, light, heavy"));
    const res = await request(app).put("/").send(valid);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "emoji: must be one of none, light, heavy" });
  });
});
