import type { FloorDef } from "../scene/floors";
import { Panel } from "./panel";

export function openElevator(current: number, floors: FloorDef[], onPick: (i: number) => void): void {
  const panel = new Panel({ title: "Elevator" });
  for (let i = floors.length - 1; i >= 0; i--) { // top to bottom
    const f = floors[i];
    const b = document.createElement("button");
    b.className = "floor-btn";
    b.textContent = f.locked ? `${f.label} — Coming soon` : i === current ? `${f.label} (you are here)` : f.label;
    b.disabled = f.locked;
    b.onclick = () => { panel.close(); onPick(i); };
    panel.body.append(b);
  }
  panel.open();
}
