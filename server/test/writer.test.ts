import { describe, it, expect, vi } from "vitest";
import type { RetrievedChunk } from "@ai-office/shared";
import { makeSearchTool, resolveUsedRefs, makeWriter, invokeWithTimeout, MAX_SEARCHES } from "../src/pipeline/writer.js";
import { applyLengthCheck } from "../src/pipeline/qa.js";

const chunk = (noteId: string, chunkIndex: number): RetrievedChunk => ({ noteId, title: `T-${noteId}`, chunkIndex, text: `text ${noteId}/${chunkIndex}`, score: 1 });
const mk = (search: (q: string, k: number) => Promise<RetrievedChunk[]>) => {
  const onSearch = vi.fn();
  return { onSearch, ...makeSearchTool({ search, onSearch }) };
};

describe("search tool", () => {
  it("stops searching after 4 calls", async () => {
    const search = vi.fn(async () => [chunk("a", 0)]);
    const { tool } = mk(search);
    for (let i = 0; i < MAX_SEARCHES; i++) await tool.invoke({ query: "q" });
    expect(await tool.invoke({ query: "q" })).toBe("Search limit reached. Write the post now with the notes you have.");
    expect(search).toHaveBeenCalledTimes(4);
  });
  it("says so when no notes match", async () => {
    const { tool, onSearch } = mk(async () => []);
    expect(await tool.invoke({ query: "zzz" })).toBe("No matching notes found.");
    expect(onSearch).toHaveBeenCalledWith("zzz", 0);
  });
  it("retrieved() de-duplicates chunks across searches", async () => {
    const { tool, retrieved } = mk(async () => [chunk("a", 0), chunk("a", 1)]);
    await tool.invoke({ query: "1" });
    await tool.invoke({ query: "2" });
    expect(retrieved()).toHaveLength(2);
  });
  it("labels notes N1, N2… and reuses a note's ref for its other chunks", async () => {
    const { tool, refs } = mk(async () => [chunk("uuidA", 0), chunk("uuidB", 0), chunk("uuidA", 1)]);
    const text = String(await tool.invoke({ query: "q" }));
    expect(text.match(/\[N\d+\]/g)).toEqual(["[N1]", "[N2]", "[N1]"]);
    expect(refs()).toEqual({ N1: "uuidA", N2: "uuidB" });
  });
});

it("resolveUsedRefs maps refs to note ids and drops unknown ones", () => {
  expect(resolveUsedRefs(["N2", "N9", " n1 ", "N2"], { N1: "uuidA", N2: "uuidB" })).toEqual(["uuidB", "uuidA"]);
});

it("each writer run gets its own search budget", async () => {
  const search = vi.fn(async () => [chunk("a", 0)]);
  const outs: unknown[] = [];
  const runAgent = async ({ tool }: { tool: { invoke: (i: { query: string }) => Promise<unknown> } }) => {
    for (let i = 0; i < MAX_SEARCHES; i++) outs.push(await tool.invoke({ query: "q" }));
    return { post: "p", usedRefs: ["N1"] };
  };
  const write = makeWriter({ model: async () => ({}) as never, search, runAgent: runAgent as never });
  const input = { platform: "x" as const, ask: "a", preferences: { tone: "", audience: "", emoji: "none" as const, hashtags: "", extra: "" }, onSearch: () => {} };
  await write(input);
  const r = await write(input);
  expect(search).toHaveBeenCalledTimes(8);
  expect(outs.some((o) => String(o).startsWith("Search limit"))).toBe(false);
  expect(r.usedNoteIds).toEqual(["a"]);
});

it("agent invocations carry a timeout abort signal", async () => {
  const invoke = vi.fn(async () => ({}));
  await invokeWithTimeout({ invoke }, "hi");
  expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ signal: expect.any(AbortSignal) });
});

describe("applyLengthCheck", () => {
  it("forces needs_revision when the draft is too long", () => {
    const r = applyLengthCheck({ verdict: "pass", issues: [], suggestions: [] }, "x", "a".repeat(300));
    expect(r.verdict).toBe("needs_revision");
    expect(r.issues[0]).toBe("Too long for X: 300/280 characters");
  });
  it("leaves a fitting draft's review alone", () => {
    const rev = { verdict: "pass" as const, issues: [], suggestions: ["s"] };
    expect(applyLengthCheck(rev, "x", "a".repeat(200))).toEqual(rev);
  });
});
