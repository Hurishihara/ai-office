# Backend DDD Convention — Design (short)

Date: 2026-11-25
Status: approved by owner 2026-11-25

## Intent

The backend (`server/src`) grew by technical type (`routes/`, `notes/`, `pipeline/`, loose `preferences.ts`/`settings.ts`) and is hard to read. The owner, who has worked with DDD and hexagonal (ports and adapters) before, wants one written standard — DDD + TDD — so the code is predictable, and so agents follow it too. Success = every backend file has one obvious place and one obvious name, and a wrong import or a wrong file name fails `npm test` / `npm run lint`.

**Non-goals:** moving the existing code. Migration happens afterwards, one module at a time, each with its own plan. No changes to `client/` or `shared/`.

## Approaches

- A · Documents only — cheapest; nothing stops drift, which is how the code got messy.
- B · Documents + ESLint import boundaries — editor feedback while typing; adds ESLint (repo has none).
- C · Documents + one architecture test — no new packages; rules fail `npm test`.

**Picked: C + ESLint** (owner). Both enforce the same rules: the test is the source of truth in CI-style runs, ESLint gives in-editor feedback. ESLint uses built-in `no-restricted-imports` per folder for boundaries, and `eslint-plugin-check-file` for file names.

## Structure (owner's decisions)

```
server/src/
  core/                              shared by all modules only (EventBus, NotFoundError/ConflictError/BadRequestError, readJson/writeJson)
  context/                           the instruction files + architecture.test.ts
  modules/<module>/                  module = one domain, holds its aggregates
    application/services/            module-level service ports (e.g. assignment-workflow.service.ts)
    infra/services/                  their implementations (e.g. langgraph-assignment-workflow.service.ts — only file importing @langchain/langgraph)
    <aggregate>/
      domain/                        aggregate + value objects, OOP classes, tests co-located
      application/
        ports/                       ports the use cases need (post-writer.port.ts, note-search.port.ts)
        usecases/                    one use case per file
        services/                    aggregate-specific application services
      infra/
        adapter/                     infra ports: repository interface
        persistence/                 repository implementation + mapper
        interface/                   http: controller (router) + dto
        external/                    outside-library implementations of application ports (OpenRouter, Chroma)
  app.ts, index.ts                   wiring only: build implementations, inject them
```

## Dependency rules (enforced by test + ESLint)

1. `domain/` imports only its own `domain/` (and `core/`).
2. `application/` imports `domain/`, its own `application/`, `core/`, and **type-only** from `infra/adapter/`.
3. `infra/` may import anything inside its own aggregate/module, plus `core/` and libraries.
4. Outside libraries (`@langchain/*`, `langchain`, `chromadb`, `express`, `better-sqlite3`) only in `infra/` and `app.ts`/`index.ts`.
5. A module never imports another module's files directly; cross-module calls go through use cases wired in `app.ts`.
6. `core/` imports no module.

## Naming convention

All file names lowercase kebab-case, `<name>.<kind>.ts`, test = same name + `.test.ts`, beside the file.

| Kind | Folder | File | Class |
|---|---|---|---|
| Aggregate | `domain/` | `<aggregate>.ts` | `Assignment` |
| Value object | `domain/` | `<name>.value-object.ts` | `Round` |
| Repository port | `infra/adapter/` | `<aggregate>.repository.ts` | `AssignmentRepository` (interface) |
| Repository impl | `infra/persistence/` | `<tech>-<aggregate>.repository.ts` | `SqliteAssignmentRepository` |
| Mapper | `infra/persistence/` | `<aggregate>.mapper.ts` | `AssignmentMapper` |
| Application port | `application/ports/` | `<name>.port.ts` | `PostWriter` (interface) |
| External impl | `infra/external/` | `<tech>-<name>.external.ts` | `OpenRouterPostWriter` |
| Service port | `application/services/` | `<name>.service.ts` | `AssignmentWorkflow` |
| Service impl | `infra/services/` | `<tech>-<name>.service.ts` | `LangGraphAssignmentWorkflow` |
| Use case | `application/usecases/` | `<verb>-<aggregate>.usecase.ts` | `StartAssignment` (`execute(input)`) |
| DTO | `infra/interface/` | `<aggregate>.dto.ts` | zod schemas + types for request/response |
| Controller | `infra/interface/` | `<aggregate>.controller.ts` | express router factory |

