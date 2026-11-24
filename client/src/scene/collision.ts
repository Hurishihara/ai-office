import type { Box2D } from "./floors";

type P = { x: number; z: number };
const hits = (x: number, z: number, r: number, b: Box2D) => x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r;

// X then Z separately, so the player slides along walls. shortcut: no swept test; per-frame steps must stay smaller than the thinnest box plus 2*radius.
export function moveWithCollision(pos: P, delta: P, radius: number, colliders: Box2D[]): P {
  let { x, z } = pos;
  if (!colliders.some((b) => hits(x + delta.x, z, radius, b))) x += delta.x;
  if (!colliders.some((b) => hits(x, z + delta.z, radius, b))) z += delta.z;
  return { x, z };
}
