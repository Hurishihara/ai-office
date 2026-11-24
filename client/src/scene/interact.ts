import type { Interactable } from "./floors";

export function nearestInteractable(pos: { x: number; z: number }, items: Interactable[]): Interactable | null {
  let best: Interactable | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - pos.x, it.z - pos.z);
    if (d <= it.radius && d < bestD) { best = it; bestD = d; }
  }
  return best;
}
