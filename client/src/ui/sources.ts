import { countChars, PLATFORM_LIMITS, type AssignmentView, type RetrievedChunk } from "@ai-office/shared";

export interface SourceCard { noteId: string; title: string; excerpts: string[]; bestScore: number }

export function splitSources(retrieved: RetrievedChunk[], usedNoteIds: string[]): { used: SourceCard[]; unused: SourceCard[] } {
  const byNote = new Map<string, RetrievedChunk[]>();
  for (const r of retrieved) byNote.set(r.noteId, [...(byNote.get(r.noteId) ?? []), r]);
  const card = (chunks: RetrievedChunk[]): SourceCard => {
    const sorted = [...chunks].sort((a, b) => a.chunkIndex - b.chunkIndex);
    return { noteId: sorted[0].noteId, title: sorted[0].title, excerpts: sorted.map((c) => c.text), bestScore: Math.max(...chunks.map((c) => c.score)) };
  };
  const used = usedNoteIds.filter((id) => byNote.has(id)).map((id) => card(byNote.get(id)!));
  const unused = [...byNote].filter(([id]) => !usedNoteIds.includes(id)).map(([, v]) => card(v)).sort((a, b) => b.bestScore - a.bestScore);
  return { used, unused };
}

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = "", cls = ""): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.textContent = text;
  if (cls) e.className = cls;
  return e;
};

function cardList(heading: string, cards: SourceCard[]): HTMLElement {
  const box = el("section", "", "sources");
  box.append(el("h3", `${heading} (${cards.length})`));
  for (const c of cards) {
    const d = el("details", "", "source-card");
    d.append(el("summary", `${c.title} — ${c.bestScore.toFixed(2)}`));
    for (const x of c.excerpts) d.append(el("blockquote", x));
    box.append(d);
  }
  return box;
}

// Draft + character count + Used / Found, not used cards. All text via textContent.
export function renderDraft(v: AssignmentView): HTMLElement {
  const root = el("div", "", "draft-view");
  if (v.draft === null) return root;
  const n = countChars(v.draft), limit = PLATFORM_LIMITS[v.platform];
  const count = el("div", `${n} / ${limit} characters`, "char-count");
  if (n > limit) count.style.color = "#ff6b6b";
  const draft = el("pre", v.draft, "draft");
  draft.style.cssText = "white-space:pre-wrap;margin:0;font:inherit";
  const { used, unused } = splitSources(v.retrievedNotes, v.usedNoteIds);
  root.append(draft, count, cardList("Used", used), cardList("Found, not used", unused));
  return root;
}
