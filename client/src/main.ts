import "./style.css";
import * as THREE from "three";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { api, subscribeEvents } from "./api";
import { FollowCamera } from "./scene/camera";
import { FLOORS } from "./scene/floors";
import { buildTower } from "./scene/tower";
import { applyEvent, createStore, initialState } from "./state";

const store = createStore(initialState());

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
app.appendChild(renderer.domElement);
const labels = new CSS2DRenderer(); // bubble layer, kept in step with the canvas
labels.domElement.style.cssText = "position:absolute;top:0;left:0;pointer-events:none";
app.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b1d24);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(-6, 14, 12);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
const tower = buildTower(scene, FLOORS);
const followCam = new FollowCamera(camera);
const focus = 0;
tower.setFocus(focus);
const player = new THREE.Vector3(FLOORS[focus].spawn.x, tower.floorY(focus) + 1.5, 0);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  followCam.follow(player, Math.min(clock.getDelta(), 0.1));
  renderer.render(scene, camera);
  labels.render(scene, camera);
});

const seed = () =>
  api.listAssignments()
    .then((assignments) => store.set({ ...store.get(), assignments }))
    .catch((err) => console.error("seed failed", err));

seed();
subscribeEvents(
  (e) => {
    console.log("event", e);
    store.set(applyEvent(store.get(), e));
  },
  () => { console.log("reconnected, re-seeding"); seed(); },
);
