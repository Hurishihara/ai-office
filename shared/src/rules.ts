import type { Platform } from "./index.js";

export const MAX_NOTE_BYTES = 1_048_576;
export const NOTE_ERRORS = {
  type: "Only .txt and .md files are supported",
  empty: "Note is empty",
  tooBig: "Note is over 1 MB",
  title: "Title is required",
} as const;

export function isAllowedNoteSource(source: string): boolean {
  return source === "typed" || /\.(txt|md)$/i.test(source);
}

export const PLATFORM_LIMITS: Record<Platform, number> = { x: 280, instagram: 2200, linkedin: 3000 };
export const PLATFORM_LABELS: Record<Platform, string> = { x: "X", linkedin: "LinkedIn", instagram: "Instagram" };

export function countChars(text: string): number {
  return [...text].length;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
