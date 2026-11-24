import { describe, it, expect, vi } from "vitest";
import { MemorySaver, Command } from "@langchain/langgraph";
import type { ServerEvent, QaReview } from "@ai-office/shared";
import { buildGraph, nextAfterHuman } from "../src/pipeline/graph.js";

const prefs = { tone: "t", audience: "a", emoji: "none" as const, hashtags: "", extra: "" };
const review: QaReview = { verdict: "pass", issues: [], suggestions: [] };
const cfg = { configurable: { thread_id: "t1" } };

function setup() {
  let n = 0;
  const writer = vi.fn(async (input: any) => {
    input.onSearch("q", 2);
    n++;
    return { post: `draft ${n}`, usedNoteIds: ["a"], retrievedNotes: [
      { noteId: "a", title: "A", chunkIndex: 0, text: "x", score: 1 }, { noteId: "b", title: "B", chunkIndex: 0, text: "y", score: 1 }] };
  });
  const qa = vi.fn(async (_: any) => review);
  const events: ServerEvent[] = [];
  const graph = buildGraph({ writer, qa, checkpointer: new MemorySaver(), emit: (e) => events.push(e) });
  const initial = { assignmentId: "as1", platform: "x" as const, ask: "post", preferences: prefs, draft: null, retrievedNotes: [], usedNoteIds: [], qaReview: null, userDecision: null, round: 1, status: "writing" as const, finalPost: null };
  return { writer, qa, events, graph, initial };
}
const resume = (g: any, v: unknown) => g.invoke(new Command({ resume: v }), cfg);

describe("pipeline graph", () => {
  it("runs write → qa and pauses for the human", async () => {
    const { graph, initial, writer, qa } = setup();
    const out: any = await graph.invoke(initial, cfg);
    expect(out.__interrupt__[0].value).toMatchObject({ draft: "draft 1", round: 1, canRevise: true });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(qa.mock.calls[0][0].usedNotes.map((c: any) => c.noteId)).toEqual(["a"]);
  });
  it("approve ends with the final post", async () => {
    const { graph, initial } = setup();
    await graph.invoke(initial, cfg);
    const out: any = await resume(graph, { action: "approve" });
    expect(out.finalPost).toBe("draft 1");
    expect(out.status).toBe("approved");
  });
  it("revise loops back with round 2 and passes feedback to the writer", async () => {
    const { graph, initial, writer } = setup();
    await graph.invoke(initial, cfg);
    const out: any = await resume(graph, { action: "revise", feedback: "shorter" });
    expect((writer.mock.calls[1] as any[])[0].revision).toMatchObject({ previousDraft: "draft 1", feedback: "shorter", qaReview: review });
    expect(out.__interrupt__[0].value).toMatchObject({ round: 2, draft: "draft 2" });
  });
  it("round 3 reports canRevise false", async () => {
    const { graph, initial } = setup();
    await graph.invoke(initial, cfg);
    await resume(graph, { action: "revise" });
    const out: any = await resume(graph, { action: "revise" });
    expect(out.__interrupt__[0].value).toMatchObject({ round: 3, canRevise: false });
  });
  it("nextAfterHuman never loops past round 3", () => {
    expect(nextAfterHuman({ round: 3, userDecision: { action: "revise" } } as any)).toBe("__end__");
    expect(nextAfterHuman({ round: 2, userDecision: { action: "revise" } } as any)).toBe("write");
  });
  it("discard ends without a final post", async () => {
    const { graph, initial } = setup();
    await graph.invoke(initial, cfg);
    const out: any = await resume(graph, { action: "discard" });
    expect(out.status).toBe("discarded");
    expect(out.finalPost).toBeNull();
  });
  it("emits search, handoff and agent events in order", async () => {
    const { graph, initial, events } = setup();
    await graph.invoke(initial, cfg);
    const tags = events.map((e) => (e.type === "agent" ? `agent ${e.agent} ${e.state}` : e.type));
    expect(tags).toEqual(["agent writer thinking", "search", "agent writer idle", "handoff", "agent qa thinking", "agent qa waiting"]);
  });
});
