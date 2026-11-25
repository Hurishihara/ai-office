# Module layer

Entry point for backend work. Read this first, then the layer file for the folder you touch:
[domain](domain-layer.md), [application](application-layer.md), [infra](infra-layer.md).
Names: [naming-convention.md](naming-convention.md).

## Tree

```
server/src/
  core/                              shared by all modules only
  context/                           these instruction files + architecture.test.ts
  modules/<module>/                  one domain, holds its aggregates
    application/services/            module-level service ports
    infra/services/                  their implementations
    <aggregate>/
      domain/                        aggregate + value objects, tests beside them
      application/
        ports/                       ports the use cases need
        usecases/                    one use case per file
        services/                    aggregate-specific application services
      infra/
        adapter/                     repository interface
        persistence/                 repository implementation + mapper
        interface/                   http: controller + dto
        external/                    outside-library implementations of application ports
  app.ts, index.ts                   wiring only
```

## Dependency rules

1. `domain/` imports only its own aggregate's `domain/` (and `core/`).
2. `application/` imports `domain/` (of any aggregate in the same module), its own `application/` (including the module-level `application/services/`), `core/`, and type-only from `infra/adapter/`.
3. `infra/` may import anything inside its own aggregate/module, plus `core/` and libraries.
4. Outside libraries (`@langchain/*`, `langchain`, `chromadb`, `express`, `better-sqlite3`) only in `infra/` and `app.ts`/`index.ts`.
5. A module never imports another module's files. Cross-module calls go through use cases wired in `app.ts`.
6. `core/` imports no module.

Also:
- `@ai-office/shared` and `node:*` are importable from every layer.
- `*.test.ts` files in any layer may import `vitest`. Non-test files may not.

## core/

Only what every module uses: `EventBus`, `NotFoundError` / `ConflictError` / `BadRequestError`, `readJson` / `writeJson`. Nothing module-specific goes there.

`core/` is created on first need by moving the file from `src/` (e.g. `src/events.ts` → `src/core/event-bus.ts`), never by importing old code from a module.

## Wiring

Only `app.ts` and `index.ts` build implementations and inject them. No other file does.

## Add a module

1. Create `modules/<module>/` and its first aggregate (below).
2. Add module-level `application/services/` and `infra/services/` only if a service spans aggregates.
3. Wire the use cases in `app.ts`.

## Add an aggregate

1. `<aggregate>/domain/`: aggregate class, test first.
2. `application/usecases/` (+ `ports/`) with fakes, test first.
3. `infra/adapter/` repository interface, then `persistence/`, `interface/`, `external/` as needed.
4. Wire in `app.ts`.

## Migrate old code

Old code outside `modules/` moves one module at a time, each with its own plan.
- Move the tests beside the files.
- Keep behaviour.
- `npm test` and `npm run lint` green after each move.
- Don't add new code outside `modules/`.

## Enforcement

Rules are enforced by `src/context/architecture.test.ts` (`npm test`) and `npm run lint`.
ESLint is a fast subset for in-editor feedback; `npm test` is authoritative. Layout (unknown folders), cross-aggregate, cross-module, old-code and domain-package rules are test-only. Rule 6 (`core/` imports no module) is lint-only.
- The root `typescript@^6` devDependency exists only for typescript-eslint.
