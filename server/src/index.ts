import path from "node:path";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PreferencesStore } from "./preferences.js";
import { SettingsStore } from "./settings.js";
import { ChromaVectorIndex } from "./notes/vectorIndex.js";
import { NoteService } from "./notes/noteService.js";
import { ModelCatalog } from "./models/catalog.js";
import { makeEmbeddings } from "./models/openrouter.js";

const config = loadConfig();
const index = new ChromaVectorIndex({
  chromaUrl: config.chromaUrl,
  embeddingModel: config.embeddingModel,
  embeddings: makeEmbeddings(config.embeddingModel, config.openrouterApiKey),
});
createApp({
  preferences: new PreferencesStore(path.join(config.dataDir, "preferences.json")),
  settings: new SettingsStore(path.join(config.dataDir, "settings.json"), { writerModel: config.writerModel, qaModel: config.qaModel }),
  notes: new NoteService({ notesDir: path.join(config.dataDir, "notes"), index }),
  catalog: new ModelCatalog({}),
  chromaUrl: config.chromaUrl,
}).listen(config.port, "127.0.0.1", () => {
  console.log(`server listening on http://127.0.0.1:${config.port}`);
});
