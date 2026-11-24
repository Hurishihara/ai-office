import { describe, it, expect } from "vitest";
import { describeModelError } from "../src/models/openrouter.js";

describe("describeModelError", () => {
  it("maps 429 and 401", () => {
    expect(describeModelError({ status: 429 })).toBe("The model is rate-limited (free tier). Wait a minute or pick another model at reception.");
    expect(describeModelError({ status: 401 })).toBe("OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.");
  });
  it("wraps anything else", () => {
    expect(describeModelError(new Error("boom"))).toBe("Model call failed: boom");
  });
});
