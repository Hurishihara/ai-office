import { z } from "zod";
import type { Preferences } from "@ai-office/shared";
import { readJson, writeJson } from "./core/json-file.js";

const text = z.string().max(2000);
export const PreferencesSchema = z.object({
  tone: text,
  audience: text,
  emoji: z.enum(["none", "light", "heavy"]),
  hashtags: text,
  extra: text,
});

export const DEFAULT_PREFERENCES: Preferences = { tone: "", audience: "", emoji: "light", hashtags: "", extra: "" };

export class PreferencesStore {
  constructor(private file: string) {}
  get(): Promise<Preferences> {
    return readJson(this.file, DEFAULT_PREFERENCES);
  }
  async save(p: Preferences): Promise<Preferences> {
    await writeJson(this.file, p);
    return p;
  }
}
