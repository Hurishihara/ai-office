import path from "node:path";
import { OpenAIEmbeddings } from "@langchain/openai";
import { loadConfig } from "../src/config.js";
import { ChromaVectorIndex } from "../src/notes/vectorIndex.js";
import { NoteService } from "../src/notes/noteService.js";

const config = loadConfig();
// Task 4 replaces this inline construction with makeEmbeddings(config).
const embeddings = new OpenAIEmbeddings({
  model: config.embeddingModel,
  apiKey: config.openrouterApiKey,
  configuration: { baseURL: "https://openrouter.ai/api/v1" },
});
const index = new ChromaVectorIndex({ chromaUrl: config.chromaUrl, embeddingModel: config.embeddingModel, embeddings });
const notes = new NoteService({ notesDir: path.join(config.dataDir, "notes"), index });

if (!(await index.heartbeat())) throw new Error(`Chroma is not reachable at ${config.chromaUrl}. Start it with: docker compose up -d`);
console.log(`Reindexed ${await notes.reindex()} notes`);
