import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";

describe("app", () => {
  it("GET /api/health returns ok", async () => {
    const res = await request(createApp({})).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
  it("loadConfig applies defaults and requires the API key", () => {
    expect(() => loadConfig({})).toThrow(/OPENROUTER_API_KEY/);
    const c = loadConfig({ OPENROUTER_API_KEY: "k", WRITER_MODEL: "w", QA_MODEL: "q", EMBEDDING_MODEL: "e" });
    expect(c.port).toBe(3001);
    expect(c.chromaUrl).toBe("http://localhost:8000");
  });
});
