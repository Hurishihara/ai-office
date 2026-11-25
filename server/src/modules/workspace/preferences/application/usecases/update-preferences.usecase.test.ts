import { describe, it, expect, vi } from "vitest";
import { Preferences } from "../../domain/preferences.js";
import type { PreferencesRepository } from "../../infra/adapter/preferences.repository.js";
import { UpdatePreferences } from "./update-preferences.usecase.js";

const valid = { tone: "dry", audience: "devs", emoji: "none" as const, hashtags: "2 max", extra: "" };

describe("UpdatePreferences", () => {
  it("saves valid input", async () => {
    const repo = { get: vi.fn(), save: vi.fn().mockResolvedValue(undefined) } satisfies PreferencesRepository;
    expect(await new UpdatePreferences(repo).execute(valid)).toEqual(valid);
    expect(repo.save).toHaveBeenCalledOnce();
    expect(repo.save.mock.calls[0][0]).toBeInstanceOf(Preferences);
  });
  it("never saves invalid input", async () => {
    const repo = { get: vi.fn(), save: vi.fn() } satisfies PreferencesRepository;
    await expect(new UpdatePreferences(repo).execute({ ...valid, emoji: "lots" as never })).rejects.toThrow("emoji");
    expect(repo.save).not.toHaveBeenCalled();
  });
});
