import { describe, it, expect, vi } from "vitest";
import fixture from "../../../../../../test/fixtures/openrouter-models.json" with { type: "json" };
import { OpenRouterModelSource } from "./openrouter-model-source.external.js";

const okFetch = () => vi.fn(async () => new Response(JSON.stringify(fixture))) as unknown as typeof fetch;

describe("OpenRouterModelSource", () => {
  it("caches for an hour", async () => {
    let t = 0;
    const fetchFn = okFetch();
    const c = new OpenRouterModelSource({ fetchFn, now: () => t });
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
    const c = new OpenRouterModelSource({ fetchFn: fetchFn as unknown as typeof fetch, now: () => t });
    await c.list();
    t = 4_000_000;
    expect(await c.list()).toHaveLength(4);
  });
  it("throws when unreachable with no cache", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch;
    await expect(new OpenRouterModelSource({ fetchFn }).list()).rejects.toThrow("down");
  });
});
