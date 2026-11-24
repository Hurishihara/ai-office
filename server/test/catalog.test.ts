import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import fixture from "./fixtures/openrouter-models.json" with { type: "json" };
import { ModelCatalog, filterModels, toModelInfo } from "../src/models/catalog.js";
import { createApp } from "../src/app.js";

const okFetch = () => vi.fn(async () => new Response(JSON.stringify(fixture))) as unknown as typeof fetch;
const all = fixture.data.map(toModelInfo);

describe("model catalog", () => {
  it("writer list = free, tool-capable only by default", () => {
    expect(filterModels(all, { role: "writer", freeOnly: true }).map((m) => m.id)).toEqual(["free/tools"]);
  });
  it("freeOnly=false adds paid tool-capable models", () => {
    expect(filterModels(all, { role: "qa", freeOnly: false }).map((m) => m.id)).toEqual(["free/tools", "paid/tools"]);
  });
  it("caches for an hour", async () => {
    let t = 0;
    const fetchFn = okFetch();
    const c = new ModelCatalog({ fetchFn, now: () => t });
    await c.list();
    t = 3_599_999;
    await c.list();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    t = 3_600_001;
    await c.list();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
  it("serves stale cache when OpenRouter is unreachable", async () => {
    let t = 0;
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(fixture))).mockRejectedValueOnce(new Error("down"));
    const c = new ModelCatalog({ fetchFn: fetchFn as unknown as typeof fetch, now: () => t });
    await c.list();
    t = 4_000_000;
    expect(await c.list()).toHaveLength(4);
  });
  it("throws when unreachable with no cache", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch;
    await expect(new ModelCatalog({ fetchFn }).list()).rejects.toThrow("down");
  });
  it("GET /api/models filters and defaults to freeOnly", async () => {
    const app = createApp({ catalog: new ModelCatalog({ fetchFn: okFetch() }) });
    expect((await request(app).get("/api/models?role=writer")).body.map((m: { id: string }) => m.id)).toEqual(["free/tools"]);
    expect((await request(app).get("/api/models?role=qa&freeOnly=false")).body).toHaveLength(2);
  });
});
