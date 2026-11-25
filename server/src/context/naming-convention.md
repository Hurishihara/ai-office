# Naming convention

The only place naming rules are written. Other files link here.

## File names

Lowercase kebab-case: `<name>.<kind>.ts`. A test has the same name plus `.test.ts` and sits beside the file (`<name>.<kind>.test.ts`).

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
| Use case | `application/usecases/` | `<verb>-<aggregate>.usecase.ts` | `StartAssignment` |
| DTO | `infra/interface/` | `<aggregate>.dto.ts` | zod schemas + types |
| Controller | `infra/interface/` | `<aggregate>.controller.ts` | express router factory |

## Rules

- Value objects, use cases and services are named by their own name, not the aggregate's: `round.value-object.ts`, `start-assignment.usecase.ts`.
- Use case file: `<verb>-<aggregate>`.
- Implementations take a technology prefix, so they never collide with the port: `sqlite-assignment.repository.ts`, `langgraph-assignment-workflow.service.ts`, `openrouter-post-writer.external.ts`.

## Class names

- PascalCase of the file name minus the kind: `start-assignment.usecase.ts` → `StartAssignment`, `round.value-object.ts` → `Round`.
- Implementations keep the kind word where it reads naturally: `SqliteAssignmentRepository`, `AssignmentMapper`.
- Ports are plain nouns, no `I` prefix.
- Use cases expose one `execute(input)`.
- Mappers expose `toDomain` / `toPersistence`.

## Enforcement

Enforced by `architecture.test.ts` + lint: folder and file ending.
Not enforced (review it): class names, tech prefix, `execute`.
