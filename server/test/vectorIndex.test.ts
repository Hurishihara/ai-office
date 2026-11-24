import { describe, it, expect } from "vitest";
import { collectionName } from "../src/notes/vectorIndex.js";

describe("vectorIndex", () => {
  it("collectionName makes a valid Chroma name", () => {
    expect(collectionName("nvidia/nemotron-3.5-embed-1b:free")).toBe("notes__nvidia-nemotron-3.5-embed-1b-free");
  });
  it("collectionName trims trailing non-alphanumerics", () => {
    expect(collectionName("a/b:")).toBe("notes__a-b");
  });
});
