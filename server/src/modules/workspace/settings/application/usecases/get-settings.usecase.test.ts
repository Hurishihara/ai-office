import { describe, it, expect, vi } from "vitest";
import { Settings } from "../../domain/settings.js";
import type { SettingsRepository } from "../../infra/adapter/settings.repository.js";
import { GetSettings } from "./get-settings.usecase.js";

describe("GetSettings", () => {
  it("GetSettings falls back to the injected defaults", async () => {
    const repo = { get: vi.fn().mockResolvedValue(null), save: vi.fn() } satisfies SettingsRepository;
    expect(await new GetSettings(repo, { writerModel: "w", qaModel: "q" }).execute()).toEqual({ writerModel: "w", qaModel: "q" });
  });
  it("returns stored settings", async () => {
    const stored = Settings.create({ writerModel: "w2", qaModel: "q2" });
    const repo = { get: vi.fn().mockResolvedValue(stored), save: vi.fn() } satisfies SettingsRepository;
    expect(await new GetSettings(repo, { writerModel: "w", qaModel: "q" }).execute()).toEqual(stored.toJSON());
  });
});
