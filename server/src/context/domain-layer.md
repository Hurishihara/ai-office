# Domain layer

Rules and tree: [module-layer.md](module-layer.md).

## What belongs here / What doesn't

Belongs: aggregates and value objects, as OOP classes.
- Value objects validate in the constructor or a static `create()`, are immutable, compare with `equals()`.
- Aggregates guard their own invariants and expose intention-revealing methods. No public setters.

Doesn't: I/O, libraries (only `@ai-office/shared` types), ports, use cases, anything from `application/` or `infra/`. Imports only its own aggregate's `domain/`, `core/` and `node:*`.

## Folders

`<aggregate>/domain/` has no subfolders. Aggregate and value objects sit side by side, tests beside them.
Names: see [naming-convention.md](naming-convention.md).

## Example

`assignments` module, `Assignment` aggregate:
- `submitDraft()`, `recordReview()`, `approve()`, `discard()`.
- `revise(feedback)` throws past round 3.
- `Round` is a value object: validates its number, immutable, `equals()`.

## First test (TDD)

Pure unit test of the class. No fakes, no I/O.

## Checklist

- [ ] Test written first, beside the file.
- [ ] No imports except own `domain/`, `core/`, `node:*` and `@ai-office/shared`.
- [ ] Invariants live in the class, no public setters.
- [ ] Value objects immutable, with `equals()`.
- [ ] File name matches the naming convention.
