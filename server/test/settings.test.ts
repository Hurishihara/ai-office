import { describe, it, expect } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { SettingsStore } from "../src/settings.js";

const defaults = { writerModel: "w", qaModel: "q" };
const tmpFile = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), "settings-")), "settings.json");

describe("settings", () => {
  it("falls back to the defaults passed in from .env", async () => {
    const res = await request(createApp({ settings: new SettingsStore(await tmpFile(), defaults) })).get("/api/settings");
    expect(res.body).toEqual(defaults);
  });
  it("PUT persists the chosen models", async () => {
    const file = await tmpFile();
    const chosen = { writerModel: "w2", qaModel: "q2" };
    const res = await request(createApp({ settings: new SettingsStore(file, defaults) })).put("/api/settings").send(chosen);
    expect(res.status).toBe(200);
    expect(await new SettingsStore(file, defaults).get()).toEqual(chosen);
  });
  it("rejects an empty model id", async () => {
    const res = await request(createApp({ settings: new SettingsStore(await tmpFile(), defaults) })).put("/api/settings").send({ writerModel: "", qaModel: "q" });
    expect(res.status).toBe(400);
  });
});
