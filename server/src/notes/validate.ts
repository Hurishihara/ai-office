import { isAllowedNoteSource, MAX_NOTE_BYTES, NOTE_ERRORS, type CreateNoteBody } from "@ai-office/shared";

export function validateNoteInput(body: unknown): { ok: true; value: CreateNoteBody } | { ok: false; error: string } {
  const { title, text, source } = (body ?? {}) as Record<string, unknown>;
  if (typeof source !== "string" || !isAllowedNoteSource(source)) return { ok: false, error: NOTE_ERRORS.type };
  if (typeof text !== "string" || !text.trim()) return { ok: false, error: NOTE_ERRORS.empty };
  if (Buffer.byteLength(text, "utf8") > MAX_NOTE_BYTES) return { ok: false, error: NOTE_ERRORS.tooBig };
  if (typeof title !== "string" || !title.trim() || title.length > 200) return { ok: false, error: NOTE_ERRORS.title };
  return { ok: true, value: { title, text, source } };
}
