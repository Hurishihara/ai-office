import { describe, it, expect, vi } from "vitest";
import { Preferences } from "../../domain/preferences.js";
import type { PreferencesRepository } from "../../infra/adapter/preferences.repository.js";
import { GetPreferences } from "./get-preferences.usecase.js";

describe("GetPreferences", () => {
  it("returns defaults when nothing is stored", async () => {
    const repo = { get: vi.fn().mockResolvedValue(null), save: vi.fn() } satisfies PreferencesRepository;
    expect(await new GetPreferences(repo).execute()).toEqual(Preferences.defaults().toJSON());
  });
  it("returns stored preferences", async () => {
    const stored = Preferences.create({ tone: "dry", audience: "", emoji: "none", hashtags: "", extra: "" });
    const repo = { get: vi.fn().mockResolvedValue(stored), save: vi.fn() } satisfies PreferencesRepository;
    expect(await new GetPreferences(repo).execute()).toEqual(stored.toJSON());
  });
});
