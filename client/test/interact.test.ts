import { describe, expect, it } from "vitest";
import { nearestInteractable } from "../src/scene/interact";
import { FLOORS } from "../src/scene/floors";

describe("lobby interactables", () => {
  const items = FLOORS[0].interactables;
  it("elevator is in range anywhere in the shaft, incl. the wall end of the spawn line and corners", () => {
    for (const p of [{ x: 9.7, z: 1.5 }, { x: 9.7, z: 3.7 }, { x: 7, z: -3.7 }, { x: 9.7, z: -3.7 }])
      expect(nearestInteractable(p, items)?.id).toBe("elevator");
  });
  it("reception still wins at the reception desk", () => {
    expect(nearestInteractable({ x: 4.5, z: 0.5 }, items)?.id).toBe("reception");
  });
});

describe("nearestInteractable", () => {
  it("picks the closest interactable in range and ignores ones out of range", () => {
    const items = [{ id: "notes", x: 1, z: 0, radius: 1.5 }, { id: "reception", x: 0.5, z: 0, radius: 1.5 }, { id: "writer", x: 9, z: 0, radius: 1.5 }];
    expect(nearestInteractable({ x: 0, z: 0 }, items as any)?.id).toBe("reception");
    expect(nearestInteractable({ x: 20, z: 0 }, items as any)).toBeNull();
  });
});
