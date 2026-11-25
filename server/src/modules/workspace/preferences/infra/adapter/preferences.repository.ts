import type { Preferences } from "../../domain/preferences.js";

export interface PreferencesRepository {
  get(): Promise<Preferences | null>;
  save(p: Preferences): Promise<void>;
}
