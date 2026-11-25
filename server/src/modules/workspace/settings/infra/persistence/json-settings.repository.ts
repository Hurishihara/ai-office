import { readJson, writeJson } from "../../../../../core/json-file.js";
import type { Settings } from "../../domain/settings.js";
import type { SettingsRepository } from "../adapter/settings.repository.js";
import { SettingsMapper } from "./settings.mapper.js";

export class JsonSettingsRepository implements SettingsRepository {
  constructor(private readonly file: string) {}

  async get(): Promise<Settings | null> {
    try {
      const raw = await readJson<unknown>(this.file, null);
      return raw === null ? null : SettingsMapper.toDomain(raw);
    } catch (e) {
      throw new Error(`Invalid settings in ${this.file}: ${(e as Error).message}`);
    }
  }

  async save(s: Settings): Promise<void> {
    await writeJson(this.file, SettingsMapper.toPersistence(s));
  }
}
