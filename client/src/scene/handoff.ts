import * as THREE from "three";

const DURATION = 1.2; // seconds

export function playHandoff(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3): void {
  const geo = new THREE.PlaneGeometry(0.5, 0.65);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false });
  const paper = new THREE.Mesh(geo, mat);
  paper.renderOrder = 10; // visible through floor slabs
  scene.add(paper);
  const t0 = performance.now();
  const step = () => {
    const t = Math.min((performance.now() - t0) / 1000 / DURATION, 1);
    paper.position.lerpVectors(from, to, t).y += 1.2 + Math.sin(t * Math.PI) * 0.3;
    if (t < 1) return requestAnimationFrame(step);
    scene.remove(paper);
    geo.dispose();
    mat.dispose();
  };
  requestAnimationFrame(step);
}
