import { describe, it, expect } from "vitest";
import { OpenRouterAuthError, OpenRouterRateLimitError } from "@langchain/openrouter";
import { describeModelError } from "../src/models/openrouter.js";

describe("describeModelError", () => {
  it("maps 429 and 401", () => {
    expect(describeModelError({ status: 429 })).toBe("The model is rate-limited (free tier). Wait a minute or pick another model at reception.");
    expect(describeModelError({ status: 401 })).toBe("OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.");
  });
  it("maps the OpenRouter error classes, which carry statusCode", () => {
    expect(describeModelError(new OpenRouterRateLimitError("slow down", 429))).toBe("The model is rate-limited (free tier). Wait a minute or pick another model at reception.");
    expect(describeModelError(new OpenRouterAuthError("Missing Authentication header", 401))).toBe("OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.");
  });
  it("maps an AbortSignal.timeout abort", () => {
    expect(describeModelError(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe("The model took too long. Press Retry or pick a faster model at reception.");
  });
  it("maps a Chroma connection error to the docker hint", () => {
    const e = Object.assign(new Error("Failed to connect to chromadb"), { name: "ChromaConnectionError" });
    expect(describeModelError(e)).toBe("Chroma is not reachable. Start it with: docker compose up -d");
  });
  it("wraps anything else", () => {
    expect(describeModelError(new Error("boom"))).toBe("Model call failed: boom");
  });
});
