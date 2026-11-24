import { countChars, NOTE_ERRORS, type NoteSummary } from "@ai-office/shared";
import { api, errorText } from "../api";
import { filterDroppedFiles } from "./files";
import { Panel, withBusy } from "./panel";

const MAX_TITLE = 200;
const clip = (s: string) => (countChars(s) > MAX_TITLE ? [...s].slice(0, MAX_TITLE).join("") : s); // code points, not UTF-16 units
const firstLine = (s: string) => clip(s.split("\n").map((l) => l.trim()).find(Boolean) ?? "");

export function openNotesPanel(): void {
  const panel = new Panel({ title: "Notes" });
  const text = Object.assign(document.createElement("textarea"), { rows: 6, placeholder: "Write a note..." });
  const title = Object.assign(document.createElement("input"), { placeholder: "Title (default: first line)" });
  const add = Object.assign(document.createElement("button"), { textContent: "Add note" });
  const drop = Object.assign(document.createElement("div"), { textContent: "Drop .txt / .md files here" });
  drop.style.cssText = "border:2px dashed #667;padding:14px;text-align:center;border-radius:6px";
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  const list = document.createElement("ul");
  list.style.cssText = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px";
  panel.body.append(text, title, add, drop, status, list);

  const say = (lines: string[]) => {
    status.replaceChildren(...lines.map((l) => Object.assign(document.createElement("div"), { textContent: l })));
  };

  const refresh = async () => {
    const notes: NoteSummary[] = await api.listNotes();
    list.replaceChildren(...[...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((n) => {
      const li = document.createElement("li");
      const del = Object.assign(document.createElement("button"), { textContent: "✕" });
      del.setAttribute("aria-label", `Delete ${n.title}`);
      del.onclick = () => withBusy(del, async () => {
        try { await api.deleteNote(n.id); await refresh(); } catch (e) { say([errorText(e)]); }
      });
      li.append(del, Object.assign(document.createElement("span"), { textContent: ` ${n.title} — ${n.preview}` }));
      return li;
    }));
  };

  add.onclick = () => withBusy(add, async () => {
    if (!text.value.trim()) return say([NOTE_ERRORS.empty]);
    try {
      await api.addNote({ title: title.value.trim() ? clip(title.value.trim()) : firstLine(text.value), text: text.value, source: "typed" });
      text.value = title.value = "";
      say([]);
      await refresh();
    } catch (e) { say([errorText(e)]); }
  });

  drop.addEventListener("dragover", (e) => e.preventDefault()); // without this, drop never fires
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    const { accepted, rejected } = filterDroppedFiles([...(e.dataTransfer?.files ?? [])]);
    const msgs = rejected.map((r) => `${r.name}: ${r.reason}`);
    for (const f of accepted) {
      try {
        await api.addNote({ title: f.name.replace(/\.[^.]*$/, ""), text: await f.text(), source: f.name });
      } catch (err) { msgs.push(`${f.name}: ${errorText(err)}`); }
    }
    try { await refresh(); } catch (err) { msgs.push(errorText(err)); }
    say(msgs);
  });

  panel.open();
  refresh().catch((e) => say([errorText(e)]));
}
