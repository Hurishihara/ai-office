import type { Settings as SettingsProps } from "@ai-office/shared";
import type { SettingsRepository } from "../../infra/adapter/settings.repository.js";

export class GetSettings {
  constructor(private readonly repo: SettingsRepository, private readonly defaults: SettingsProps) {}

  async execute(): Promise<SettingsProps> {
    return (await this.repo.get())?.toJSON() ?? { ...this.defaults };
  }
}
