import type { Preferences as PreferencesProps } from "@ai-office/shared";
import { Preferences } from "../../domain/preferences.js";
import type { PreferencesRepository } from "../../infra/adapter/preferences.repository.js";

export class UpdatePreferences {
  constructor(private readonly repo: PreferencesRepository) {}

  async execute(input: PreferencesProps): Promise<PreferencesProps> {
    const prefs = Preferences.create(input);
    await this.repo.save(prefs);
    return prefs.toJSON();
  }
}
