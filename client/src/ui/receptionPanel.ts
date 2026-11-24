import type { ModelInfo } from "@ai-office/shared";
import { api, errorText } from "../api";
import { Panel, withBusy } from "./panel";

export function openReceptionPanel(): void {
  const panel = new Panel({ title: "Reception — models" });
  const free = Object.assign(document.createElement("input"), { type: "checkbox", checked: true });
  const freeLabel = document.createElement("label");
  freeLabel.append(free, " Free only");
  const selects = { writer: document.createElement("select"), qa: document.createElement("select") };
  const save = Object.assign(document.createElement("button"), { textContent: "Save", disabled: true });
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  const note = Object.assign(document.createElement("p"), {
    textContent: "The embedding model is set in .env (EMBEDDING_MODEL); changing it needs a re-index of your notes.",
  });
  const rows = (["writer", "qa"] as const).map((r) => {
    const l = document.createElement("label");
    l.append(r === "writer" ? "Writer model " : "QA model ", selects[r]);
    return l;
  });
  panel.body.append(freeLabel, ...rows, save, status, note);

  const label = (m: ModelInfo) => (m.free ? m.name : `${m.name} — $${m.promptPrice} in / $${m.completionPrice} out`);
  // keep the current pick across refetches, even if it's no longer in the list
  const fill = (sel: HTMLSelectElement, models: ModelInfo[], current: string) => {
    sel.replaceChildren(...models.map((m) => new Option(label(m), m.id)));
    if (!models.some((m) => m.id === current)) sel.prepend(new Option(current, current));
    sel.value = current;
  };
  const load = async (cur: { writer: string; qa: string }) => {
    try {
      const [w, q] = await Promise.all([api.getModels("writer", free.checked), api.getModels("qa", free.checked)]);
      fill(selects.writer, w, cur.writer);
      fill(selects.qa, q, cur.qa);
      save.disabled = false;
      status.textContent = "";
    } catch (e) { status.textContent = errorText(e); }
  };
  free.onchange = () => load({ writer: selects.writer.value, qa: selects.qa.value });
  save.onclick = () => withBusy(save, async () => {
    try {
      await api.saveSettings({ writerModel: selects.writer.value, qaModel: selects.qa.value });
      status.textContent = "Saved";
    } catch (e) { status.textContent = errorText(e); }
  });

  panel.open();
  api.getSettings().then((s) => load({ writer: s.writerModel, qa: s.qaModel })).catch((e) => { status.textContent = errorText(e); });
}
