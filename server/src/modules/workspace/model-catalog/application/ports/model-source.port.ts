import type { ModelInfo } from "@ai-office/shared";

export interface ModelSource {
  list(): Promise<ModelInfo[]>;
}
