import type { Settings } from "../../domain/settings.js";

export interface SettingsRepository {
  get(): Promise<Settings | null>;
  save(s: Settings): Promise<void>;
}