Owner's list, with these **Claude's calls** to make it unambiguous:
- Value objects, use cases and services are named by **their own name**, not the aggregate's, because an aggregate has several (`round.value-object.ts`, `start-assignment.usecase.ts`, `decide-assignment.usecase.ts`).
- Port and implementation would collide on `<aggregate>.repository.ts`, so implementations get a **technology prefix** (`sqlite-assignment.repository.ts`). Same for services and external.
- Added `.mapper.ts`, `.port.ts`, `.external.ts` — the owner's structure has those folders but the list didn't name them.
- Every kind may have `.test.ts`; controller tests use supertest with use-case fakes.

Naming is enforced by ESLint (`check-file/filename-naming-convention` + folder-to-suffix globs) **and** by the architecture test (each file under `modules/` must match the pattern for its folder).

## Tests (TDD)

| Layer | First test |
|---|---|
| domain | pure unit test of the class |
| application/usecases | use case with hand-written fakes of its ports |
| infra/persistence, infra/services | real library on temp files / in memory, never network |
| infra/external | library client stubbed |
| infra/interface | supertest against the controller with use-case fakes |

`architecture.test.ts` itself has fixture cases (a bad import, a bad file name) so the checker is tested too.

## Deliverables

- `server/src/context/module-layer.md` — entry point: tree, dependency rules, link to naming, how to add a module/aggregate, how to migrate old code.
- `server/src/context/naming-convention.md` — the only place naming rules are written (table, casing, class names, tech prefix, `execute`); other files link to it. *(Added by owner 2026-11-25.)*
- `server/src/context/domain-layer.md`, `application-layer.md`, `infra-layer.md` — per layer: what belongs, folder rules, example from the `Assignment` aggregate, first test, checklist.
- `server/src/context/architecture.test.ts` — import + naming rules; passes trivially while `modules/` is empty.
- `eslint.config.js` (server) + `npm run lint`; dev deps `eslint`, `typescript-eslint`, `eslint-plugin-check-file`.
- Root `CLAUDE.md`: backend work → read `server/src/context/module-layer.md` first, then the layer file.
- `server/vitest.config.ts` includes `src/**/*.test.ts` (co-located tests) besides `test/`.

## Left to the builder

Exact ESLint glob patterns; how the architecture test parses imports (regex over `import … from` is enough); wording and examples in the `.md` files.

## Addendum 2026-11-25 — shared test data (`__test__/`) and mocks (approved by owner)

**Why:** tests need valid aggregates and seeded databases over and over; copying setup into every test file is noise. Port stand-ins don't need hand-written classes.

**Decided (owner):**
- Ports in use-case and controller tests are Vitest mocks (`vi.fn()`), checked with `satisfies <Port>`, written inside the test. No hand-written fake classes.
- Shared test data lives in `server/src/modules/__test__/`:
  - `factories/<aggregate>.factory.ts` — `make<Aggregate>(overrides: Partial<<Aggregate>Props> = {}): <Aggregate>` builds a valid aggregate with defaults.
  - `factories/<aggregate>.seeder.ts` — `seed<Aggregate>s(repo: <Aggregate>Repository, items?: Partial<<Aggregate>Props>[])` saves factory-built aggregates through a (real) repository, for `infra/persistence` tests.
  - `helpers/<name>.helper.ts` — shared test utilities (e.g. a temp SQLite file with cleanup).

**Claude's calls:**
- `__test__` is a reserved folder, not a module: the checker applies only `__test__` rules to it (folders `factories/`, `helpers/`; endings `.factory.ts`, `.seeder.ts`, `.helper.ts`; kebab-case names; no `.test.ts` files inside it).
- Only `*.test.ts` files may import from `__test__/`; production code importing it fails `npm test` and lint.
- `__test__` files may import any module's `domain/` and `infra/adapter/`, `core/`, `@ai-office/shared`, `node:*`, `vitest`, and other `__test__` files — and nothing else (no application/infra implementations; helpers that need a real repository receive it as a parameter).
