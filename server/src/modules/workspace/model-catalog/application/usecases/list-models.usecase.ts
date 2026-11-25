import type { ModelInfo } from "@ai-office/shared";
import { ModelCatalog } from "../../domain/model-catalog.js";
import type { ModelSource } from "../ports/model-source.port.js";

export class ListModels {
  constructor(private readonly source: ModelSource) {}

  async execute(opts: { role: "writer" | "qa"; freeOnly: boolean }): Promise<ModelInfo[]> {
    return new ModelCatalog(await this.source.list()).select(opts);
  }
}
