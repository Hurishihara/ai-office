import { readJson, writeJson } from "../../../../../core/json-file.js";
import type { Preferences } from "../../domain/preferences.js";
import type { PreferencesRepository } from "../adapter/preferences.repository.js";
import { PreferencesMapper } from "./preferences.mapper.js";

export class JsonPreferencesRepository implements PreferencesRepository {
  constructor(private readonly file: string) {}

  async get(): Promise<Preferences | null> {
    const raw = await readJson<unknown>(this.file, null);
    if (raw === null) return null;
    try {
      return PreferencesMapper.toDomain(raw);
    } catch (e) {
      throw new Error(`Invalid preferences in ${this.file}: ${(e as Error).message}`);
    }
  }

  async save(p: Preferences): Promise<void> {
    await writeJson(this.file, PreferencesMapper.toPersistence(p));
  }
}
