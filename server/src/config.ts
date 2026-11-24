import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Config {
  port: number;
  openrouterApiKey: string;
  writerModel: string;
  qaModel: string;
  embeddingModel: string;
  chromaUrl: string;
  dataDir: string;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const openrouterApiKey = env.OPENROUTER_API_KEY;
  if (!openrouterApiKey) throw new Error("OPENROUTER_API_KEY is required (set it in .env)");
  return {
    port: Number(env.PORT) || 3001,
    openrouterApiKey,
    writerModel: env.WRITER_MODEL ?? "",
    qaModel: env.QA_MODEL ?? "",
    embeddingModel: env.EMBEDDING_MODEL ?? "",
    chromaUrl: env.CHROMA_URL || "http://localhost:8000",
    dataDir: path.join(repoRoot, "data"),
  };
}
