import { mkdirSync } from "node:fs";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { Settings } from "@ai-office/shared";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { JsonPreferencesRepository } from "./modules/workspace/preferences/infra/persistence/json-preferences.repository.js";
import { GetPreferences } from "./modules/workspace/preferences/application/usecases/get-preferences.usecase.js";
import { UpdatePreferences } from "./modules/workspace/preferences/application/usecases/update-preferences.usecase.js";
import { JsonSettingsRepository } from "./modules/workspace/settings/infra/persistence/json-settings.repository.js";
import { GetSettings } from "./modules/workspace/settings/application/usecases/get-settings.usecase.js";
import { UpdateSettings } from "./modules/workspace/settings/application/usecases/update-settings.usecase.js";
import { ChromaVectorIndex } from "./notes/vectorIndex.js";
import { NoteService } from "./notes/noteService.js";
import { ListModels } from "./modules/workspace/model-catalog/application/usecases/list-models.usecase.js";
import { OpenRouterModelSource } from "./modules/workspace/model-catalog/infra/external/openrouter-model-source.external.js";
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
const preferencesRepo = new JsonPreferencesRepository(path.join(config.dataDir, "preferences.json"));
const getPreferences = new GetPreferences(preferencesRepo);
const updatePreferences = new UpdatePreferences(preferencesRepo);
const settingsRepo = new JsonSettingsRepository(path.join(config.dataDir, "settings.json"));
const getSettings = new GetSettings(settingsRepo, { writerModel: config.writerModel, qaModel: config.qaModel });
const updateSettings = new UpdateSettings(settingsRepo);
const bus = new EventBus();
// Read settings on every run so a model switch at reception applies to the next step.
const model = (pick: (s: Settings) => string) => async () => makeChatModel(pick(await getSettings.execute()), config.openrouterApiKey);
const graph = buildGraph({
  writer: makeWriter({ model: model((s) => s.writerModel), search: (q, k) => index.search(q, k) }),
  qa: makeQa({ model: model((s) => s.qaModel) }),
  checkpointer: SqliteSaver.fromConnString(path.join(config.dataDir, "checkpoints.sqlite")),
  emit: (e) => bus.publish(e),
});
const assignments = new AssignmentService({ graph, preferences: { get: () => getPreferences.execute() }, indexFile: path.join(config.dataDir, "assignments.json"), bus });
await assignments.load();
const recovered = await assignments.recoverInterrupted();
if (recovered) console.log(`${recovered} assignment(s) were cut off by the last shutdown and are marked for Retry`);
if (!(await index.heartbeat())) console.warn(`Chroma is not reachable at ${config.chromaUrl}. Start it with: docker compose up -d`);

createApp({
  preferences: { get: getPreferences, update: updatePreferences },
  settings: { get: getSettings, update: updateSettings },
  notes: new NoteService({ notesDir: path.join(config.dataDir, "notes"), index }),
  models: { list: new ListModels(new OpenRouterModelSource()) },
  chromaUrl: config.chromaUrl,
  assignments,
  bus,
}).listen(config.port, "127.0.0.1", () => {
  console.log(`server listening on http://127.0.0.1:${config.port}`);
});
