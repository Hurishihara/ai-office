export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (el as HTMLElement).isContentEditable === true;
}

export class Keys {
  private held = new Set<string>();
  private interactFn: () => void = () => {};
  private on = true;

  constructor(target: Window) {
    target.addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.on || isTypingTarget(document.activeElement)) return;
      if (e.code === "KeyE") {
        if (!e.repeat) { e.preventDefault(); this.interactFn(); } // else the 'e' lands in the panel input focused by interactFn
        return;
      }
      this.held.add(e.code);
    });
    // keyup always clears, even while typing/disabled, so no key can stay stuck
    target.addEventListener("keyup", (e: KeyboardEvent) => this.held.delete(e.code));
    target.addEventListener("blur", () => this.held.clear());
  }

  get enabled(): boolean { return this.on; }

  setEnabled(on: boolean): void {
    this.on = on;
    if (!on) this.held.clear();
  }

  direction(): { x: number; z: number } {
    const h = (c: string) => (this.held.has(c) ? 1 : 0);
    const x = h("KeyD") - h("KeyA"), z = h("KeyS") - h("KeyW");
    const len = Math.hypot(x, z);
    return len ? { x: x / len, z: z / len } : { x: 0, z: 0 };
  }

  onInteract(fn: () => void): void { this.interactFn = fn; }
}
