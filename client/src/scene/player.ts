import * as THREE from "three";
import { moveWithCollision } from "./collision";
import type { FloorDef } from "./floors";
import type { TowerView } from "./tower";

const SPEED = 4.5; // units/s
const RADIUS = 0.3;

export class Player {
  mesh = new THREE.Group();
  floor = 0;
  pos = { x: 0, z: 0 };

  constructor(private tower: TowerView, parent: THREE.Object3D) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(RADIUS, 0.8, 4, 12), new THREE.MeshStandardMaterial({ color: 0xf2b134 }));
    body.position.y = 0.7;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    nose.position.set(0, 1.0, RADIUS); // marks the facing direction (+z local)
    this.mesh.add(body, nose);
    parent.add(this.mesh);
  }

  update(dt: number, dir: { x: number; z: number }, floor: FloorDef): void {
    if (dir.x || dir.z) {
      this.pos = moveWithCollision(this.pos, { x: dir.x * SPEED * dt, z: dir.z * SPEED * dt }, RADIUS, floor.colliders);
      this.mesh.rotation.y = Math.atan2(dir.x, dir.z);
    }
    this.sync();
  }

  teleport(floor: number, at: { x: number; z: number }): void {
    this.floor = floor;
    this.pos = { ...at };
    this.sync();
  }

  private sync(): void {
    this.mesh.position.set(this.pos.x, this.tower.floorY(this.floor), this.pos.z);
  }
}
