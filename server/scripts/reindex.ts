import path from "node:path";
import { loadConfig } from "../src/config.js";
import { ChromaVectorIndex } from "../src/notes/vectorIndex.js";
import { NoteService } from "../src/notes/noteService.js";
import { makeEmbeddings } from "../src/models/openrouter.js";

const config = loadConfig();
const embeddings = makeEmbeddings(config.embeddingModel, config.openrouterApiKey);
const index = new ChromaVectorIndex({ chromaUrl: config.chromaUrl, embeddingModel: config.embeddingModel, embeddings });
const notes = new NoteService({ notesDir: path.join(config.dataDir, "notes"), index });

if (!(await index.heartbeat())) throw new Error(`Chroma is not reachable at ${config.chromaUrl}. Start it with: docker compose up -d`);
console.log(`Reindexed ${await notes.reindex()} notes`);
