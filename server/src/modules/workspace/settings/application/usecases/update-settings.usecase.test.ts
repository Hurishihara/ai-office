import { describe, it, expect, vi } from "vitest";
import { Settings } from "../../domain/settings.js";
import type { SettingsRepository } from "../../infra/adapter/settings.repository.js";
import { UpdateSettings } from "./update-settings.usecase.js";

const valid = { writerModel: "w2", qaModel: "q2" };

describe("UpdateSettings", () => {
  it("saves valid input", async () => {
    const repo = { get: vi.fn(), save: vi.fn().mockResolvedValue(undefined) } satisfies SettingsRepository;
    expect(await new UpdateSettings(repo).execute(valid)).toEqual(valid);
    expect(repo.save).toHaveBeenCalledOnce();
    expect(repo.save.mock.calls[0][0]).toBeInstanceOf(Settings);
  });
  it("never saves invalid input", async () => {
    const repo = { get: vi.fn(), save: vi.fn() } satisfies SettingsRepository;
    await expect(new UpdateSettings(repo).execute({ ...valid, qaModel: "" })).rejects.toThrow("qaModel");
    expect(repo.save).not.toHaveBeenCalled();
  });
});
