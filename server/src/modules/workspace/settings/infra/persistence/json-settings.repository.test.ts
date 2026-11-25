import { describe, it, expect, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Settings } from "../../domain/settings.js";
import { JsonSettingsRepository } from "./json-settings.repository.js";

const d = { writerModel: "w", qaModel: "q" };
let file: string;
let repo: JsonSettingsRepository;
beforeEach(async () => {
  file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "settings-")), "settings.json");
  repo = new JsonSettingsRepository(file);
});

describe("JsonSettingsRepository", () => {
  it("round-trips through the file in the existing shape", async () => {
    await repo.save(Settings.create(d));
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toEqual(d);
    expect((await repo.get())?.toJSON()).toEqual(d);
  });
  it("missing file → null", async () => expect(await repo.get()).toBeNull());
  it("malformed JSON → error naming the file", async () => {
    await fs.writeFile(file, "{");
    await expect(repo.get()).rejects.toThrow(file);
  });
  it("invalid stored file → error naming the file", async () => {
    await fs.writeFile(file, JSON.stringify({ ...d, qaModel: "" }));
    await expect(repo.get()).rejects.toThrow(file);
  });
});
