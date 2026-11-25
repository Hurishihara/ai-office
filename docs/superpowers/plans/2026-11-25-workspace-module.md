# Core + Workspace Module Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move shared helpers into `server/src/core/` and preferences, settings and the model list into `server/src/modules/workspace/`, following the DDD convention, with the HTTP API and data files unchanged.

**Architecture:** One aggregate per task. Each gets domain class, use cases, repository/port, and controller with co-located tests. `app.ts`/`index.ts` wire the new use cases in place of the old stores. The existing HTTP tests move to `server/test/api/workspace.test.ts`, with assertions untouched, and run against the real new wiring as the "API didn't change" proof.

**Tech Stack:** TypeScript ESM, Express 5, zod 4 (DTOs only), Vitest 5 + supertest, `@ai-office/shared` types.

**Spec:** `docs/superpowers/specs/2026-11-25-workspace-module-design.md`
**Convention:** `server/src/context/*.md`; checker `server/test/architecture/`; `npm run lint`.

## Global Constraints

- Pure refactor: `GET/PUT /api/preferences`, `GET/PUT /api/settings`, `GET /api/models?role=&freeOnly=` keep status codes, response JSON shape, the 400 `{ error: "<field>: <message>; …" }` format and the 502 message. `data/preferences.json` and `data/settings.json` keep path and shape.
- Preferences: `tone`, `audience`, `hashtags`, `extra` are strings ≤ 2,000 chars; `emoji` ∈ `none` | `light` | `heavy`; defaults `{ tone: "", audience: "", emoji: "light", hashtags: "", extra: "" }`.
- Settings: `writerModel`, `qaModel` non-empty strings (not trimmed, as today); defaults come from config (`.env`) via `index.ts`.
- Models: keep only `supportsTools`; if `freeOnly`, keep only `free`; sort by `name` with `localeCompare`; `role` is `"qa"` when the query says `qa`, otherwise `"writer"`; `freeOnly` is true unless the query is exactly `"false"`; source `https://openrouter.ai/api/v1/models`, cache 3,600,000 ms, stale cache served when the fetch fails; no cache and fetch fails → 502 `{ error: "Could not reach OpenRouter to load the model list. Try again in a moment." }`.
- 400 bodies are `{ error: "<field>: <message>; <field>: <message>" }`.
- Props are primitives; no value objects in workspace. Domain imports only own `domain/`, `core/`, `@ai-office/shared`.
- Use-case and controller tests mock their dependencies with `vi.fn()` typed by `satisfies`. No hand-written fake classes.
- `npm test` (both workspaces) and `npm run lint` green after every task. The architecture test reports zero violations.

## Review Focus

