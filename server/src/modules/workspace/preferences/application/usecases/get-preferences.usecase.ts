import type { Preferences as PreferencesProps } from "@ai-office/shared";
import { Preferences } from "../../domain/preferences.js";
import type { PreferencesRepository } from "../../infra/adapter/preferences.repository.js";

export class GetPreferences {
  constructor(private readonly repo: PreferencesRepository) {}

  async execute(): Promise<PreferencesProps> {
    return ((await this.repo.get()) ?? Preferences.defaults()).toJSON();
  }
}
