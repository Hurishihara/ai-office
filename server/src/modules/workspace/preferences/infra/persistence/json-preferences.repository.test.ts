import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Preferences } from "../../domain/preferences.js";
import { JsonPreferencesRepository } from "./json-preferences.repository.js";

const d = { tone: "dry", audience: "devs", emoji: "none" as const, hashtags: "2 max", extra: "" };
let file: string;
let repo: JsonPreferencesRepository;
beforeEach(async () => {
  file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "prefs-")), "preferences.json");
  repo = new JsonPreferencesRepository(file);
});

describe("JsonPreferencesRepository", () => {
  it("round-trips through the file in the existing shape", async () => {
    await repo.save(Preferences.create(d));
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(d);
    expect((await repo.get())?.toJSON()).toEqual(d);
  });
  it("missing file → null", async () => expect(await repo.get()).toBeNull());
  it("malformed JSON → error naming the file", async () => {
    await fs.writeFile(file, "{");
    await expect(repo.get()).rejects.toThrow(file);
  });
  it("invalid stored file → error naming the file", async () => {
    await fs.writeFile(file, JSON.stringify({ ...d, emoji: "lots" }));
    await expect(repo.get()).rejects.toThrow(file);
  });
});
