export interface NoteMeta { id: string; title: string; source: string; createdAt: string }

export function serializeNote(meta: NoteMeta, text: string): string {
  return `---\n${JSON.stringify(meta)}\n---\n${text}`;
}

// Fixed 3-line header; the body is everything after it and is never split on `---`.
export function parseNote(raw: string): { meta: NoteMeta; text: string } {
  const lines = raw.split("\n", 3);
  if (lines[0] !== "---" || lines[2] !== "---") throw new Error("Malformed note file");
  const headerLen = lines[0].length + lines[1].length + lines[2].length + 3;
  return { meta: JSON.parse(lines[1]) as NoteMeta, text: raw.slice(headerLen) };
}
