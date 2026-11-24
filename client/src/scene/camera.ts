import * as THREE from "three";

const OFFSET = new THREE.Vector3(0, 3, 16); // fixed side-on offset from the look-at point
const GLIDE_S = 0.8;

export class FollowCamera {
  private lookAt = new THREE.Vector3();
  private glide: { from: number; to: number; t: number } | null = null;

  constructor(private camera: THREE.PerspectiveCamera) {}

  follow(target: THREE.Vector3, dt: number): void {
    const k = 1 - Math.exp(-6 * dt); // frame-rate independent damping
    this.lookAt.x += (target.x - this.lookAt.x) * k;
    if (this.glide) {
      const g = this.glide;
      g.t = Math.min(1, g.t + dt / GLIDE_S);
      this.lookAt.y = g.from + (g.to - g.from) * g.t * g.t * (3 - 2 * g.t); // smoothstep
      if (g.t >= 1) this.glide = null;
    } else {
      this.lookAt.y += (target.y - this.lookAt.y) * k;
    }
    this.camera.position.copy(this.lookAt).add(OFFSET); // z stays fixed: side angle
    this.camera.lookAt(this.lookAt);
  }

  glideToFloor(y: number): void {
    this.glide = { from: this.lookAt.y, to: y, t: 0 };
  }
}
