import "./style.css";
import * as THREE from "three";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { api, subscribeEvents } from "./api";
import { FollowCamera } from "./scene/camera";
import { FLOORS, SHAFT_X } from "./scene/floors";
import { Keys } from "./scene/input";
import { nearestInteractable } from "./scene/interact";
import { Player } from "./scene/player";
import { buildTower } from "./scene/tower";
import { openElevator } from "./ui/elevatorPanel";
import { openNotesPanel } from "./ui/notesPanel";
import { bindPanelKeys } from "./ui/panel";
import { openPreferencesPanel } from "./ui/preferencesPanel";
import { openReceptionPanel } from "./ui/receptionPanel";
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
const player = new Player(tower, scene);
player.teleport(focus, FLOORS[focus].spawn);
const keys = new Keys(window);
bindPanelKeys(keys);

const prompt = document.createElement("div");
prompt.textContent = "E";
prompt.style.cssText = "position:absolute;pointer-events:none;padding:2px 8px;border-radius:4px;background:#fff;color:#111;font:bold 14px system-ui";
const promptObj = new CSS2DObject(prompt);
promptObj.position.y = 2.2;
player.mesh.add(promptObj);

const pickFloor = (i: number) => {
  player.teleport(i, { x: SHAFT_X - 2, z: 1.5 }); // just outside the shaft
  tower.setFocus(i);
  followCam.glideToFloor(tower.floorY(i) + 1.5); // eye height, same as the follow target
};
const openPanelFor = (id: string) => {
  if (id === "elevator") openElevator(player.floor, FLOORS, pickFloor);
  else if (id === "notes") openNotesPanel();
  else if (id === "preferences") openPreferencesPanel();
  else if (id === "reception") openReceptionPanel();
  else console.log("openPanelFor", id); // stub until Tasks 5/7
};
const inRange = () => nearestInteractable(player.pos, FLOORS[player.floor].interactables);
keys.onInteract(() => { const it = inRange(); if (it) openPanelFor(it.id); });
const eye = new THREE.Vector3();

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
  const dt = Math.min(clock.getDelta(), 0.1);
  player.update(dt, keys.direction(), FLOORS[player.floor]);
  promptObj.visible = !!inRange(); // CSS2DRenderer owns element.style.display
  followCam.follow(eye.set(player.pos.x, tower.floorY(player.floor) + 1.5, 0), dt);
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
