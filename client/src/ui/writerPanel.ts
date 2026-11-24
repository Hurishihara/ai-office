import { PLATFORMS, PLATFORM_LABELS, type AssignmentView, type Platform, type ServerEvent } from "@ai-office/shared";
import { api, errorText } from "../api";
import type { createStore, OfficeState } from "../state";
import { Panel, withBusy } from "./panel";
import { el, renderDraft } from "./sources";

export type Store = ReturnType<typeof createStore<OfficeState>>;
type SearchEvent = Extract<ServerEvent, { type: "search" }>;

// main.ts forwards `search` events here; applyEvent stays pure.
const searchListeners = new Set<(e: SearchEvent) => void>();
export const forwardSearch = (e: ServerEvent) => { if (e.type === "search") searchListeners.forEach((f) => f(e)); };

export function openWriterPanel(store: Store): void {
  let activeId: string | null = null;
  let seenStatus: string | undefined;
  const onSearch = (e: SearchEvent) => {
    if (e.assignmentId === activeId) feed.append(el("li", `searching notes: "${e.query}" → ${e.hits} chunks`));
  };
  const panel = new Panel({ title: "Writer", onClose: () => { off(); searchListeners.delete(onSearch); } });

  const platform = document.createElement("select");
  platform.append(...PLATFORMS.map((p) => new Option(PLATFORM_LABELS[p], p)));
  const ask = Object.assign(document.createElement("textarea"), { rows: 3, placeholder: "What should the post be about?" });
  const start = el("button", "Start");
  const msg = el("div");
  msg.setAttribute("role", "status");
  const feed = document.createElement("ul");
  const result = document.createElement("div");
  const past = document.createElement("div");
  panel.body.append(platform, ask, start, msg, feed, result, past);

  const load = async (id: string, keepFeed = false) => {
    activeId = id;
    if (!keepFeed) { feed.replaceChildren(); seenStatus = store.get().assignments.find((x) => x.id === id)?.status; }
    try {
      const v: AssignmentView = await api.getAssignment(id);
      if (activeId !== id) return;
      result.replaceChildren(el("div", `${PLATFORM_LABELS[v.platform]} — ${v.status}${v.error ? `: ${v.error}` : ""}`), renderDraft(v));
    } catch (e) { msg.textContent = errorText(e); }
  };
  const renderPast = () => past.replaceChildren(...store.get().assignments.map((a) => {
    const b = el("button", `${PLATFORM_LABELS[a.platform]} · ${a.status} · ${a.ask.slice(0, 40)}`);
    b.onclick = () => void load(a.id);
    return b;
  }));
  // reload the open assignment whenever its status changes (draft appears once it leaves `writing`)
  const off = store.subscribe((s) => {
    renderPast();
    const a = s.assignments.find((x) => x.id === activeId);
    if (a && a.status !== seenStatus) { seenStatus = a.status; void load(a.id, true); }
  });
  searchListeners.add(onSearch);
  renderPast();

  start.onclick = () => withBusy(start, async () => {
    msg.textContent = "";
    try {
      const s = await api.startAssignment(platform.value as Platform, ask.value);
      ask.value = "";
      feed.replaceChildren();
      activeId = s.id;
      seenStatus = s.status;
      result.replaceChildren(el("div", "Writer is working…"));
    } catch (e) { msg.textContent = errorText(e); }
  });
  panel.open();
}
