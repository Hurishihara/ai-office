import { describe, it, expect } from "vitest";
import { buildWriterPrompt, buildQaPrompt } from "../src/pipeline/prompts.js";

const preferences = { tone: "dry", audience: "devs", emoji: "none" as const, hashtags: "", extra: "no buzzwords" };

describe("prompts", () => {
  it("writer prompt carries preferences, limit and revision context", () => {
    const s = buildWriterPrompt({ platform: "x", preferences,
      revision: { previousDraft: "OLD", qaReview: { verdict: "needs_revision", issues: ["too salesy"], suggestions: [] }, feedback: "mention v2" } });
    for (const part of ["dry", "devs", "no buzzwords", "280", "OLD", "too salesy", "mention v2", "search_notes", "usedRefs"]) expect(s).toContain(part);
  });
  it("writer prompt omits empty preferences and revision", () => {
    const s = buildWriterPrompt({ platform: "linkedin", preferences });
    expect(s).not.toContain("Hashtags");
    expect(s).not.toContain("Previous draft");
  });
  it("QA prompt includes the used notes' text and the draft", () => {
    const s = buildQaPrompt({ platform: "x", preferences, draft: "MY DRAFT",
      usedNotes: [{ noteId: "a", title: "T1", chunkIndex: 0, text: "chunk one text", score: 1 }] });
    for (const part of ["chunk one text", "T1", "MY DRAFT", "dry"]) expect(s).toContain(part);
  });
});
