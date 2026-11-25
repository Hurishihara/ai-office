import { z } from "zod";

// Types only; domain rules (non-empty ids) live in Settings.create.
export const settingsDto = z.object({ writerModel: z.string(), qaModel: z.string() });
