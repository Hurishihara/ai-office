// Pure data (no Three.js) so collision, interaction and agents can use it.
export type FloorId = "lobby" | "writer" | "qa" | "creative" | "research";
export interface Interactable { id: "notes" | "preferences" | "reception" | "writer" | "qa" | "elevator"; x: number; z: number; radius: number }
export interface Box2D { minX: number; maxX: number; minZ: number; maxZ: number }
export interface FloorDef { id: FloorId; label: string; locked: boolean; colliders: Box2D[]; interactables: Interactable[]; spawn: { x: number; z: number } }

// Floor-local coords: x in [-W/2, W/2] (shaft on the right), z in [-D/2 (back), D/2 (open front)].
export const FLOOR_WIDTH = 20;
export const FLOOR_DEPTH = 8;
export const FLOOR_HEIGHT = 4.5;
export const SHAFT_X = 8.5; // shaft centre; shaft spans SHAFT_X ± 1.5

const T = 0.3;
const hw = FLOOR_WIDTH / 2, hd = FLOOR_DEPTH / 2;
const box = (cx: number, cz: number, w: number, d: number): Box2D => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
const walls = (): Box2D[] => [
  { minX: -hw - T, maxX: hw + T, minZ: -hd - T, maxZ: -hd }, // back
  { minX: -hw - T, maxX: -hw, minZ: -hd, maxZ: hd }, // left
  { minX: hw, maxX: hw + T, minZ: -hd, maxZ: hd }, // right
];
const elevator = (): Interactable => ({ id: "elevator", x: SHAFT_X, z: 0, radius: 1.5 });

// Furniture footprints, shared with tower.ts so meshes match colliders.
export const FURNITURE: Partial<Record<FloorId, Box2D[]>> = {
  lobby: [box(-7, -3, 3, 1.2), box(-1, -2.5, 3, 1.2), box(4.5, -1, 3, 1.4)], // notes cabinet, preferences desk, reception desk
  writer: [box(-3, -2.5, 3.5, 1.4)],
  qa: [box(-3, -2.5, 3.5, 1.4)],
};

export const FLOORS: FloorDef[] = [
  { id: "lobby", label: "Lobby", locked: false, spawn: { x: 0, z: 1.5 },
    colliders: [...walls(), ...FURNITURE.lobby!],
    interactables: [
      { id: "notes", x: -7, z: -1.8, radius: 1.8 },
      { id: "preferences", x: -1, z: -1.3, radius: 1.8 },
      { id: "reception", x: 4.5, z: 0.5, radius: 1.8 },
      elevator(),
    ] },
  { id: "writer", label: "Writer studio", locked: false, spawn: { x: 0, z: 1.5 },
    colliders: [...walls(), ...FURNITURE.writer!],
    interactables: [{ id: "writer", x: -3, z: -1.2, radius: 1.8 }, elevator()] },
  { id: "qa", label: "QA studio", locked: false, spawn: { x: 0, z: 1.5 },
    colliders: [...walls(), ...FURNITURE.qa!],
    interactables: [{ id: "qa", x: -3, z: -1.2, radius: 1.8 }, elevator()] },
  { id: "creative", label: "Creative", locked: true, spawn: { x: 0, z: 1.5 }, colliders: walls(), interactables: [] },
  { id: "research", label: "Research", locked: true, spawn: { x: 0, z: 1.5 }, colliders: walls(), interactables: [] },
];
