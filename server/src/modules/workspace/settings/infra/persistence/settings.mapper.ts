import type { Settings as SettingsProps } from "@ai-office/shared";
import { Settings } from "../../domain/settings.js";

export const SettingsMapper = {
  toDomain(raw: unknown): Settings {
    return Settings.create(raw as SettingsProps);
  },
  toPersistence(s: Settings): SettingsProps {
    return s.toJSON();
  },
};
