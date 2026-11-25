# Application layer

Rules and tree: [module-layer.md](module-layer.md).

## What belongs here / What doesn't

Belongs: use cases, ports the use cases need, application services. They orchestrate domain objects.

Doesn't: business rules (those are in `domain/`), outside libraries, SQL, HTTP. May import `domain/` of any aggregate in the same module, its own `application/`, `core/`, and type-only from `infra/adapter/`.

## Folders

- `usecases/`: one use case per file, one `execute(input)`.
- `ports/`: interfaces for what a use case needs from outside (LLM, search).
- `services/`: aggregate-specific application services. Module-level service ports live in `modules/<module>/application/services/`.

Names: see [naming-convention.md](naming-convention.md).

## Example

`assignments` module:
- `StartAssignment` use case: `execute(input)` creates an `Assignment`, saves it through `AssignmentRepository`, asks `PostWriter` for the draft.
- `AssignmentRepository` is the port (type-only import from `infra/adapter/`).
- `PostWriter` is an application port.
- `AssignmentWorkflow` is a module-level service port. `LangGraphAssignmentWorkflow` implements it in `infra/services/`.

## First test (TDD)

Use case with hand-written fakes of its ports.

## Checklist

- [ ] Test written first, with fakes, no real library.
- [ ] One use case per file, one `execute(input)`.
- [ ] Rules stay in the domain, the use case only orchestrates.
- [ ] Imports from `infra/adapter/` are `import type`.
- [ ] No outside libraries.
- [ ] File name matches the naming convention.
