import { describe, expect, it } from "vitest";
import { nearestInteractable } from "../src/scene/interact";

describe("nearestInteractable", () => {
  it("picks the closest interactable in range and ignores ones out of range", () => {
    const items = [{ id: "notes", x: 1, z: 0, radius: 1.5 }, { id: "reception", x: 0.5, z: 0, radius: 1.5 }, { id: "writer", x: 9, z: 0, radius: 1.5 }];
    expect(nearestInteractable({ x: 0, z: 0 }, items as any)?.id).toBe("reception");
    expect(nearestInteractable({ x: 20, z: 0 }, items as any)).toBeNull();
  });
});
