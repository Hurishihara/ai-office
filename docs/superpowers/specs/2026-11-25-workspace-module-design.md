# Migrate core/ + workspace module — Design (short)

Date: 2026-11-25
Status: approved by owner 2026-11-25
Convention: `server/src/context/*.md`, enforced by `server/test/architecture/` and `npm run lint`.

## Intent

First real migration into `server/src/modules/`. Goal is readable code that follows the convention; **pure refactor** — the HTTP API, response JSON, and `data/preferences.json` / `data/settings.json` formats stay identical. Module/aggregate names decided by owner: module `workspace` with aggregates `preferences`, `settings`, `model-catalog`.

**Non-goals:** migrating `knowledge` (notes) or `studio` (pipeline); changing client code; new features.

## Approaches

- **A · Aggregate by aggregate, old HTTP tests as safety net (picked).** core first, then each aggregate: build its three layers with co-located tests, switch wiring, delete the old file; the existing `test/preferences.test.ts`, `settings.test.ts`, `catalog.test.ts` keep running against the new wiring until that aggregate's `*.controller.test.ts` replaces them. Small green steps.
- B · All of workspace in one change — one big diff, harder to spot an API break.
- C · Build in parallel, flip at the end — two copies live in the repo meanwhile.

## Decisions

**Owner:**
- Each aggregate has `domain/`, `application/`, `infra/`; folders exist only when they hold a file.
- **Props are primitives by default; a value object only when it has its own behavior or is reused across aggregates.** Workspace therefore has no value objects. Add this line to `server/src/context/domain-layer.md`.
- Approach A.

**Layout:**
```
server/src/core/
  event-bus.ts            (from src/events.ts — EventBus class)
  json-file.ts            (from src/jsonFile.ts — readJson/writeJson)
  errors.ts               (NotFoundError, ConflictError, BadRequestError from pipeline/assignments.ts)
server/src/modules/workspace/
  preferences/
    domain/          preferences.ts
    application/usecases/  get-preferences.usecase.ts, update-preferences.usecase.ts
    infra/adapter/   preferences.repository.ts
    infra/persistence/  json-preferences.repository.ts, preferences.mapper.ts
    infra/interface/ preferences.controller.ts, preferences.dto.ts
  settings/          (same shape: settings.ts, get/update-settings, json-settings.repository, settings.mapper, settings.controller/dto)
  model-catalog/
    domain/          model-catalog.ts
    application/ports/     model-source.port.ts
    application/usecases/  list-models.usecase.ts
    infra/external/  openrouter-model-source.external.ts
    infra/interface/ models.controller.ts, models.dto.ts
```
Every file gets a co-located `.test.ts` where it has logic.

**Behaviour carried over exactly (Claude's calls, from today's code):**
- `Preferences`: tone/audience/hashtags/extra strings ≤ 2,000 chars; emoji ∈ none/light/heavy; defaults `{ tone:"", audience:"", emoji:"light", hashtags:"", extra:"" }`. Invalid input → domain error mapped to HTTP 400 `{ error }`.
- `Settings`: `writerModel`, `qaModel` non-empty strings; defaults injected from config (`.env`) by `index.ts`.
- `ModelCatalog`: `select({ role, freeOnly })` keeps models with tools, drops non-free when `freeOnly`, sorts by name (current `filterModels`). `OpenRouterModelSource` keeps fetch of `https://openrouter.ai/api/v1/models`, `toModelInfo` mapping, 1-hour cache, stale-cache fallback. Fetch failure → 502 with today's message.
- Request shape checks (zod) live in `*.dto.ts`; domain rules live in the aggregates; the 400 message format `"<path>: <message>; …"` is preserved.
- Data files: JSON repositories read/write via `core/json-file.ts`, same paths and shape; missing file → defaults.
- `ModelInfo`, `Preferences`, `Settings` types keep coming from `@ai-office/shared` (API contract); aggregates expose `toJSON()`/mapper output in that shape.

**Old callers (Claude's calls):** `pipeline/assignments.ts` takes `{ get(): Promise<Preferences> }` instead of `PreferencesStore`; `index.ts` passes `{ get: () => getPreferences.execute() }` and builds the settings thunk from `GetSettings`. `app.ts`'s `AppDeps` swaps stores/catalog for the three controllers' use cases. Old files `preferences.ts`, `settings.ts`, `models/catalog.ts`, `routes/{preferences,settings,models}.ts`, `events.ts`, `jsonFile.ts` are deleted when replaced; `models/openrouter.ts` stays (used by pipeline/notes until those migrate).

## Done when

`npm test` (both workspaces) and `npm run lint` green; architecture test scans the new `modules/workspace` with zero violations; the client works unchanged (preferences desk, reception model picker); old workspace files and their `test/*.test.ts` are gone.
