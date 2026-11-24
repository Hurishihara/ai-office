import { ChromaClient } from "chromadb";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { RetrievedChunk } from "@ai-office/shared";

export interface ChunkMeta { noteId: string; title: string; source: string; chunkIndex: number; createdAt: string }

export interface VectorIndex {
  addChunks(chunks: { id: string; text: string; metadata: ChunkMeta }[]): Promise<void>;
  deleteByNote(noteId: string): Promise<void>;
  search(query: string, k: number): Promise<RetrievedChunk[]>;
  reset(): Promise<void>;
  heartbeat(): Promise<boolean>;
}

export function collectionName(embeddingModel: string): string {
  return ("notes__" + embeddingModel.replace(/[^a-zA-Z0-9._-]/g, "-")).replace(/[^a-zA-Z0-9]+$/, "");
}

export class ChromaVectorIndex implements VectorIndex {
  private client: ChromaClient;
  private name: string;
  private embeddings: EmbeddingsInterface;

  constructor(opts: { chromaUrl: string; embeddingModel: string; embeddings: EmbeddingsInterface }) {
    const u = new URL(opts.chromaUrl);
    const ssl = u.protocol === "https:";
    this.client = new ChromaClient({ host: u.hostname, port: Number(u.port) || (ssl ? 443 : 80), ssl });
    this.name = collectionName(opts.embeddingModel);
    this.embeddings = opts.embeddings;
  }

  private collection() {
    // embeddingFunction: null — we embed ourselves; otherwise chromadb tries @chroma-core/default-embed and warns
    return this.client.getOrCreateCollection({ name: this.name, configuration: { hnsw: { space: "cosine" } }, embeddingFunction: null });
  }

  async addChunks(chunks: { id: string; text: string; metadata: ChunkMeta }[]): Promise<void> {
    if (!chunks.length) return;
    const col = await this.collection();
    const embeddings = await this.embeddings.embedDocuments(chunks.map((c) => c.text));
    await col.add({ ids: chunks.map((c) => c.id), documents: chunks.map((c) => c.text), metadatas: chunks.map((c) => ({ ...c.metadata })), embeddings });
  }

  async deleteByNote(noteId: string): Promise<void> {
    await (await this.collection()).delete({ where: { noteId } });
  }

  async search(query: string, k: number): Promise<RetrievedChunk[]> {
    const col = await this.collection();
    const r = await col.query({ queryEmbeddings: [await this.embeddings.embedQuery(query)], nResults: k, include: ["documents", "metadatas", "distances"] });
    return (r.ids[0] ?? []).flatMap((_, i) => {
      const m = r.metadatas[0]?.[i], text = r.documents[0]?.[i], d = r.distances[0]?.[i];
      if (!m || text == null || d == null) return [];
      return [{ noteId: String(m.noteId), title: String(m.title), chunkIndex: Number(m.chunkIndex), text, score: 1 - d }];
    });
  }

  async reset(): Promise<void> {
    await this.client.deleteCollection({ name: this.name }).catch(() => {}); // absent collection is fine
  }

  async heartbeat(): Promise<boolean> {
    try { await this.client.heartbeat(); return true; } catch { return false; }
  }
}
