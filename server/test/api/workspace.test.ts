import { describe, it, expect } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../../src/app.js";
import { JsonPreferencesRepository } from "../../src/modules/workspace/preferences/infra/persistence/json-preferences.repository.js";
import { GetPreferences } from "../../src/modules/workspace/preferences/application/usecases/get-preferences.usecase.js";
import { UpdatePreferences } from "../../src/modules/workspace/preferences/application/usecases/update-preferences.usecase.js";
import { Preferences } from "../../src/modules/workspace/preferences/domain/preferences.js";
import { JsonSettingsRepository } from "../../src/modules/workspace/settings/infra/persistence/json-settings.repository.js";
import { GetSettings } from "../../src/modules/workspace/settings/application/usecases/get-settings.usecase.js";
import { UpdateSettings } from "../../src/modules/workspace/settings/application/usecases/update-settings.usecase.js";

const DEFAULT_PREFERENCES = Preferences.defaults().toJSON();

async function app() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "prefs-"));
  const repo = new JsonPreferencesRepository(path.join(dir, "preferences.json"));
  return createApp({ preferences: { get: new GetPreferences(repo), update: new UpdatePreferences(repo) } });
}

describe("preferences", () => {
  it("invalid stored file → GET 500 and the file is left untouched", async () => {
    const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "prefs-")), "preferences.json");
    const bytes = JSON.stringify({ ...DEFAULT_PREFERENCES, emoji: "lots" });
    await fs.writeFile(file, bytes);
    const repo = new JsonPreferencesRepository(file);
    const a = createApp({ preferences: { get: new GetPreferences(repo), update: new UpdatePreferences(repo) } });
    expect((await request(a).get("/api/preferences")).status).toBe(500);
    expect(await fs.readFile(file, "utf8")).toBe(bytes);
  });
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

const defaults = { writerModel: "w", qaModel: "q" };
const tmpFile = async () => path.join(await fs.mkdtemp(path.join(os.tmpdir(), "settings-")), "settings.json");
const settingsApp = (file: string) => {
  const repo = new JsonSettingsRepository(file);
  return createApp({ settings: { get: new GetSettings(repo, defaults), update: new UpdateSettings(repo) } });
};

describe("settings", () => {
  it("falls back to the defaults passed in from .env", async () => {
    const res = await request(settingsApp(await tmpFile())).get("/api/settings");
    expect(res.body).toEqual(defaults);
  });
  it("PUT persists the chosen models", async () => {
    const file = await tmpFile();
    const chosen = { writerModel: "w2", qaModel: "q2" };
    const res = await request(settingsApp(file)).put("/api/settings").send(chosen);
    expect(res.status).toBe(200);
    expect(await new GetSettings(new JsonSettingsRepository(file), defaults).execute()).toEqual(chosen);
  });
  it("rejects an empty model id", async () => {
    const res = await request(settingsApp(await tmpFile())).put("/api/settings").send({ writerModel: "", qaModel: "q" });
    expect(res.status).toBe(400);
  });
});
