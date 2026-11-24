import { describe, expect, it } from "vitest";
import { isTypingTarget, Keys } from "../src/scene/input";

const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as Element;
class FakeWin {
  l: Record<string, ((e: any) => void)[]> = {};
  addEventListener(t: string, f: (e: any) => void) { (this.l[t] ??= []).push(f); }
  fire(t: string, e: any = {}) { this.l[t]?.forEach((f) => f(e)); }
}
const setActive = (a: Element | null) => ((globalThis as any).document = { activeElement: a });

describe("isTypingTarget", () => {
  it("treats textarea, input, select and contenteditable as typing targets", () => {
    for (const t of ["TEXTAREA", "INPUT", "SELECT"]) expect(isTypingTarget(el(t))).toBe(true);
    expect(isTypingTarget(el("DIV", true))).toBe(true);
    expect(isTypingTarget(el("DIV"))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("Keys", () => {
  const make = () => { const w = new FakeWin(); return { w, k: new Keys(w as unknown as Window) }; };
  it("normalises WASD and ignores keys while typing", () => {
    const { w, k } = make();
    setActive(null);
    w.fire("keydown", { code: "KeyD" }); w.fire("keydown", { code: "KeyS" });
    expect(k.direction().x).toBeCloseTo(Math.SQRT1_2);
    expect(k.direction().z).toBeCloseTo(Math.SQRT1_2);
    w.fire("keyup", { code: "KeyD" }); w.fire("keyup", { code: "KeyS" });
    setActive(el("TEXTAREA"));
    let n = 0; k.onInteract(() => n++);
    w.fire("keydown", { code: "KeyW" }); w.fire("keydown", { code: "KeyE" });
    expect(k.direction()).toEqual({ x: 0, z: 0 });
    expect(n).toBe(0);
  });
  it("fires interact when not typing", () => {
    const { w, k } = make(); setActive(null);
    let n = 0; k.onInteract(() => n++);
    w.fire("keydown", { code: "KeyE" });
    expect(n).toBe(1);
  });
  it("clears held keys on setEnabled(false), blur, and ignores keys while disabled", () => {
    const { w, k } = make(); setActive(null);
    w.fire("keydown", { code: "KeyW" });
    k.setEnabled(false);
    expect(k.enabled).toBe(false);
    expect(k.direction()).toEqual({ x: 0, z: 0 });
    w.fire("keydown", { code: "KeyW" });
    expect(k.direction()).toEqual({ x: 0, z: 0 });
    k.setEnabled(true);
    expect(k.direction()).toEqual({ x: 0, z: 0 });
    w.fire("keydown", { code: "KeyA" });
    w.fire("blur");
    expect(k.direction()).toEqual({ x: 0, z: 0 });
  });
});
