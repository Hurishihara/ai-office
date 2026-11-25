import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";
import { BadRequestError } from "../../../../../core/errors.js";
import type { GetSettings } from "../../application/usecases/get-settings.usecase.js";
import type { UpdateSettings } from "../../application/usecases/update-settings.usecase.js";
import { settingsController } from "./settings.controller.js";

const valid = { writerModel: "w", qaModel: "q" };

function setup() {
  const get = { execute: vi.fn().mockResolvedValue(valid) } satisfies Pick<GetSettings, "execute">;
  const update = { execute: vi.fn().mockResolvedValue(valid) } satisfies Pick<UpdateSettings, "execute">;
  const app = express().use(express.json()).use("/", settingsController({ get, update }));
  return { app, get, update };
}

describe("settingsController", () => {
  it("GET returns the settings", async () => {
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
    const res = await request(app).put("/").send({ writerModel: "w" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("qaModel");
    expect(update.execute).not.toHaveBeenCalled();
  });
  it("domain BadRequestError → 400 { error }", async () => {
    const { app, update } = setup();
    update.execute.mockRejectedValue(new BadRequestError("writerModel: must not be empty"));
    const res = await request(app).put("/").send(valid);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "writerModel: must not be empty" });
  });
});
