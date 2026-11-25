import { z } from "zod";
import type { Settings } from "@ai-office/shared";
import { readJson, writeJson } from "./core/json-file.js";

export const SettingsSchema = z.object({ writerModel: z.string().min(1), qaModel: z.string().min(1) });

export class SettingsStore {
  constructor(private file: string, private defaults: Settings) {}
  get(): Promise<Settings> {
    return readJson(this.file, this.defaults);
  }
  async save(s: Settings): Promise<Settings> {
    await writeJson(this.file, s);
    return s;
  }
}
