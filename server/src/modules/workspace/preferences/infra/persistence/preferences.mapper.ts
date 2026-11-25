import type { Preferences as PreferencesProps } from "@ai-office/shared";
import { Preferences } from "../../domain/preferences.js";

export const PreferencesMapper = {
  toDomain(raw: unknown): Preferences {
    return Preferences.create(raw as PreferencesProps);
  },
  toPersistence(p: Preferences): PreferencesProps {
    return p.toJSON();
  },
};
