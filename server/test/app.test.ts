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
  it("rejects requests whose Host isn't localhost (DNS rebinding)", async () => {
    const app = createApp({});
    const bad = await request(app).get("/api/health").set("Host", "evil.example:3001");
    expect(bad.status).toBe(403);
    expect(bad.body).toEqual({ error: expect.any(String) });
    expect((await request(app).get("/api/health").set("Host", "localhost:3001")).status).toBe(200);
    expect((await request(app).get("/api/health").set("Host", "127.0.0.1:3001")).status).toBe(200);
  });
  it("loadConfig applies defaults and requires the API key", () => {
    expect(() => loadConfig({})).toThrow(/OPENROUTER_API_KEY/);
    const c = loadConfig({ OPENROUTER_API_KEY: "k", WRITER_MODEL: "w", QA_MODEL: "q", EMBEDDING_MODEL: "e" });
    expect(c.port).toBe(3001);
    expect(c.chromaUrl).toBe("http://localhost:8000");
  });
});
