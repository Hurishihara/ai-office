import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MarkdownTextSplitter, RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { UUID_RE, type CreateNoteBody, type NoteSummary, type RetrievedChunk } from "@ai-office/shared";
import { parseNote, serializeNote, type NoteMeta } from "./noteFile.js";
import type { VectorIndex } from "./vectorIndex.js";

type Splitter = (text: string, source: string) => Promise<string[]>;

const defaultSplitter: Splitter = (text, source) => {
  const opts = { chunkSize: 800, chunkOverlap: 100 };
  const s = /\.md$/i.test(source) ? new MarkdownTextSplitter(opts) : new RecursiveCharacterTextSplitter(opts);
  return s.splitText(text);
};

export class NoteService {
  private notesDir: string;
  private index: VectorIndex;
  private splitter: Splitter;

  constructor(opts: { notesDir: string; index: VectorIndex; splitter?: Splitter }) {
    this.notesDir = opts.notesDir;
    this.index = opts.index;
    this.splitter = opts.splitter ?? defaultSplitter;
  }

  heartbeat(): Promise<boolean> { return this.index.heartbeat(); }

  private async indexNote(meta: NoteMeta, text: string): Promise<void> {
    const pieces = await this.splitter(text, meta.source);
    await this.index.addChunks(pieces.map((t, chunkIndex) => ({
      id: `${meta.id}:${chunkIndex}`, text: t,
      metadata: { noteId: meta.id, title: meta.title, source: meta.source, chunkIndex, createdAt: meta.createdAt },
    })));
  }

  async add(input: CreateNoteBody): Promise<NoteSummary> {
    const meta: NoteMeta = { id: randomUUID(), title: input.title.trim(), source: input.source, createdAt: new Date().toISOString() };
    await fs.mkdir(this.notesDir, { recursive: true });
    const file = path.join(this.notesDir, `${meta.id}.md`);
    await fs.writeFile(file, serializeNote(meta, input.text), "utf8");
    try {
      await this.indexNote(meta, input.text);
    } catch (e) { // don't leave a note on disk that search can't find
      await fs.rm(file, { force: true });
      await this.index.deleteByNote(meta.id).catch(() => {});
      throw e;
    }
    return { ...meta, preview: input.text.slice(0, 140) };
  }

  private async readAll(): Promise<{ meta: NoteMeta; text: string }[]> {
    let names: string[];
    try { names = await fs.readdir(this.notesDir); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    return Promise.all(names.filter((n) => n.endsWith(".md"))
      .map(async (n) => parseNote(await fs.readFile(path.join(this.notesDir, n), "utf8"))));
  }

  async list(): Promise<NoteSummary[]> {
    return (await this.readAll())
      .sort((a, b) => b.meta.createdAt.localeCompare(a.meta.createdAt))
      .map(({ meta, text }) => ({ ...meta, preview: text.slice(0, 140) }));
  }

  async remove(id: string): Promise<boolean> {
    if (!UUID_RE.test(id)) return false;
    try { await fs.unlink(path.join(this.notesDir, `${id}.md`)); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw e;
    }
    await this.index.deleteByNote(id);
    return true;
  }

  search(query: string, k: number): Promise<RetrievedChunk[]> { return this.index.search(query, k); }

  async reindex(): Promise<number> {
    const notes = await this.readAll();
    await this.index.reset();
    for (const n of notes) await this.indexNote(n.meta, n.text);
    return notes.length;
  }
}
