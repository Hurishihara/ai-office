import { describe, it, expect } from "vitest";
import { isAllowedNoteSource, countChars, UUID_RE } from "@ai-office/shared";

describe("rules", () => {
  it("isAllowedNoteSource accepts typed, .txt and .MD only", () => {
    expect(["typed", "a.txt", "b.MD"].every(isAllowedNoteSource)).toBe(true);
    expect(isAllowedNoteSource("c.pdf")).toBe(false);
    expect(isAllowedNoteSource("notes.md.exe")).toBe(false);
  });
  it("countChars counts emoji as one", () => { expect(countChars("😀a")).toBe(2); });
  it("UUID_RE rejects path tricks", () => { expect(UUID_RE.test("../../docs/x")).toBe(false); });
});
