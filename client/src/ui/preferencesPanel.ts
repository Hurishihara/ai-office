import type { Preferences } from "@ai-office/shared";
import { api, errorText } from "../api";
import { Panel } from "./panel";

const TEXT_FIELDS = [["tone", "Tone"], ["audience", "Audience"], ["hashtags", "Hashtags"], ["extra", "Extra instructions"]] as const;

export function openPreferencesPanel(): void {
  const panel = new Panel({ title: "Writing preferences" });
  const inputs: Record<string, HTMLInputElement | HTMLTextAreaElement> = {};
  const row = (label: string, el: HTMLElement) => {
    const l = document.createElement("label");
    l.append(label + " ", el);
    panel.body.append(l);
  };
  for (const [k, label] of TEXT_FIELDS) {
    inputs[k] = document.createElement(k === "extra" ? "textarea" : "input");
    row(label, inputs[k]);
  }
  const emoji = document.createElement("select");
  for (const v of ["none", "light", "heavy"]) emoji.append(new Option(v, v));
  row("Emoji", emoji);
  const save = Object.assign(document.createElement("button"), { textContent: "Save", disabled: true });
  const status = document.createElement("div");
  status.setAttribute("role", "status");
  panel.body.append(save, status);

  save.onclick = async () => {
    const p = { emoji: emoji.value as Preferences["emoji"] } as Preferences;
    for (const [k] of TEXT_FIELDS) p[k] = inputs[k].value;
    try { await api.savePreferences(p); status.textContent = "Saved"; } catch (e) { status.textContent = errorText(e); }
  };

  panel.open();
  api.getPreferences().then((p) => {
    for (const [k] of TEXT_FIELDS) inputs[k].value = p[k];
    emoji.value = p.emoji;
    save.disabled = false;
  }).catch((e) => { status.textContent = errorText(e); });
}
