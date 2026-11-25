# Infra layer

Rules and tree: [module-layer.md](module-layer.md).

## What belongs here / What doesn't

Belongs: everything that touches the outside: database, HTTP, LLMs, vector store, workflow engines. Only `infra/` (and `app.ts`/`index.ts`) imports `@langchain/*`, `langchain`, `chromadb`, `express`, `better-sqlite3`.

Doesn't: business rules, orchestration, wiring. Wiring stays in `app.ts`/`index.ts`. May import anything inside its own aggregate/module, plus `core/` and libraries.

## Folders

- `adapter/`: repository interface (the infra port).
- `persistence/`: repository implementation + mapper.
- `interface/`: http controller (router factory) + dto (zod).
- `external/`: outside-library implementations of application ports.
- `services/` (module level): implementations of module-level service ports.

Names: see [naming-convention.md](naming-convention.md).

## Example

`assignments` module:
- `AssignmentRepository` in `adapter/`.
- `SqliteAssignmentRepository` + `AssignmentMapper.toDomain` / `toPersistence` in `persistence/`.
- `OpenRouterPostWriter` implements `PostWriter` in `external/`.
- `LangGraphAssignmentWorkflow` implements `AssignmentWorkflow` in `infra/services/`. Only file importing `@langchain/langgraph`.
- Controller + DTO in `interface/`.

## First test (TDD)

- `persistence/`, `services/`: real library on temp files or in memory, never network.
- `external/`: library client stubbed.
- `interface/`: supertest against the controller with use-case fakes.

## Checklist

- [ ] Test written first, in the form for its folder.
- [ ] Implementation has a tech prefix, port does not.
- [ ] Mapper is the only place persistence rows become domain objects.
- [ ] Outside libraries are imported here and nowhere else.
- [ ] Controller calls use cases only, no domain logic.
- [ ] Wired in `app.ts`.
- [ ] File name matches the naming convention.