1. **PUT with unknown extra fields:** `{ ...valid, foo: 1 }` must be stripped, as zod does today. The response and the saved file contain no `foo`. (Task 2)
2. **PUT with a missing field:** a body without `emoji` → 400, not saved. (Task 2)
3. **A hand-edited invalid `data/preferences.json`** (e.g. `emoji: "lots"`): GET must answer 500 with an error naming the file, never crash the process and never silently overwrite. (Task 2)
4. **Whitespace model id** `"  "` is accepted for settings, as today (`min(1)` doesn't trim). (Task 3)
5. **OpenRouter down after a successful load:** `/api/models` still answers 200 from the stale cache. (Task 4)

---

## File Structure

```
server/src/core/
  event-bus.ts (+ .test.ts)     EventBus           ← src/events.ts
  json-file.ts (+ .test.ts)     readJson, writeJson ← src/jsonFile.ts
  errors.ts                     NotFoundError, ConflictError, BadRequestError ← pipeline/assignments.ts
server/src/modules/workspace/
  preferences/  domain/preferences.ts
                application/usecases/{get,update}-preferences.usecase.ts
                infra/adapter/preferences.repository.ts
                infra/persistence/{json-preferences.repository,preferences.mapper}.ts
                infra/interface/{preferences.controller,preferences.dto}.ts
  settings/     (same shape, "settings")
  model-catalog/ domain/model-catalog.ts
                application/ports/model-source.port.ts
                application/usecases/list-models.usecase.ts
                infra/external/openrouter-model-source.external.ts
                infra/interface/{models.controller,models.dto}.ts
server/test/api/workspace.test.ts   moved HTTP tests (real wiring, temp data dir)
Deleted: src/events.ts, src/jsonFile.ts, src/preferences.ts, src/settings.ts, src/models/catalog.ts,
         src/routes/{preferences,settings,models}.ts, test/{preferences,settings,catalog}.test.ts
```

---

### Task 1: `core/` and the value-object convention line

**Files:**
- Create: `server/src/core/event-bus.ts`, `event-bus.test.ts`, `json-file.ts`, `json-file.test.ts`, `errors.ts`
- Modify (imports only): `server/src/app.ts`, `server/src/index.ts`, `server/src/pipeline/assignments.ts`, `server/src/routes/events.ts`, `server/src/routes/assignments.ts`, `server/src/preferences.ts`, `server/src/settings.ts`, `server/test/events.test.ts`, `server/test/assignments.test.ts`, and any other importer of the moved names (grep `events.js`, `jsonFile.js`, `NotFoundError|ConflictError|BadRequestError`)
- Modify: `server/src/context/domain-layer.md`
- Delete: `server/src/events.ts`, `server/src/jsonFile.ts`

**Interfaces:**
- Produces:
  - `class EventBus { publish(e: ServerEvent): void; subscribe(fn): () => void; subscriberCount(): number }`, unchanged.
  - `readJson<T>(file: string, fallback: T): Promise<T>` and `writeJson(file: string, value: unknown): Promise<void>`, unchanged.
  - `class NotFoundError`, `ConflictError` and `BadRequestError extends Error`, unchanged, now exported from `core/errors.ts`. `pipeline/assignments.ts` re-exports nothing; importers point at core.

- [ ] **Step 1: Write the failing tests**

```ts
// core/json-file.test.ts
it("returns the fallback when the file is missing", async () => { expect(await readJson(join(dir, "nope.json"), { a: 1 })).toEqual({ a: 1 }); });
it("writeJson creates folders and round-trips", async () => { const f = join(dir, "x/y.json"); await writeJson(f, { b: 2 }); expect(await readJson(f, null)).toEqual({ b: 2 }); });
it("rethrows parse errors instead of falling back", async () => { await writeFile(join(dir, "bad.json"), "{"); await expect(readJson(join(dir, "bad.json"), {})).rejects.toThrow(); });
// core/event-bus.test.ts
it("delivers to subscribers and stops after unsubscribe", () => { const bus = new EventBus(); const fn = vi.fn(); const off = bus.subscribe(fn); bus.publish(e); off(); bus.publish(e); expect(fn).toHaveBeenCalledTimes(1); expect(bus.subscriberCount()).toBe(0); });
```

- [ ] **Step 2: Run** `npm test -w @ai-office/server -- src/core` → FAIL (modules missing).
- [ ] **Step 3: Move with `git mv`** (`src/events.ts` → `src/core/event-bus.ts`, `src/jsonFile.ts` → `src/core/json-file.ts`), create `core/errors.ts` from the three classes, and update every import.
- [ ] **Step 4: Add to `domain-layer.md`** under "What belongs here": "Props are primitives by default. Make a value object only when it has its own behavior or is reused across aggregates."
- [ ] **Step 5: Run** `npm test` (both workspaces) → PASS, same server count + 4 new; `npm run lint` → exit 0.
- [ ] **Step 6: Commit** `refactor(server): move event bus, json file helpers and errors to core`

---

### Task 2: `workspace/preferences`

**Files:**
- Create: everything under `server/src/modules/workspace/preferences/` listed in File Structure, each logic file with a `.test.ts`; `server/test/api/workspace.test.ts`
- Modify: `server/src/app.ts`, `server/src/index.ts`, `server/src/pipeline/assignments.ts` (type only)
- Delete: `server/src/preferences.ts`, `server/src/routes/preferences.ts`, `server/test/preferences.test.ts` (its three tests move into `test/api/workspace.test.ts` with assertions unchanged)

**Interfaces:**
- Consumes: `BadRequestError` (core), `readJson`/`writeJson` (core), `Preferences` type (shared).
- Produces:
  - `class Preferences { private constructor(props: PreferencesProps); static create(props: PreferencesProps): Preferences; static defaults(): Preferences; toJSON(): PreferencesProps }`. `PreferencesProps` is shared `Preferences`. `create` throws `BadRequestError("<field>: <message>; …")`, e.g. `"emoji: must be one of none, light, heavy"` and `"tone: must be at most 2000 characters"`.
  - `interface PreferencesRepository { get(): Promise<Preferences | null>; save(p: Preferences): Promise<void> }`
  - `class JsonPreferencesRepository implements PreferencesRepository { constructor(file: string) }`, using `PreferencesMapper.toDomain(raw: unknown): Preferences` (via `create`) and `toPersistence(p): PreferencesProps`. Invalid stored data throws an `Error` whose message contains the file path.
  - `class GetPreferences { constructor(repo: PreferencesRepository); execute(): Promise<PreferencesProps> }` returns stored data or defaults.
  - `class UpdatePreferences { constructor(repo); execute(input: PreferencesProps): Promise<PreferencesProps> }`
  - `preferencesDto`: zod object of the five fields with the types only (`emoji: z.string()`), strip mode. Domain rules stay in `Preferences.create`.
  - `preferencesController(uc: { get: Pick<GetPreferences, "execute">; update: Pick<UpdatePreferences, "execute"> }): Router`. `BadRequestError` and dto failures → 400 `{ error }` in the Global Constraints format. Other errors → `next(e)`.
  - `AppDeps.preferences` becomes `{ get: …; update: … }` (the controller's argument type). `pipeline/assignments.ts` takes `preferences: { get(): Promise<Preferences> }`. `index.ts` builds the repo plus the use cases, and passes `{ get: () => getPreferences.execute() }` to `AssignmentService`.

- [ ] **Step 1: Write the failing tests**

```ts
// domain/preferences.test.ts
it("defaults match today's", () => expect(Preferences.defaults().toJSON()).toEqual({ tone: "", audience: "", emoji: "light", hashtags: "", extra: "" }));
it("rejects an unknown emoji level", () => expect(() => Preferences.create({ ...d, emoji: "lots" as never })).toThrow("emoji: must be one of none, light, heavy"));
it("accepts 2000 chars and rejects 2001", () => { Preferences.create({ ...d, tone: "a".repeat(2000) }); expect(() => Preferences.create({ ...d, tone: "a".repeat(2001) })).toThrow("tone: must be at most 2000 characters"); });
// application/usecases/get-preferences.usecase.test.ts
it("returns defaults when nothing is stored", async () => { const repo = { get: vi.fn().mockResolvedValue(null), save: vi.fn() } satisfies PreferencesRepository; expect(await new GetPreferences(repo).execute()).toEqual(Preferences.defaults().toJSON()); });
// application/usecases/update-preferences.usecase.test.ts
it("saves valid input and never saves invalid input", /* save called once with a Preferences; invalid emoji → rejects, save not called */);
// infra/persistence/json-preferences.repository.test.ts
it("round-trips through the file in today's shape", /* save then raw JSON.parse(file) equals props; get() returns same */);
it("missing file → null", /* get() === null */);
it("invalid stored file → error naming the file", async () => { await writeFile(file, JSON.stringify({ ...d, emoji: "lots" })); await expect(repo.get()).rejects.toThrow(file); });
// infra/interface/preferences.controller.test.ts
it("PUT strips unknown fields before the use case", /* update mocked; send {...valid, foo:1} → update called with exactly valid */);
it("PUT with a missing field → 400 and update not called");
it("domain BadRequestError → 400 { error }");
// test/api/workspace.test.ts — the three tests from test/preferences.test.ts, assertions unchanged, app built with real JsonPreferencesRepository on a temp dir
```

- [ ] **Step 2: Run** `npm test -w @ai-office/server -- src/modules/workspace/preferences test/api` → FAIL.
- [ ] **Step 3: Implement the files; rewire `app.ts`/`index.ts`/`pipeline/assignments.ts`; delete the old files.**
- [ ] **Step 4: Run** `npm test` (both workspaces) → PASS; `npm run lint` → exit 0; manual: `npm run dev:server` + `curl -s localhost:3001/api/preferences` returns the same JSON as before.
- [ ] **Step 5: Commit** `refactor(server): workspace/preferences aggregate`

---

### Task 3: `workspace/settings`

**Files:** same shape as Task 2 under `server/src/modules/workspace/settings/`; modify `app.ts`, `index.ts`, `test/api/workspace.test.ts`; delete `src/settings.ts`, `src/routes/settings.ts`, `test/settings.test.ts` (its three tests move to `test/api/workspace.test.ts`, assertions unchanged).

**Interfaces:**
- Produces:
  - `class Settings { static create(props: SettingsProps): Settings; toJSON(): SettingsProps }`. `SettingsProps` is shared `Settings`. An empty string gives `BadRequestError("writerModel: must not be empty")` (same for `qaModel`). Not trimmed.
  - `interface SettingsRepository { get(): Promise<Settings | null>; save(s: Settings): Promise<void> }`; `JsonSettingsRepository(file)`; `SettingsMapper.toDomain/toPersistence`.
  - `GetSettings(repo, defaults: SettingsProps).execute(): Promise<SettingsProps>`; `UpdateSettings(repo).execute(input): Promise<SettingsProps>`.
  - `settingsDto` (two strings, strip), `settingsController(uc: { get; update }): Router`.
  - `AppDeps.settings` becomes `{ get; update }`. In `index.ts` the model thunk becomes `pick(await getSettings.execute())`.

- [ ] **Step 1: Write the failing tests** — mirror Task 2's set, plus:

```ts
it("whitespace model id is accepted, as today", () => expect(Settings.create({ writerModel: "  ", qaModel: "q" }).toJSON().writerModel).toBe("  "));
it("GetSettings falls back to the injected defaults", async () => { const repo = { get: vi.fn().mockResolvedValue(null), save: vi.fn() } satisfies SettingsRepository; expect(await new GetSettings(repo, { writerModel: "w", qaModel: "q" }).execute()).toEqual({ writerModel: "w", qaModel: "q" }); });
```

- [ ] **Step 2: Run** the focused tests → FAIL. **Step 3: Implement, rewire, delete old.** **Step 4: Run** `npm test` + `npm run lint` → green.
- [ ] **Step 5: Commit** `refactor(server): workspace/settings aggregate`

---

### Task 4: `workspace/model-catalog`

**Files:** under `server/src/modules/workspace/model-catalog/` per File Structure. The fixture `server/test/fixtures/openrouter-models.json` stays and is reused. Modify `app.ts`, `index.ts`, `test/api/workspace.test.ts`. Delete `src/models/catalog.ts`, `src/routes/models.ts`, `test/catalog.test.ts`; its tests are split to their new homes with assertions unchanged.

**Interfaces:**
- Produces:
  - `class ModelCatalog { constructor(models: ModelInfo[]); select(opts: { role: "writer" | "qa"; freeOnly: boolean }): ModelInfo[] }`, with the rules in Global Constraints. `role` stays in the signature even though both roles filter the same way today.
  - `interface ModelSource { list(): Promise<ModelInfo[]> }`
  - `class OpenRouterModelSource implements ModelSource { constructor(opts?: { fetchFn?: typeof fetch; ttlMs?: number; now?: () => number }) }`, plus exported `toModelInfo(raw): ModelInfo`. Caching, stale fallback and the error when there's no cache are all as today.
  - `class ListModels { constructor(source: ModelSource); execute(opts: { role; freeOnly }): Promise<ModelInfo[]> }`
  - `modelsQueryDto`: parses `role` and `freeOnly` from the query using the Global Constraints rules. `modelsController(uc: { list: Pick<ListModels, "execute"> }): Router` turns any use-case error into 502 with the exact message.
  - `AppDeps.models` is `{ list }`, replacing `catalog`. `index.ts` builds `new ListModels(new OpenRouterModelSource())`.

- [ ] **Step 1: Write the failing tests** — move today's catalog tests:
  - "writer list = free, tool-capable only by default" and "freeOnly=false adds paid tool-capable models" → `domain/model-catalog.test.ts`
  - "caches for an hour", "serves stale cache when OpenRouter is unreachable" and "throws when unreachable with no cache" → `infra/external/openrouter-model-source.external.test.ts`
  - "GET /api/models filters and defaults to freeOnly" → `test/api/workspace.test.ts`, using a `fetchFn` stub that returns the fixture

  Then add:

```ts
// infra/interface/models.controller.test.ts
it("role=qa and freeOnly=false reach the use case", /* list mocked; GET ?role=qa&freeOnly=false → execute called with { role: "qa", freeOnly: false } */);
it("anything but freeOnly=false means freeOnly true", /* ?freeOnly=0 → freeOnly: true */);
it("use case failure → 502 with today's message");
```

- [ ] **Step 2: Run** the focused tests → FAIL. **Step 3: Implement, rewire, delete old.** **Step 4: Run** `npm test` + `npm run lint` → green. Then check `ls server/src` shows no `preferences.ts`, `settings.ts`, `events.ts` or `jsonFile.ts`, and that `server/src/models/` holds only `openrouter.ts`.
- [ ] **Step 5: Manual check** — start the server and client. In the browser, the preferences desk loads and saves, and the reception model picker lists free models and shows prices when "Free only" is off.
- [ ] **Step 6: Commit** `refactor(server): workspace/model-catalog aggregate`

---

## Done when

The spec's "Done when" holds: tests and lint green, zero architecture violations, old workspace files gone, client unchanged.
