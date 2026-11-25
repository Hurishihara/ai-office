import type { Settings as SettingsProps } from "@ai-office/shared";
import { Settings } from "../../domain/settings.js";
import type { SettingsRepository } from "../../infra/adapter/settings.repository.js";

export class UpdateSettings {
  constructor(private readonly repo: SettingsRepository) {}

  async execute(input: SettingsProps): Promise<SettingsProps> {
    const settings = Settings.create(input);
    await this.repo.save(settings);
    return settings.toJSON();
  }
}
