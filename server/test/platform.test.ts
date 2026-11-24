import { describe, it, expect } from "vitest";
import { lengthIssue } from "../src/pipeline/platform.js";

describe("lengthIssue", () => {
  it("280 emoji fit on X, 281 do not", () => {
    expect(lengthIssue("x", "😀".repeat(280))).toBeNull();
    expect(lengthIssue("x", "😀".repeat(281))).toBe("Too long for X: 281/280 characters");
  });
  it("LinkedIn allows 3000", () => { expect(lengthIssue("linkedin", "a".repeat(3000))).toBeNull(); });
});
