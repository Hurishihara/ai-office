import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { promises as fs, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { RetrievedChunk } from "@ai-office/shared";
import { createApp } from "../src/app.js";
import { NoteService } from "../src/notes/noteService.js";
import { parseNote, serializeNote } from "../src/notes/noteFile.js";
import type { ChunkMeta, VectorIndex } from "../src/notes/vectorIndex.js";

class FakeVectorIndex implements VectorIndex {
  chunks: { id: string; text: string; metadata: ChunkMeta }[] = [];
  up = true;
  async addChunks(c: { id: string; text: string; metadata: ChunkMeta }[]) { this.chunks.push(...c); }
  async deleteByNote(noteId: string) { this.chunks = this.chunks.filter((c) => c.metadata.noteId !== noteId); }
  async search(query: string, k: number): Promise<RetrievedChunk[]> {
    return this.chunks.filter((c) => c.text.includes(query)).slice(0, k)
      .map((c) => ({ noteId: c.metadata.noteId, title: c.metadata.title, chunkIndex: c.metadata.chunkIndex, text: c.text, score: 1 }));
  }
  async reset() { this.chunks = []; }
  async heartbeat() { return this.up; }
}

let tmpRoot: string, notesDir: string, fake: FakeVectorIndex, app: ReturnType<typeof createApp>, notes: NoteService;
beforeEach(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "notes-"));
  notesDir = path.join(tmpRoot, "notes");
  fake = new FakeVectorIndex();
  notes = new NoteService({ notesDir, index: fake });
  app = createApp({ notes, chromaUrl: "http://localhost:8000" });
});
const post = (b: object) => request(app).post("/api/notes").send(b);

describe("notes", () => {
  it("accepts a typed note, writes the file and indexes tagged chunks", async () => {
    const res = await post({ title: "CLI", text: "Shipped v2 of my CLI", source: "typed" });
    expect(res.status).toBe(201);
    const raw = await fs.readFile(path.join(notesDir, `${res.body.id}.md`), "utf8");
    expect(parseNote(raw).text).toBe("Shipped v2 of my CLI");
    expect(fake.chunks.length).toBeGreaterThan(0);
    expect(fake.chunks.every((c) => c.metadata.noteId === res.body.id)).toBe(true);
    expect(fake.chunks[0].id).toBe(`${res.body.id}:0`);
    expect((await request(app).get("/api/notes")).body[0].preview).toBe("Shipped v2 of my CLI");
  });
  it("rejects a .pdf source", async () => {
    const res = await post({ title: "x", text: "hi", source: "a.pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Only .txt and .md files are supported");
  });
  it("rejects whitespace-only text", async () => {
    const res = await post({ title: "x", text: "  \n ", source: "typed" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Note is empty");
  });
  it("accepts a 500 KB note", async () => {
    expect((await post({ title: "big", text: "a".repeat(500_000), source: "typed" })).status).toBe(201);
  });
  it("rejects a note over 1 MB with the validator message, not 413", async () => {
    const res = await post({ title: "big", text: "a".repeat(1_048_577), source: "typed" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Note is over 1 MB");
  });
  it("DELETE removes the file and its chunks", async () => {
    const { body } = await post({ title: "t", text: "hello", source: "typed" });
    expect((await request(app).delete(`/api/notes/${body.id}`)).status).toBe(204);
    expect(existsSync(path.join(notesDir, `${body.id}.md`))).toBe(false);
    expect(fake.chunks.some((c) => c.metadata.noteId === body.id)).toBe(false);
  });
  it("DELETE unknown id → 404", async () => {
    expect((await request(app).delete("/api/notes/00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
  it("DELETE with a path-traversal id is refused and touches no file", async () => {
    const victim = path.join(tmpRoot, "keep.md");
    await fs.writeFile(victim, "x");
    const res = await request(app).delete("/api/notes/..%2Fkeep");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invalid note id");
    expect(existsSync(victim)).toBe(true);
    expect(await notes.remove("../keep")).toBe(false);
  });
  it("a markdown note containing --- round-trips unchanged", () => {
    const text = "# Title\n\nintro\n\n---\n\nafter the rule\n---\nend";
    const meta = { id: "i", title: "T", source: "typed", createdAt: "2026-01-01T00:00:00.000Z" };
    expect(parseNote(serializeNote(meta, text))).toEqual({ meta, text });
  });
  it("returns 503 with the docker hint when Chroma is down", async () => {
    fake.up = false;
    const expected = { error: "Chroma is not reachable at http://localhost:8000. Start it with: docker compose up -d" };
    for (const r of [request(app).get("/api/notes"), post({ title: "t", text: "hi", source: "typed" })]) {
      const res = await r;
      expect(res.status).toBe(503);
      expect(res.body).toEqual(expected);
    }
    expect(existsSync(notesDir) ? await fs.readdir(notesDir) : []).toEqual([]);
  });
  it("returns 503 when the index throws a connection error mid-request", async () => {
    fake.addChunks = async () => { throw new TypeError("fetch failed"); };
    const res = await post({ title: "t", text: "hi", source: "typed" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("Chroma is not reachable at http://localhost:8000. Start it with: docker compose up -d");
  });
  it("DELETE keeps the file when the index delete fails, and a retry succeeds", async () => {
    const { body } = await post({ title: "t", text: "hello", source: "typed" });
    const orig = fake.deleteByNote.bind(fake);
    fake.deleteByNote = async () => { fake.deleteByNote = orig; throw new Error("boom"); };
    expect((await request(app).delete(`/api/notes/${body.id}`)).status).toBe(500);
    expect(existsSync(path.join(notesDir, `${body.id}.md`))).toBe(true);
    expect((await request(app).delete(`/api/notes/${body.id}`)).status).toBe(204);
    expect(fake.chunks).toEqual([]);
  });
  it("reindex re-adds every note file after reset", async () => {
    await post({ title: "a", text: "alpha", source: "typed" });
    await post({ title: "b", text: "beta", source: "typed" });
    await fake.reset();
    expect(fake.chunks).toEqual([]);
    expect(await notes.reindex()).toBe(2);
    expect(fake.chunks.length).toBe(2);
  });
});
