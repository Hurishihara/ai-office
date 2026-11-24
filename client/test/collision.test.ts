import { describe, expect, it } from "vitest";
import { moveWithCollision } from "../src/scene/collision";
import { FLOORS, type Box2D } from "../src/scene/floors";

const wall: Box2D = { minX: 1, maxX: 2, minZ: -5, maxZ: 5 };
describe("moveWithCollision", () => {
  it("stops at a wall on X but keeps sliding on Z", () => {
    expect(moveWithCollision({ x: 0, z: 0 }, { x: 0.8, z: 0.5 }, 0.3, [wall])).toEqual({ x: 0, z: 0.5 });
  });
  it("moves freely with no colliders", () => {
    expect(moveWithCollision({ x: 0, z: 0 }, { x: 0.8, z: 0.5 }, 0.3, [])).toEqual({ x: 0.8, z: 0.5 });
  });
  it("floor bounds contain the player on all four sides", () => {
    const c = FLOORS[0].colliders;
    for (const d of [{ x: 0.1, z: 0 }, { x: -0.1, z: 0 }, { x: 0, z: 0.1 }, { x: 0, z: -0.1 }]) {
      let p = FLOORS[0].spawn;
      for (let i = 0; i < 300; i++) p = moveWithCollision(p, d, 0.3, c); // frame-sized steps
      expect(Math.abs(p.x) <= 10 && Math.abs(p.z) <= 4).toBe(true);
    }
  });
});
