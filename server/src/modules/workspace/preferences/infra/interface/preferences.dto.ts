import { z } from "zod";

// Types only; domain rules (lengths, emoji levels) live in Preferences.create.
export const preferencesDto = z.object({
  tone: z.string(),
  audience: z.string(),
  emoji: z.string(),
  hashtags: z.string(),
  extra: z.string(),
});
