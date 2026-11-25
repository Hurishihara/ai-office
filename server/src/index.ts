import { mkdirSync } from "node:fs";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { Settings } from "@ai-office/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PreferencesStore } from "./preferences.js";
import { SettingsStore } from "./settings.js";
import { ChromaVectorIndex } from "./notes/vectorIndex.js";
import { NoteService } from "./notes/noteService.js";
import { ModelCatalog } from "./models/catalog.js";
import { makeChatModel, makeEmbeddings } from "./models/openrouter.js";
import { EventBus } from "./core/event-bus.js";
import { buildGraph } from "./pipeline/graph.js";
import { makeWriter } from "./pipeline/writer.js";
import { makeQa } from "./pipeline/qa.js";
import { AssignmentService } from "./pipeline/assignments.js";

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true }); // SQLite won't create the folder
const index = new ChromaVectorIndex({
  chromaUrl: config.chromaUrl,
  embeddingModel: config.embeddingModel,
  embeddings: makeEmbeddings(config.embeddingModel, config.openrouterApiKey),
});
const preferences = new PreferencesStore(path.join(config.dataDir, "preferences.json"));
const settings = new SettingsStore(path.join(config.dataDir, "settings.json"), { writerModel: config.writerModel, qaModel: config.qaModel });
const bus = new EventBus();
// Read settings on every run so a model switch at reception applies to the next step.
const model = (pick: (s: Settings) => string) => async () => makeChatModel(pick(await settings.get()), config.openrouterApiKey);
const graph = buildGraph({
  writer: makeWriter({ model: model((s) => s.writerModel), search: (q, k) => index.search(q, k) }),
  qa: makeQa({ model: model((s) => s.qaModel) }),
  checkpointer: SqliteSaver.fromConnString(path.join(config.dataDir, "checkpoints.sqlite")),
  emit: (e) => bus.publish(e),
});
const assignments = new AssignmentService({ graph, preferences, indexFile: path.join(config.dataDir, "assignments.json"), bus });
await assignments.load();
const recovered = await assignments.recoverInterrupted();
if (recovered) console.log(`${recovered} assignment(s) were cut off by the last shutdown and are marked for Retry`);
if (!(await index.heartbeat())) console.warn(`Chroma is not reachable at ${config.chromaUrl}. Start it with: docker compose up -d`);

createApp({
  preferences,
  settings,
  notes: new NoteService({ notesDir: path.join(config.dataDir, "notes"), index }),
  catalog: new ModelCatalog({}),
  chromaUrl: config.chromaUrl,
  assignments,
  bus,
}).listen(config.port, "127.0.0.1", () => {
  console.log(`server listening on http://127.0.0.1:${config.port}`);
});
