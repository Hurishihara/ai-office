import * as THREE from "three";
import { FLOOR_DEPTH, FLOOR_HEIGHT, FLOOR_WIDTH, FURNITURE, SHAFT_X, type FloorDef, type Interactable } from "./floors";

export interface TowerView {
  floorY(i: number): number;
  setFocus(i: number): void;
  anchor(id: Interactable["id"], floor: number): THREE.Vector3;
}

const DIM = 0.4;

function signTexture(text: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3a3d46"; g.fillRect(0, 0, 512, 128);
  g.fillStyle = "#e8e8ee"; g.font = "bold 56px system-ui, sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildTower(scene: THREE.Scene, floors: FloorDef[]): TowerView {
  const floorY = (i: number) => i * FLOOR_HEIGHT;
  // [material, base colour] so dimming is always relative to the original.
  const mats: Array<Array<[THREE.MeshLambertMaterial, THREE.Color]>> = [];
  const hw = FLOOR_WIDTH / 2, hd = FLOOR_DEPTH / 2, T = 0.3, wallH = FLOOR_HEIGHT - T;

  floors.forEach((f, i) => {
    const g = new THREE.Group();
    g.position.y = floorY(i);
    const list: Array<[THREE.MeshLambertMaterial, THREE.Color]> = [];
    const mesh = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, opts: THREE.MeshLambertMaterialParameters = {}) => {
      const m = new THREE.MeshLambertMaterial({ color: f.locked ? 0x777777 : color, ...opts });
      list.push([m, m.color.clone()]);
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(x, y, z);
      g.add(o);
    };
    mesh(FLOOR_WIDTH + 2 * T, T, FLOOR_DEPTH + T, 0, -T / 2, -T / 2, 0xb8a98f); // slab
    mesh(FLOOR_WIDTH + 2 * T, wallH, T, 0, wallH / 2, -hd - T / 2, 0xe6dccb); // back wall
    mesh(T, wallH, FLOOR_DEPTH, -hw - T / 2, wallH / 2, 0, 0xd6cab5); // left wall
    mesh(T, wallH, FLOOR_DEPTH, hw + T / 2, wallH / 2, 0, 0xd6cab5); // right wall
    mesh(3, wallH, FLOOR_DEPTH - 0.2, SHAFT_X, wallH / 2, 0, 0x5b6b80, { transparent: true, opacity: 0.35 }); // elevator shaft
    for (const b of FURNITURE[f.id] ?? [])
      mesh(b.maxX - b.minX, 1, b.maxZ - b.minZ, (b.minX + b.maxX) / 2, 0.5, (b.minZ + b.maxZ) / 2, 0x8a5a3b);
    if (f.locked) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: signTexture("Coming soon") }));
      sign.position.set(-2, 2.2, -hd + 0.05);
      g.add(sign);
    }
    scene.add(g);
    mats.push(list);
  });

  return {
    floorY,
    setFocus(i) {
      mats.forEach((list, n) => list.forEach(([m, base]) => m.color.copy(base).multiplyScalar(n === i ? 1 : DIM)));
    },
    anchor(id, floor) {
      const it = floors[floor].interactables.find((x) => x.id === id);
      if (!it) throw new Error(`no interactable ${id} on floor ${floor}`);
      return new THREE.Vector3(it.x, floorY(floor), it.z);
    },
  };
}
