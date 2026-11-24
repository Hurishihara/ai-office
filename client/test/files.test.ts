import { describe, expect, it } from "vitest";
import { filterDroppedFiles } from "../src/ui/files";

describe("filterDroppedFiles", () => {
  it("accepts .txt and .MD, rejects others with the server's reason", () => {
    const r = filterDroppedFiles([{ name: "a.txt", size: 10 }, { name: "b.MD", size: 10 }, { name: "c.pdf", size: 10 }]);
    expect(r.accepted.map((f) => f.name)).toEqual(["a.txt", "b.MD"]);
    expect(r.rejected).toEqual([{ name: "c.pdf", reason: "Only .txt and .md files are supported" }]);
  });
  it("rejects files over 1 MB and empty files", () => {
    const r = filterDroppedFiles([{ name: "big.txt", size: 1_048_577 }, { name: "ok.txt", size: 1_048_576 }, { name: "e.md", size: 0 }]);
    expect(r.accepted.map((f) => f.name)).toEqual(["ok.txt"]);
    expect(r.rejected).toEqual([
      { name: "big.txt", reason: "Note is over 1 MB" },
      { name: "e.md", reason: "Note is empty" },
    ]);
  });
});
