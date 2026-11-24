import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import type { AgentId, AgentState } from "@ai-office/shared";
import type { TowerView } from "./tower";

const FLOOR_OF: Record<AgentId, number> = { writer: 1, qa: 2 };
const COLOR: Record<AgentId, number> = { writer: 0x4a7fd1, qa: 0xd1884a };
const GLYPH: Record<AgentState, string> = { idle: "", thinking: "…", waiting: "!", error: "⚠" };

export class AgentFigures {
  private bubbles = new Map<AgentId, { obj: CSS2DObject; el: HTMLElement }>();

  constructor(scene: THREE.Scene, tower: TowerView) {
    for (const id of ["writer", "qa"] as const) {
      const p = tower.anchor(id, FLOOR_OF[id]);
      const fig = new THREE.Group();
      fig.position.copy(p).add(new THREE.Vector3(0, 0.5, -1.5)); // inside the desk footprint, raised so the torso shows above the 1m desk
      const mat = new THREE.MeshLambertMaterial({ color: COLOR[id] });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), mat);
      body.position.y = 0.45;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshLambertMaterial({ color: 0xf2d2b0 }));
      head.position.y = 1.15;
      fig.add(body, head);

      const el = document.createElement("div");
      el.className = "agent-bubble";
      const obj = new CSS2DObject(el);
      obj.position.y = 1.7;
      obj.visible = false; // CSS2DRenderer owns element.style.display
      fig.add(obj);
      scene.add(fig);
      this.bubbles.set(id, { obj, el });
    }
  }

  setState(agent: AgentId, state: AgentState): void {
    const b = this.bubbles.get(agent)!;
    b.el.textContent = GLYPH[state];
    b.el.dataset.state = state;
    b.obj.visible = state !== "idle";
  }
}
