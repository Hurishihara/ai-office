import { describe, expect, it } from "vitest";
import type { RetrievedChunk } from "@ai-office/shared";
import { splitSources } from "../src/ui/sources";

const c = (noteId: string, chunkIndex: number, score: number): RetrievedChunk => ({ noteId, title: `T${noteId}`, chunkIndex, text: `${noteId}${chunkIndex}`, score });

describe("splitSources", () => {
  it("splits notes into used (in cited order) and found-not-used (by score)", () => {
    const r = splitSources([c("a", 0, 0.9), c("b", 0, 0.5), c("a", 1, 0.7), c("d", 0, 0.8)], ["b", "a"]);
    expect(r.used.map((x) => x.noteId)).toEqual(["b", "a"]);
    expect(r.used[1].excerpts).toEqual(["a0", "a1"]);
    expect(r.used[1].bestScore).toBe(0.9);
    expect(r.unused.map((x) => x.noteId)).toEqual(["d"]);
  });
  it("orders unused by best score and merges chunks by chunkIndex", () => {
    const r = splitSources([c("x", 2, 0.1), c("y", 0, 0.6), c("x", 0, 0.3)], []);
    expect(r.unused.map((x) => x.noteId)).toEqual(["y", "x"]);
    expect(r.unused[1].excerpts).toEqual(["x0", "x2"]);
  });
  it("no retrieved notes gives two empty lists", () => {
    expect(splitSources([], [])).toEqual({ used: [], unused: [] });
  });
});
