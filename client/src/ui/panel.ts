import type { Keys } from "../scene/input";

let keys: Keys | null = null;
let current: Panel | null = null;
export const bindPanelKeys = (k: Keys) => { keys = k; }; // setEnabled(false) also clears held keys

export class Panel {
  readonly root = document.createElement("div");
  readonly body = document.createElement("div");
  private onKey = (e: KeyboardEvent) => { if (e.key === "Escape") this.close(); };

  constructor(private opts: { title: string; onClose?: () => void }) {
    this.root.className = "panel-backdrop";
    const box = document.createElement("div");
    box.className = "panel";
    box.setAttribute("role", "dialog");
    const head = document.createElement("div");
    head.className = "panel-head";
    const h = document.createElement("h2");
    h.textContent = opts.title;
    const x = document.createElement("button");
    x.textContent = "×";
    x.setAttribute("aria-label", "Close");
    x.onclick = () => this.close();
    head.append(h, x);
    this.body.className = "panel-body";
    box.append(head, this.body);
    this.root.append(box);
  }

  isOpen(): boolean { return this.root.isConnected; }

  open(): void {
    if (current && current !== this) current.close();
    current = this;
    keys?.setEnabled(false);
    document.body.append(this.root);
    window.addEventListener("keydown", this.onKey);
    // body content first so the first real control gets focus, else the close button
    (this.body.querySelector<HTMLElement>("button:not([disabled]), input, textarea, select") ?? this.root.querySelector<HTMLElement>("button"))?.focus();
  }

  close(): void {
    if (!this.isOpen()) return;
    this.root.remove();
    window.removeEventListener("keydown", this.onKey);
    if (current === this) { current = null; keys?.setEnabled(true); }
    this.opts.onClose?.();
  }
}
