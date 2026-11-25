import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson, writeJson } from "./json-file.js";

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), "json-file-")); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe("json-file", () => {
  it("returns the fallback when the file is missing", async () => {
    expect(await readJson(join(dir, "nope.json"), { a: 1 })).toEqual({ a: 1 });
  });
  it("writeJson creates folders and round-trips", async () => {
    const f = join(dir, "x/y.json");
    await writeJson(f, { b: 2 });
    expect(await readJson(f, null)).toEqual({ b: 2 });
  });
  it("rethrows parse errors instead of falling back", async () => {
    await writeFile(join(dir, "bad.json"), "{");
    await expect(readJson(join(dir, "bad.json"), {})).rejects.toThrow();
  });
});
