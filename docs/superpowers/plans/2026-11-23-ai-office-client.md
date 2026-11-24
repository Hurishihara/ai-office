# AI Office Client (3D Office) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The cutaway-tower office in the browser: walk floors with WASD, ride the elevator, press E at agents and objects to open HTML panels that drive the backend's notes, preferences, model picker and writer → QA pipeline.

**Architecture:** Vite + TypeScript + Three.js, no UI framework. The scene (tower, player, camera, agents) and the panels (plain DOM over the canvas) share one small `OfficeState` updated from the backend's SSE stream. Game logic that can be wrong without looking wrong — collision, interaction range, event handling, source splitting, file checks — lives in pure functions with Vitest tests; the scene itself is checked by hand in the browser.

**Tech Stack:** Vite 8, TypeScript, Three.js 0.187 (`CSS2DRenderer` for bubbles, `GLTFLoader` for optional models), Vitest, `@ai-office/shared` types.

**Spec:** `docs/superpowers/specs/2026-11-23-ai-office-design.md`

**Depends on:** `docs/superpowers/plans/2026-11-23-ai-office-backend.md` fully done (routes and `@ai-office/shared`).

## Global Constraints

- Layout: cutaway tower, bottom to top: Lobby (notes cabinet, preferences desk, reception desk), Writer studio, QA studio, Creative (locked), Research (locked). Elevator shaft on the right.
- One floor in focus; camera follows the player at a fixed side angle; other floors visible but dimmed.
- WASD movement; collision only with the current floor's walls/furniture as boxes; no physics engine.
- E interacts with the nearest agent/object in range; interaction opens an HTML overlay panel, not 3D UI.
- Agent bubbles: idle (none), thinking `…`, waiting for user `!`, error `⚠`.
- Writer → QA handoff shown as a paper icon rising to the QA floor.
- Locked floors: grey, "Coming soon" sign; listed but disabled in the elevator.
- Note files accepted: `.txt` / `.md`, ≤ 1 MB (1,048,576 bytes); read in the browser with `file.text()` and sent as JSON. Note rules, platform limits and `countChars` come from `@ai-office/shared`; the client never copies them.
- Vite dev server stays on loopback (Vite's default `localhost`); don't add `--host`.
- Source cards split into **Used** and **Found, not used**.
- Copy button on the approved post only; no auto-posting.
- Art: primitives first; Kenney CC0 models are an optional final swap the owner downloads.

## Review Focus

1. **Typing in a panel** — W/A/S/D/E typed into a textarea must not move the player or trigger interact. (Task 3)
2. **Keys held when a panel opens** — opening a panel or the elevator while walking must stop the player, not leave a key stuck down. (Task 3)
3. **Dropping several files at once, some invalid** — valid ones are added, each invalid one is listed with its reason. (Task 5)
4. **Backend restarts while the page is open** — the SSE stream reconnects and the office refetches assignments, so bubbles and panels aren't stale. (Task 1)
5. **Window resize** — renderer, camera aspect and bubble layer follow the window size. (Task 2)

---

## File Structure

```
client/
  package.json            name "@ai-office/client"; vite, three, vitest
  vite.config.ts          proxy /api → http://localhost:3001
  index.html
  src/
    main.ts               boot: scene + state + panels + loop
    api.ts                typed fetch per route + subscribeEvents
    state.ts              OfficeState, applyEvent
    scene/floors.ts       FLOORS config (ids, labels, locked, props, interactables)
    scene/tower.ts        buildTower → TowerView
    scene/camera.ts       FollowCamera
    scene/input.ts        Keys (WASD/E), isTypingTarget, clear()
    scene/collision.ts    moveWithCollision
    scene/interact.ts     nearestInteractable
    scene/player.ts       Player
    scene/agents.ts       AgentFigures (+ CSS2D bubbles)
    scene/handoff.ts      playHandoff
    ui/panel.ts           Panel shell (open/close/Esc)
    ui/files.ts           filterDroppedFiles
    ui/sources.ts         splitSources
    ui/notesPanel.ts  ui/preferencesPanel.ts  ui/receptionPanel.ts
    ui/elevatorPanel.ts  ui/writerPanel.ts  ui/qaPanel.ts
    style.css
  test/*.test.ts
```

---

### Task 1: Client scaffold, API client, office state

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/index.html`, `client/src/main.ts`, `client/src/api.ts`, `client/src/state.ts`, `client/src/style.css`
- Modify: root `package.json` (script `"dev:client": "npm run dev -w @ai-office/client"`, `"test"` runs both workspaces)
- Test: `client/test/state.test.ts`

**Interfaces:**
- Consumes: every type in `@ai-office/shared`; backend routes from backend plan Tasks 2–4, 8.
- Produces:
  - `api`: `getPreferences(): Promise<Preferences>`, `savePreferences(p)`, `getSettings()`, `saveSettings(s)`, `getModels(role: "writer"|"qa", freeOnly: boolean): Promise<ModelInfo[]>`, `listNotes(): Promise<NoteSummary[]>`, `addNote(b: CreateNoteBody): Promise<NoteSummary>`, `deleteNote(id)`, `startAssignment(platform, ask): Promise<AssignmentSummary>`, `listAssignments()`, `getAssignment(id): Promise<AssignmentView>`, `decide(id, d: UserDecision): Promise<AssignmentView>`, `retry(id)`. Non-2xx → throws `ApiError { status: number; message: string }` using the body's `error`.
  - `subscribeEvents(onEvent: (e: ServerEvent) => void, onReconnect: () => void): () => void` — `EventSource("/api/events")`; calls `onReconnect` on every `open` after the first.
  - `interface OfficeState { agents: Record<AgentId, AgentState>; assignments: AssignmentSummary[]; lastHandoff: string | null }`; `initialState(): OfficeState` (agents idle, empty list); `applyEvent(s: OfficeState, e: ServerEvent): OfficeState` (pure; `assignment` upserts by id keeping newest-first order; `handoff` sets `lastHandoff`); `createStore(initial)` with `get()`, `set(next)`, `subscribe(fn)`.

- [ ] **Step 1: Scaffold** — `npm create vite@latest client -- --template vanilla-ts`, set package name, `npm i -w @ai-office/client three @ai-office/shared` and `-D @types/three vitest`. Vite proxy `/api` → `http://localhost:3001`.
- [ ] **Step 2: Write the failing tests**

```ts
it("agent events set that agent's state only", () => {
  const s = applyEvent(initialState(), { type: "agent", agent: "qa", state: "waiting" });
  expect(s.agents).toEqual({ writer: "idle", qa: "waiting" });
});
it("assignment events upsert by id", () => {
  let s = applyEvent(initialState(), { type: "assignment", assignment: a("1", "writing") });
  s = applyEvent(s, { type: "assignment", assignment: a("1", "awaiting_user") });
  expect(s.assignments).toHaveLength(1);
  expect(s.assignments[0].status).toBe("awaiting_user");
});
it("handoff records the assignment id", /* lastHandoff === "1" */);
it("applyEvent does not mutate its input");
```

- [ ] **Step 3: Run** — `npm test -w @ai-office/client` → FAIL. **Step 4: Implement `api.ts`, `state.ts`.** **Step 5: Run** — PASS.
- [ ] **Step 6: Manual check (Review Focus 4)** — backend running, `npm run dev:client`, `main.ts` temporarily logs events; stop and restart the server → console shows a reconnect and a fresh `listAssignments()` call.
- [ ] **Step 7: Commit** — `feat(client): scaffold, typed api client, office state from sse`

---

### Task 2: The tower scene

**Files:**
- Create: `client/src/scene/floors.ts`, `client/src/scene/tower.ts`, `client/src/scene/camera.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Produces:
  - `type FloorId = "lobby" | "writer" | "qa" | "creative" | "research"`.
  - `interface Interactable { id: "notes" | "preferences" | "reception" | "writer" | "qa" | "elevator"; x: number; z: number; radius: number }`; `interface Box2D { minX: number; maxX: number; minZ: number; maxZ: number }`.
  - `interface FloorDef { id: FloorId; label: string; locked: boolean; colliders: Box2D[]; interactables: Interactable[]; spawn: { x: number; z: number } }`; `FLOORS: FloorDef[]` bottom to top in the Global Constraints order. Every unlocked floor has an `elevator` interactable at the shaft. Constants `FLOOR_WIDTH`, `FLOOR_DEPTH`, `FLOOR_HEIGHT` (builder's values).
  - `buildTower(scene: THREE.Scene, floors: FloorDef[]): TowerView` where `TowerView = { floorY(i: number): number; setFocus(i: number): void; anchor(id: Interactable["id"], floor: number): THREE.Vector3 }`. Cutaway = back wall + side walls + floor slab, open front. Locked floors grey with a "Coming soon" sign (`CanvasTexture` on a plane). `setFocus` dims all other floors (multiply their material colours by ~0.4).
  - `class FollowCamera { constructor(camera: THREE.PerspectiveCamera); follow(target: THREE.Vector3, dt: number): void; glideToFloor(y: number): void }` — fixed side offset, smooth damped follow; `glideToFloor` eases to the new height over ~0.8 s.
  - `main.ts`: `WebGLRenderer` + `CSS2DRenderer` overlay, hemisphere + directional light, `resize()` on window resize updating both renderers' size and `camera.aspect` (Review Focus 5).

- [ ] **Step 1: Implement floors, tower, camera; render the tower with focus on the lobby.**
- [ ] **Step 2: Manual check** — `npm run dev:client`, open `http://localhost:5173`: five stacked floors open to the front, elevator shaft right, lobby bright, others dimmed, top two grey with "Coming soon". Resize the window: no stretching.
- [ ] **Step 3: Commit** — `feat(client): cutaway tower scene with follow camera`

---

### Task 3: Player, input, collision, interaction

**Files:**
- Create: `client/src/scene/input.ts`, `client/src/scene/collision.ts`, `client/src/scene/interact.ts`, `client/src/scene/player.ts`
- Modify: `client/src/main.ts`
- Test: `client/test/collision.test.ts`, `client/test/interact.test.ts`, `client/test/input.test.ts`

**Interfaces:**
- Consumes: `FloorDef`, `Box2D`, `Interactable`, `TowerView`, `FollowCamera`.
- Produces:
  - `moveWithCollision(pos: {x,z}, delta: {x,z}, radius: number, colliders: Box2D[]): {x,z}` — resolve X then Z separately so the player slides along walls; a move that would overlap a box (inflated by `radius`) is cancelled on that axis only. Floor bounds are colliders too.
  - `nearestInteractable(pos: {x,z}, items: Interactable[]): Interactable | null` — closest whose distance ≤ its `radius`.
  - `isTypingTarget(el: Element | null): boolean` — true for `input`, `textarea`, `select`, `[contenteditable]`.
  - `class Keys { constructor(target: Window); readonly enabled: boolean; setEnabled(on: boolean): void; direction(): {x,z} /* normalised WASD */; onInteract(fn: () => void): void }` — ignores keydown when `isTypingTarget(document.activeElement)`; `setEnabled(false)` clears held keys; clears held keys on window `blur`.
  - `class Player { mesh: THREE.Object3D; floor: number; pos: {x,z}; update(dt: number, dir: {x,z}, floor: FloorDef): void; teleport(floor: number, at: {x,z}): void }` — speed constant builder's choice; faces movement direction.
  - In `main.ts`: when `Keys.onInteract` fires, `nearestInteractable` on the current floor → `openPanelFor(id)` (stub log until Task 5); a small "E" prompt appears near the player while something is in range.

- [ ] **Step 1: Write the failing tests**

```ts
const wall: Box2D = { minX: 1, maxX: 2, minZ: -5, maxZ: 5 };
it("stops at a wall on X but keeps sliding on Z", () => {
  expect(moveWithCollision({ x: 0, z: 0 }, { x: 0.8, z: 0.5 }, 0.3, [wall])).toEqual({ x: 0, z: 0.5 });
});
it("moves freely with no colliders", /* {x:0.8,z:0.5} */);
it("picks the closest interactable in range and ignores ones out of range", () => {
  const items = [{ id: "notes", x: 1, z: 0, radius: 1.5 }, { id: "reception", x: 0.5, z: 0, radius: 1.5 }, { id: "writer", x: 9, z: 0, radius: 1.5 }];
  expect(nearestInteractable({ x: 0, z: 0 }, items as any)?.id).toBe("reception");
  expect(nearestInteractable({ x: 20, z: 0 }, items as any)).toBeNull();
});
it("treats textarea, input and contenteditable as typing targets", /* uses minimal fake elements with tagName / isContentEditable */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Manual check** — walk the lobby with WASD, can't pass walls/furniture, "E" prompt appears near the cabinet, desk and reception.
- [ ] **Step 6: Commit** — `feat(client): wasd player with box collision and interaction range`

---

### Task 4: Elevator

**Files:**
- Create: `client/src/ui/panel.ts`, `client/src/ui/elevatorPanel.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Produces:
  - `class Panel { constructor(opts: { title: string; onClose?: () => void }); readonly root: HTMLElement; open(): void; close(): void; isOpen(): boolean }` — one overlay at a time (opening one closes another); Esc and a close button close it; while any panel is open `Keys.setEnabled(false)` (Review Focus 2), re-enabled on close; first focusable element focused on open.
  - `openElevator(current: number, floors: FloorDef[], onPick: (i: number) => void): void` — lists floors top to bottom; locked ones disabled with "Coming soon"; current marked.
  - On pick: `player.teleport(i, FLOORS[i].spawn near elevator)`, `tower.setFocus(i)`, `camera.glideToFloor(tower.floorY(i))`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual check** — walk to the elevator, E, pick Writer → camera glides up, Writer floor bright, lobby dimmed; Creative/Research can't be picked; hold W while pressing E at the elevator → after closing, the player is not walking on its own.
- [ ] **Step 3: Commit** — `feat(client): elevator floor picker with camera glide`

---

### Task 5: Lobby panels — notes, preferences, reception

**Files:**
- Create: `client/src/ui/files.ts`, `client/src/ui/notesPanel.ts`, `client/src/ui/preferencesPanel.ts`, `client/src/ui/receptionPanel.ts`
- Modify: `client/src/main.ts`
- Test: `client/test/files.test.ts`

**Interfaces:**
- Consumes: `Panel`, `api.*`.
- Produces:
  - `filterDroppedFiles(files: { name: string; size: number }[]): { accepted: typeof files; rejected: { name: string; reason: string }[] }` — uses `isAllowedNoteSource`, `MAX_NOTE_BYTES` and `NOTE_ERRORS` imported from `@ai-office/shared` (never redefined in the client), so browser and server give the same reasons; size 0 → `NOTE_ERRORS.empty`.
  - `openNotesPanel()` — textarea + title input + Add (sends `source: "typed"`, title defaults to the first line, max 200 chars); drop zone (`dragover`/`drop`) reading accepted files with `file.text()` and posting each (`title` = filename without extension, `source` = filename); list newest first with ✕ delete; server errors (e.g. 503 Chroma hint) shown inline in the panel.
  - `openPreferencesPanel()` — form for `tone`, `audience`, `emoji` (select none/light/heavy), `hashtags`, `extra`; Save → `savePreferences`.
  - `openReceptionPanel()` — Writer and QA model selects filled from `getModels(role, freeOnly)`; "Free only" checkbox (default on) refetches; paid models show `promptPrice`/`completionPrice`; Save → `saveSettings`; a line explaining the embedding model is set in `.env` because changing it needs a re-index.

- [ ] **Step 1: Write the failing tests**

```ts
it("accepts .txt and .MD, rejects others with the server's reason", () => {
  const r = filterDroppedFiles([{ name: "a.txt", size: 10 }, { name: "b.MD", size: 10 }, { name: "c.pdf", size: 10 }]);
  expect(r.accepted.map(f => f.name)).toEqual(["a.txt", "b.MD"]);
  expect(r.rejected).toEqual([{ name: "c.pdf", reason: "Only .txt and .md files are supported" }]);
});
it("rejects files over 1 MB and empty files", /* size 1_048_577 → "Note is over 1 MB"; size 0 → "Note is empty" */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Manual check** — backend + Chroma up: add a typed note; drop `a.txt`, `b.md`, `c.pdf` together → two added, `c.pdf` listed as rejected (Review Focus 3); type "wasd e" in the textarea → player doesn't move (Review Focus 1); save preferences and reload → values persist; reception lists free tool-capable models, unticking "Free only" shows prices.
- [ ] **Step 6: Commit** — `feat(client): notes, preferences and model picker panels`

---

### Task 6: Agents, bubbles, handoff

**Files:**
- Create: `client/src/scene/agents.ts`, `client/src/scene/handoff.ts`
- Modify: `client/src/main.ts`

**Interfaces:**
- Consumes: `TowerView.anchor`, `OfficeState`, `createStore`, `subscribeEvents`.
- Produces:
  - `class AgentFigures { constructor(scene: THREE.Scene, tower: TowerView); setState(agent: AgentId, state: AgentState): void }` — one low-poly figure at a desk on the Writer and QA floors; bubble is a `CSS2DObject` above the head: idle → hidden, thinking → `…` (gently pulsing via CSS), waiting → `!`, error → `⚠`. Bubbles stay visible when that floor is dimmed, so you can see from the lobby who needs you.
  - `playHandoff(scene: THREE.Scene, from: THREE.Vector3, to: THREE.Vector3): void` — small white plane rises from the writer desk to the QA desk over ~1.2 s, then is removed.
  - `main.ts` wires: store updates → `AgentFigures.setState`; a changed `lastHandoff` → `playHandoff(tower.anchor("writer",1), tower.anchor("qa",2))`. On load and on reconnect, `listAssignments()` seeds the store, and an assignment in `awaiting_user` sets QA to `waiting`.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Manual check** — start an assignment with `curl` (backend plan Task 8 Step 5): from the lobby, the writer shows `…`, a paper rises to QA, QA shows `…` then `!`.
- [ ] **Step 3: Commit** — `feat(client): agent figures with state bubbles and handoff animation`

---

### Task 7: Writer and QA panels

**Files:**
- Create: `client/src/ui/sources.ts`, `client/src/ui/writerPanel.ts`, `client/src/ui/qaPanel.ts`
- Modify: `client/src/main.ts`
- Test: `client/test/sources.test.ts`

**Interfaces:**
- Consumes: `api.startAssignment/getAssignment/decide/retry/listAssignments`, `OfficeState`, `ServerEvent` (`search` events).
- Produces:
  - `interface SourceCard { noteId: string; title: string; excerpts: string[]; bestScore: number }`; `splitSources(retrieved: RetrievedChunk[], usedNoteIds: string[]): { used: SourceCard[]; unused: SourceCard[] }` — one card per note (chunks merged in `chunkIndex` order), `used` in `usedNoteIds` order, `unused` by `bestScore` descending.
  - `openWriterPanel()` — platform select (X / LinkedIn / Instagram) + ask textarea + Start; live feed of `search` events for the active assignment (`searching notes: "<query>" → <hits> chunks`); when the draft exists: draft text, character count vs the platform limit (`countChars(draft)` / `PLATFORM_LIMITS[platform]` from `@ai-office/shared`; turns red when over), Used / Found-not-used cards; list of past assignments with status, click to load it read-only.
  - `openQaPanel()` — the assignment in `awaiting_user` (or the latest one): draft, QA verdict + issues + suggestions, the same source cards, "Round n of 3"; buttons Approve, Revise (needs the feedback textarea; hidden when `canRevise` is false), Discard. Approved → final post with a Copy button (`navigator.clipboard.writeText`) showing "Copied". Status `error` → error text + Retry. API errors (409/400) shown inline, then the panel reloads the assignment.

- [ ] **Step 1: Write the failing tests**

```ts
it("splits notes into used (in cited order) and found-not-used (by score)", () => {
  const r = splitSources([c("a", 0, 0.9), c("b", 0, 0.5), c("a", 1, 0.7), c("d", 0, 0.8)], ["b", "a"]);
  expect(r.used.map(x => x.noteId)).toEqual(["b", "a"]);
  expect(r.used[1].excerpts).toHaveLength(2);
  expect(r.unused.map(x => x.noteId)).toEqual(["d"]);
});
it("no retrieved notes gives two empty lists", /* {used:[],unused:[]} */);
```

- [ ] **Step 2: Run** — FAIL. **Step 3: Implement.** **Step 4: Run** — PASS.
- [ ] **Step 5: Full manual walkthrough** — with ~10 notes: Writer floor → E at the writer → start an X post → watch searches, then the draft and source cards; elevator to QA → E → read the review → Revise with feedback → round 2 → Revise → round 3 has no Revise button → Approve → Copy pastes the post. Double-click Approve → one 409 message, no crash.
- [ ] **Step 6: Commit** — `feat(client): writer and qa panels with source cards and copy`

---

### Task 8 (optional): Kenney CC0 models

**Files:**
- Modify: `client/src/scene/tower.ts`, `client/src/scene/agents.ts`, `client/src/scene/player.ts`
- Create: `client/public/models/` (owner-provided files)

**Interfaces:**
- Produces: `loadModel(path: string): Promise<THREE.Object3D | null>` via `GLTFLoader`; returns `null` on failure so every caller keeps its primitive box.

- [ ] **Step 1: Owner downloads** — ask the owner to download Kenney's furniture and character packs (CC0, kenney.nl) and copy the chosen `.glb` files into `client/public/models/`. Do not download them yourself.
- [ ] **Step 2: Swap desks, chairs, cabinet, figures and player for models where a file exists; colliders stay the same boxes.**
- [ ] **Step 3: Manual check** — scene shows models; renaming one file away falls back to the box with no error overlay.
- [ ] **Step 4: Commit** — `feat(client): kenney cc0 models with primitive fallback`

---

## Done when

`npm test` passes for both workspaces, and the Task 7 walkthrough works end to end in the browser against the real backend.
