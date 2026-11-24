import type { ModelInfo } from "@ai-office/shared";

interface RawModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  supported_parameters?: string[];
}

export function toModelInfo(raw: RawModel): ModelInfo {
  const prompt = raw.pricing?.prompt ?? "";
  const completion = raw.pricing?.completion ?? "";
  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    free: prompt === "0" && completion === "0",
    contextLength: raw.context_length ?? 0,
    promptPrice: prompt,
    completionPrice: completion,
    supportsTools: raw.supported_parameters?.includes("tools") ?? false,
  };
}

// Both roles need tools: QA's structured output uses LangChain's tool strategy.
export function filterModels(models: ModelInfo[], opts: { role: "writer" | "qa"; freeOnly: boolean }): ModelInfo[] {
  return models.filter((m) => m.supportsTools && (!opts.freeOnly || m.free)).sort((a, b) => a.name.localeCompare(b.name));
}

export class ModelCatalog {
  private cache: { at: number; models: ModelInfo[] } | null = null;
  private fetchFn: typeof fetch;
  private ttlMs: number;
  private now: () => number;
  constructor(opts: { fetchFn?: typeof fetch; ttlMs?: number; now?: () => number } = {}) {
    this.fetchFn = opts.fetchFn ?? fetch;
    this.ttlMs = opts.ttlMs ?? 3_600_000;
    this.now = opts.now ?? Date.now;
  }
  async list(): Promise<ModelInfo[]> {
    if (this.cache && this.now() - this.cache.at <= this.ttlMs) return this.cache.models;
    try {
      const res = await this.fetchFn("https://openrouter.ai/api/v1/models");
      if (!res.ok) throw new Error(`OpenRouter models request failed: ${res.status}`);
      const body = (await res.json()) as { data: RawModel[] };
      this.cache = { at: this.now(), models: body.data.map(toModelInfo) };
      return this.cache.models;
    } catch (e) {
      if (this.cache) return this.cache.models;
      throw e;
    }
  }
}
