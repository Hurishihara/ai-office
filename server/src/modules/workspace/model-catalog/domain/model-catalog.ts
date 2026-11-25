import type { ModelInfo } from "@ai-office/shared";

export class ModelCatalog {
  constructor(private readonly models: ModelInfo[]) {}

  // Both roles need tools: QA's structured output uses LangChain's tool strategy.
  select(opts: { role: "writer" | "qa"; freeOnly: boolean }): ModelInfo[] {
    return this.models.filter((m) => m.supportsTools && (!opts.freeOnly || m.free)).sort((a, b) => a.name.localeCompare(b.name));
  }
}
