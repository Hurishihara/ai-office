import { describe, it, expect } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../src/app.js";
import { PreferencesStore, DEFAULT_PREFERENCES } from "../src/preferences.js";

async function app() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "prefs-"));
  return createApp({ preferences: new PreferencesStore(path.join(dir, "preferences.json")) });
}

describe("preferences", () => {
  it("returns defaults when no file exists", async () => {
    const res = await request(await app()).get("/api/preferences");
    expect(res.status).toBe(200);
    expect(res.body).toEqual(DEFAULT_PREFERENCES);
  });
  it("PUT saves and GET returns the saved preferences", async () => {
    const a = await app();
    const p = { tone: "dry", audience: "devs", emoji: "none", hashtags: "2 max", extra: "" };
    expect((await request(a).put("/api/preferences").send(p)).status).toBe(200);
    expect((await request(a).get("/api/preferences")).body).toEqual(p);
  });
  it("rejects an invalid emoji value", async () => {
    const res = await request(await app()).put("/api/preferences").send({ ...DEFAULT_PREFERENCES, emoji: "lots" });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
  });
});
