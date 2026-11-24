import { isAllowedNoteSource, MAX_NOTE_BYTES, NOTE_ERRORS } from "@ai-office/shared";

export function filterDroppedFiles<T extends { name: string; size: number }>(files: T[]) {
  const accepted: T[] = [];
  const rejected: { name: string; reason: string }[] = [];
  for (const f of files) {
    const reason = !isAllowedNoteSource(f.name) ? NOTE_ERRORS.type
      : f.size === 0 ? NOTE_ERRORS.empty
      : f.size > MAX_NOTE_BYTES ? NOTE_ERRORS.tooBig : null;
    if (reason) rejected.push({ name: f.name, reason }); else accepted.push(f);
  }
  return { accepted, rejected };
}
