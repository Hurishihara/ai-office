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
  const e = err as { status?: number; message?: string };
  if (e?.status === 429) return "The model is rate-limited (free tier). Wait a minute or pick another model at reception.";
  if (e?.status === 401) return "OpenRouter rejected the API key. Check OPENROUTER_API_KEY in .env.";
  return `Model call failed: ${e?.message ?? String(err)}`;
}
