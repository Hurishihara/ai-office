import { ChatOpenRouter } from "@langchain/openrouter";
import { OpenAIEmbeddings } from "@langchain/openai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export const MODEL_TIMEOUT_MS = 60_000;

// ChatOpenRouter has no `timeout` option: agents must pass `signal: AbortSignal.timeout(MODEL_TIMEOUT_MS)` on each invoke.
export function makeChatModel(modelId: string, apiKey: string): BaseChatModel {
  return new ChatOpenRouter({ model: modelId, apiKey, maxRetries: 3 });
}

export function makeEmbeddings(modelId: string, apiKey: string): OpenAIEmbeddings {
  return new OpenAIEmbeddings({ model: modelId, apiKey, configuration: { baseURL: "https://openrouter.ai/api/v1" } });
}

export function describeModelError(err: unknown): string {
  const e = err as { status?: number; statusCode?: number; name?: string; message?: string };
  const status = e?.status ?? e?.statusCode; // @langchain/openrouter errors use statusCode
  if (status === 429) return "The model is rate-limited (free tier). Wait a minute or pick another model at reception.";
  if (status === 401) return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.";
  if (e?.name === "TimeoutError") return "The model took too long. Press Retry or pick a faster model at reception.";
  if (e?.name === "ChromaConnectionError") return "Chroma is not reachable. Start it with: docker compose up -d";
  return `Model call failed: ${e?.message ?? String(err)}`;
}
