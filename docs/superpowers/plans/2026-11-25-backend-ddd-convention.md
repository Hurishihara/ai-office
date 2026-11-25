# Backend DDD Convention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the backend DDD + TDD convention in writing (`server/src/context/*.md`, root `CLAUDE.md`) and make its import and file-name rules fail `npm test` and `npm run lint`.

**Architecture:** One pure checker module (`architecture.ts`) classifies a file path into module / aggregate / layer / folder and validates file names and imports; `architecture.test.ts` unit-tests it with fixture paths and then scans the real `src/modules/` tree. ESLint mirrors the same rules for editor feedback, scoped to `src/modules/**` and `src/core/**` so the existing un-migrated code is not flagged. No code is moved.

**Tech Stack:** TypeScript (ESM), Vitest 5, ESLint 9 flat config, `typescript-eslint`, `eslint-plugin-check-file`.

**Spec:** `docs/superpowers/specs/2026-11-25-backend-ddd-convention-design.md`

## Global Constraints

- Scope is `server/` and the root `CLAUDE.md` only; no changes to `client/`, `shared/` or existing server code.
- Layout: `server/src/modules/<module>/[application/services | infra/services | <aggregate>/{domain | application/{ports,usecases,services} | infra/{adapter,persistence,interface,external}}]`; shared code in `server/src/core/`; wiring only in `server/src/app.ts` / `server/src/index.ts`.
- File names: lowercase kebab-case `<name>.<kind>.ts`, tests `<name>.<kind>.test.ts` beside the file. Kinds per folder:

  | Folder | Allowed endings |
  |---|---|
  | `<agg>/domain/` | `.ts` (aggregate), `.value-object.ts` |
  | `<agg>/application/ports/` | `.port.ts` |
  | `<agg>/application/usecases/` | `.usecase.ts` |
  | `<agg>/application/services/`, `<module>/application/services/`, `<module>/infra/services/` | `.service.ts` |
  | `<agg>/infra/adapter/` | `.repository.ts` |
  | `<agg>/infra/persistence/` | `.repository.ts`, `.mapper.ts` |
  | `<agg>/infra/interface/` | `.dto.ts`, `.controller.ts` |
  | `<agg>/infra/external/` | `.external.ts` |

- Dependency rules (spec, verbatim intent): domain → own domain + `core/`; application → `domain/`, own `application/`, `core/`, **type-only** from own `infra/adapter/`; infra → anything in own aggregate/module + `core/` + libraries; `@langchain/*`, `langchain`, `chromadb`, `express`, `better-sqlite3` only in `infra/` and `app.ts`/`index.ts`; no module imports another module; `core/` imports no module.
- `@ai-office/shared` and `node:*` are importable from every layer (shared types like `Platform` are needed by domain). *(Claude's call: the spec doesn't name them; forbidding them would block the domain from using the project's own shared types.)*
- No new runtime dependencies. Dev dependencies added: `eslint`, `typescript-eslint`, `eslint-plugin-check-file`, `jiti` (ESLint needs it to load a TypeScript config, so `INFRA_ONLY_LIBS` can be imported from `architecture.ts` instead of copied).

## Review Focus

1. **Windows paths** — the checker gets `C:\...\modules\notes\note\domain\note.ts`; classification must normalise `\` to `/` or every rule silently passes on this machine. (Task 1)
2. **Inline type imports** — `import { type AssignmentRepository } from "../infra/adapter/assignment.repository.js"` from application is type-only and allowed; `import { type A, B }` is not. (Task 1)
3. **Re-exports and dynamic imports** — `export { X } from "../../infra/persistence/..."` and `await import("chromadb")` in domain must be caught like a normal import. (Task 1)
4. **Files outside any known folder** — `modules/notes/note/helpers/x.ts` or a file directly in `modules/notes/` must fail with "unknown folder", not pass unchecked. (Task 1)
5. **Lint must not flag existing code** — `npm run lint` passes on today's `server/src` (routes/, notes/, pipeline/…) because only `src/modules/**` and `src/core/**` are linted. (Task 2)

---

## File Structure

```
server/
  eslint.config.ts                     new: boundaries + file names for src/modules, src/core
  package.json                         modified: "lint" script, dev deps
  vitest.config.ts                     modified: include src/**/*.test.ts
  src/context/
    architecture.ts                    new: classifyPath, checkFileName, checkImport, scanModules
    architecture.test.ts               new: fixture cases + real scan + ESLint config smoke
    module-layer.md                    new: entry point
    naming-convention.md               new: the only place naming rules are written
    domain-layer.md  application-layer.md  infra-layer.md   new
CLAUDE.md                              new (repo root)
```

---

### Task 1: Architecture checker and test

**Files:**
- Create: `server/src/context/architecture.ts`, `server/src/context/architecture.test.ts`
- Modify: `server/vitest.config.ts` (`include: ["test/**/*.test.ts", "src/**/*.test.ts"]`)

**Interfaces:**
- Produces:
  ```ts
  export type Layer = "domain" | "application" | "infra";
  export interface PathInfo {
    module: string;
    aggregate: string | null;        // null for module-level application/services and infra/services
    layer: Layer;
    folder: string | null;           // "ports" | "usecases" | "services" | "adapter" | "persistence" | "interface" | "external" | null (domain)
  }
  export interface Violation { file: string; rule: "unknown-folder" | "file-name" | "import"; message: string }
  export function classifyPath(file: string, modulesRoot: string): PathInfo | null;   // null = not under modulesRoot; throws never; unknown layout → returns null and checkFileName reports it
  export function checkFileName(file: string, modulesRoot: string): Violation | null;
  export function parseImports(source: string): { specifier: string; typeOnly: boolean }[];
  export function checkImport(file: string, imp: { specifier: string; typeOnly: boolean }, modulesRoot: string): Violation | null;
  export function scanModules(modulesRoot: string): Violation[];   // walks *.ts recursively; missing root → []
  export const INFRA_ONLY_LIBS = ["@langchain/", "langchain", "chromadb", "express", "better-sqlite3"];
  ```
- Rules the implementation encodes:
  - Paths: normalise with `.replaceAll("\\", "/")` before any matching.
  - Valid layouts relative to `modulesRoot`: `<m>/application/services/<f>`, `<m>/infra/services/<f>`, `<m>/<a>/domain/<f>`, `<m>/<a>/application/{ports,usecases,services}/<f>`, `<m>/<a>/infra/{adapter,persistence,interface,external}/<f>`. An aggregate may not be named `application` or `infra`. Anything else → `unknown-folder`.
  - File name = `^[a-z0-9]+(-[a-z0-9]+)*` + the folder's allowed ending (Global Constraints table) + optional `.test` + `.ts`. In `domain/`, a bare `<name>.ts` or `<name>.test.ts` is the aggregate.
  - `parseImports` (regex is enough): `import … from "x"`, `import "x"`, `export … from "x"`, `import("x")`. `typeOnly` = `import type`/`export type`, or every named specifier in braces prefixed with `type`.
  - `checkImport`: relative specifiers are resolved against the file's directory (strip `.js`/`.ts`) and classified; bare specifiers: `@ai-office/shared` and `node:*` always allowed; `INFRA_ONLY_LIBS` (prefix match for `@langchain/`, exact or `/`-subpath for others) only from `infra`; domain allows no other bare package. A target under `modulesRoot` with a different `module` → violation. Targets in `<serverSrc>/core/` are allowed from every layer. Layer rules exactly as Global Constraints; module-level `application/services` may import the same module's aggregates' `domain/` and `core/`; module-level `infra/services` may import anything in the same module.

- [ ] **Step 1: Write the failing tests** (`R = "/repo/server/src/modules"`)

```ts
describe("checkFileName", () => {
  it.each([
    "notes/note/domain/note.ts", "notes/note/domain/note.test.ts", "notes/note/domain/note-title.value-object.ts",
    "notes/note/application/ports/note-search.port.ts", "notes/note/application/usecases/add-note.usecase.test.ts",
    "assignments/application/services/assignment-workflow.service.ts", "assignments/infra/services/langgraph-assignment-workflow.service.ts",
    "notes/note/infra/adapter/note.repository.ts", "notes/note/infra/persistence/file-note.repository.ts",
    "notes/note/infra/persistence/note.mapper.ts", "notes/note/infra/interface/note.dto.ts",
    "notes/note/infra/interface/note.controller.ts", "notes/note/infra/external/chroma-note-search.external.ts",
  ])("accepts %s", (p) => expect(checkFileName(`${R}/${p}`, R)).toBeNull());
  it.each([
    ["notes/note/application/usecases/AddNote.ts", "file-name"],
    ["notes/note/application/usecases/add-note.service.ts", "file-name"],
    ["notes/note/infra/adapter/note.mapper.ts", "file-name"],
    ["notes/note/helpers/x.ts", "unknown-folder"],
    ["notes/loose.ts", "unknown-folder"],
  ])("rejects %s", (p, rule) => expect(checkFileName(`${R}/${p}`, R)?.rule).toBe(rule));
  it("handles Windows separators", () => {
    expect(checkFileName("C:\\repo\\server\\src\\modules\\notes\\note\\helpers\\x.ts", "C:\\repo\\server\\src\\modules")?.rule).toBe("unknown-folder");
  });
});

describe("parseImports", () => {
  it("finds static, side-effect, re-export and dynamic imports with type-only flags", () => {
    const src = `import type { A } from "./a.js";\nimport { type B } from "./b.js";\nimport { type C, D } from "./c.js";\nimport "./side.js";\nexport { E } from "./e.js";\nconst m = await import("chromadb");`;
    expect(parseImports(src)).toEqual([
      { specifier: "./a.js", typeOnly: true }, { specifier: "./b.js", typeOnly: true }, { specifier: "./c.js", typeOnly: false },
      { specifier: "./side.js", typeOnly: false }, { specifier: "./e.js", typeOnly: false }, { specifier: "chromadb", typeOnly: false },
    ]);
  });
});

describe("checkImport", () => {
  const uc = `${R}/assignments/assignment/application/usecases/start-assignment.usecase.ts`;
  const dom = `${R}/assignments/assignment/domain/assignment.ts`;
  it("application may type-import the repository port", () =>
    expect(checkImport(uc, { specifier: "../../infra/adapter/assignment.repository.js", typeOnly: true }, R)).toBeNull());
  it("application may not value-import the repository port", () =>
    expect(checkImport(uc, { specifier: "../../infra/adapter/assignment.repository.js", typeOnly: false }, R)?.rule).toBe("import"));
  it("application may not import persistence", () =>
    expect(checkImport(uc, { specifier: "../../infra/persistence/sqlite-assignment.repository.js", typeOnly: true }, R)).not.toBeNull());
  it("domain may not import application", () =>
    expect(checkImport(dom, { specifier: "../application/ports/post-writer.port.js", typeOnly: true }, R)).not.toBeNull());
  it("domain may use shared types and core", () => {
    expect(checkImport(dom, { specifier: "@ai-office/shared", typeOnly: true }, R)).toBeNull();
    expect(checkImport(dom, { specifier: "../../../../core/errors.js", typeOnly: false }, R)).toBeNull();
  });
  it("infra-only libraries are refused outside infra", () => {
    expect(checkImport(dom, { specifier: "chromadb", typeOnly: false }, R)).not.toBeNull();
    expect(checkImport(uc, { specifier: "@langchain/langgraph", typeOnly: false }, R)).not.toBeNull();
    expect(checkImport(`${R}/assignments/infra/services/langgraph-assignment-workflow.service.ts`, { specifier: "@langchain/langgraph", typeOnly: false }, R)).toBeNull();
  });
  it("no module imports another module", () =>
    expect(checkImport(`${R}/assignments/assignment/infra/external/openrouter-post-writer.external.ts`, { specifier: "../../../../notes/note/domain/note.js", typeOnly: true }, R)?.rule).toBe("import"));
});

it("the real src/modules tree follows the convention", () => {
  expect(scanModules(fileURLToPath(new URL("../modules", import.meta.url)))).toEqual([]);
});
```

- [ ] **Step 2: Run** — `npm test -w @ai-office/server -- src/context` → FAIL (`architecture.js` missing).
- [ ] **Step 3: Implement `server/src/context/architecture.ts`; update `vitest.config.ts` include.**
- [ ] **Step 4: Run** — `npm test -w @ai-office/server` → all existing tests plus the new ones PASS (`src/modules` doesn't exist yet, so the real scan returns `[]`).
- [ ] **Step 5: Commit** — `git add server/src/context/architecture.ts server/src/context/architecture.test.ts server/vitest.config.ts && git commit -m "test(server): architecture checker for DDD imports and file names"`

---

### Task 2: ESLint for modules and core

**Files:**
- Create: `server/eslint.config.ts`
- Modify: `server/package.json` (script `"lint": "eslint src/modules src/core --no-error-on-unmatched-pattern"`; dev deps), root `package.json` (script `"lint": "npm run lint -w @ai-office/server"`)
- Test: `server/src/context/architecture.test.ts` (add an ESLint block)

**Interfaces:**
- Consumes: `INFRA_ONLY_LIBS` from Task 1 (import it into `eslint.config.ts` so the list lives once).
- Produces: flat config, `files` limited to `src/modules/**/*.ts` and `src/core/**/*.ts`, `typescript-eslint` parser.
  - `@typescript-eslint/no-restricted-imports` per layer glob:
    - `**/domain/**`: patterns `**/application/**`, `**/infra/**`, and every `INFRA_ONLY_LIBS` entry.
    - `**/application/**`: patterns `**/infra/persistence/**`, `**/infra/interface/**`, `**/infra/external/**`, `**/infra/services/**`, `INFRA_ONLY_LIBS`; and `{ group: ["**/infra/adapter/**"], allowTypeImports: true }`.
    - `src/core/**`: pattern `**/modules/**`.
  - `check-file/filename-naming-convention` with one glob per row of the Global Constraints table (e.g. `"src/modules/**/application/usecases/*.ts": "+([a-z0-9-]).usecase?(.test)"`) and `check-file/folder-naming-convention` `KEBAB_CASE` for `src/modules/**/`.
  - Cross-module imports are left to the architecture test (glob-based ESLint can't compare module names). Write that as a one-line comment in the config.

- [ ] **Step 1: Install** — `npm i -D -w @ai-office/server eslint typescript-eslint eslint-plugin-check-file jiti`.
- [ ] **Step 2: Write the failing tests** (ESLint's Node API on in-memory code, `cwd` = server dir)

```ts
describe("eslint config", () => {
  const lint = async (filePath: string, code: string) =>
    (await new ESLint({ cwd: serverDir }).lintText(code, { filePath }))[0].messages.map(m => m.ruleId);
  it("flags application importing persistence", async () => {
    expect(await lint("src/modules/a/agg/application/usecases/do-thing.usecase.ts",
      `import { X } from "../../infra/persistence/sqlite-agg.repository.js";`)).toContain("@typescript-eslint/no-restricted-imports");
  });
  it("allows a type-only import of the repository port", async () => {
    expect(await lint("src/modules/a/agg/application/usecases/do-thing.usecase.ts",
      `import type { AggRepository } from "../../infra/adapter/agg.repository.js";`)).toEqual([]);
  });
  it("flags a wrongly named use case file", async () => {
    expect(await lint("src/modules/a/agg/application/usecases/DoThing.ts", `export {};`)).toContain("check-file/filename-naming-convention");
  });
});
```

- [ ] **Step 3: Run** — `npm test -w @ai-office/server -- src/context` → FAIL (no config).
- [ ] **Step 4: Implement `server/eslint.config.ts` and the scripts.**
- [ ] **Step 5: Run** — `npm test -w @ai-office/server` → PASS; `npm run lint` → exit 0 with no output on today's code (Review Focus 5).
- [ ] **Step 6: Commit** — `git add server/eslint.config.ts server/package.json package.json package-lock.json server/src/context/architecture.test.ts && git commit -m "chore(server): eslint boundaries and file naming for modules"`

---

### Task 3: Instruction files and CLAUDE.md

**Files:**
- Create: `server/src/context/module-layer.md`, `server/src/context/naming-convention.md`, `server/src/context/domain-layer.md`, `server/src/context/application-layer.md`, `server/src/context/infra-layer.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: the tree, dependency rules and naming table from the spec; `npm test` / `npm run lint` from Tasks 1–2.
- Naming lives **only** in `naming-convention.md`; every other file links to it and never repeats a naming row.
  - `naming-convention.md`: the whole file-name table (folder → ending → example file → example class); lowercase kebab-case; tests `<name>.<kind>.test.ts` beside the file; value objects, use cases and services named by their own name (`round.value-object.ts`, `start-assignment.usecase.ts`); use case file `<verb>-<aggregate>`; implementations take a technology prefix (`sqlite-assignment.repository.ts` → `SqliteAssignmentRepository`, `langgraph-assignment-workflow.service.ts`, `openrouter-post-writer.external.ts`); class names PascalCase of the file name minus the kind, except implementations which keep the kind word where it reads naturally (`SqliteAssignmentRepository`, `AssignmentMapper`); ports are plain nouns with no `I` prefix; use cases expose one `execute(input)`; mappers expose `toDomain` / `toPersistence`; a closing section "Enforced by `architecture.test.ts` + lint: folder and file ending. Not enforced (review it): class names, tech prefix, `execute`."
- Produces — each layer file has the same five sections: **What belongs here / What doesn't**, **Folders** (which subfolders, what goes in each, then "names: see `naming-convention.md`"), **Example** (from the future `assignments` module: `Assignment` aggregate with `submitDraft()`, `recordReview()`, `approve()`, `revise(feedback)` throwing past round 3, `discard()`; `Round` value object; `StartAssignment` use case with `execute(input)`; `AssignmentRepository` port; `SqliteAssignmentRepository` + `AssignmentMapper.toDomain/toPersistence`; `AssignmentWorkflow` service port + `LangGraphAssignmentWorkflow`; `OpenRouterPostWriter` implementing `PostWriter`), **First test (TDD)** (its row of the spec's test table), **Checklist**.
  - `module-layer.md`: full tree; the six dependency rules; a link to `naming-convention.md` (no table); what goes in `src/core/` (only what every module uses: `EventBus`, `NotFoundError`/`ConflictError`/`BadRequestError`, `readJson`/`writeJson`) and that nothing module-specific goes there; wiring only in `app.ts`/`index.ts`; how to add a module and an aggregate; how to migrate existing code one module at a time (move tests beside files, keep behaviour, `npm test` + `npm run lint` green after each move); "rules are enforced by `src/context/architecture.test.ts` and `npm run lint`".
  - Domain rules to state: OOP classes; value objects validate in the constructor or a static `create()`, are immutable, compare with `equals()`; aggregates guard their own invariants and expose intention-revealing methods, no public setters; no I/O, no libraries except `@ai-office/shared` types.
  - `CLAUDE.md` (root): "Backend (`server/`) work: read `server/src/context/module-layer.md` first, then the layer file for the folder you touch. Creating or renaming a file: `server/src/context/naming-convention.md`. Run `npm test` and `npm run lint` before committing. Old code outside `server/src/modules/` is being migrated; don't add new code there."

- [ ] **Step 1: Write the six files.**
- [ ] **Step 2: Check them against the spec** — every naming row appears in `naming-convention.md` and nowhere else (`grep -n "\.usecase\.ts\|\.external\.ts" server/src/context/*.md` hits only that file, plus example paths); every dependency rule in `module-layer.md`; every test row in exactly one layer file; every file name in the examples passes `checkFileName` (paste them into a throwaway `it.each`, run, delete).
- [ ] **Step 3: Run** — `npm test` and `npm run lint` → both pass (docs change nothing at runtime).
- [ ] **Step 4: Commit** — `git add server/src/context/*.md CLAUDE.md && git commit -m "docs: DDD layer instructions and CLAUDE.md pointer"`

---

## Done when

`npm test` and `npm run lint` pass; a file dropped into `server/src/modules/` with a wrong name or a forbidden import fails both; `CLAUDE.md` points agents to `module-layer.md`.

---

### Task 4 (addendum): `__test__/` factories, seeders, helpers; mocks for ports

**Spec:** the 2026-11-25 Addendum section of the design doc.

**Files:**
- Modify: `server/src/context/architecture.ts`, `server/src/context/architecture.test.ts`, `server/eslint.config.ts`
- Modify: `server/src/context/naming-convention.md`, `module-layer.md`, `application-layer.md`, `infra-layer.md`, `domain-layer.md` (only where they mention fakes)

**Interfaces:**
- `classifyPath` keeps its signature. A path whose first segment under `modulesRoot` is `__test__` is classified as test support. Extend `PathInfo` with `testSupport?: boolean`, or return a distinct shape; either way `checkFileName` and `checkImport` must handle it explicitly.
- `checkFileName` for `__test__/factories/*`: `<kebab>.factory.ts` or `<kebab>.seeder.ts`. For `__test__/helpers/*`: `<kebab>.helper.ts`. Anything else under `__test__` (other folders, files directly in `__test__/`, `*.test.ts`) gives `unknown-folder` or `file-name`.
- The kebab-case module-name check must not reject `__test__`. It is the only reserved name.
- `checkImport` gains two rules:
  1. From any file under `modules/` that is not `__test__`: a target inside `__test__/` is allowed only when the importing file ends in `.test.ts`.
  2. From a `__test__` file:
     - Allowed: any module's `domain/` and `infra/adapter/`, other `__test__` files, `core/`, `@ai-office/shared`, `node:*` and `vitest`.
     - Everything else is a violation: application, the other infra folders, `INFRA_ONLY_LIBS`, other packages, and old code under `src/`.
- ESLint:
  - Naming globs: `src/modules/__test__/factories/*.ts` → `.factory` | `.seeder`; `src/modules/__test__/helpers/*.ts` → `.helper`.
  - The folder kebab-case rule must allow `__test__`.
  - Non-test files may not import `**/__test__/**`. That is a `no-restricted-imports` pattern on `src/modules/**/*.ts` that excludes `**/*.test.ts` through `ignores`.
- Docs:
  - `naming-convention.md` gains the three rows.
  - Every "fakes" mention becomes "mock ports with `vi.fn()`, typed with `satisfies <Port>`, inside the test". Controller tests mock the use case the same way, as `{ execute: vi.fn() } satisfies Pick<UseCase, "execute">`.
  - `module-layer.md` gets the `__test__` folder in the tree, the rule that only `*.test.ts` files import it, and its import rules.
  - `infra-layer.md` persistence tests use `seed<Aggregate>s` against a real repository on a temp DB from `helpers/`.

- [ ] **Step 1: Write the failing tests** (`R` as in Task 1)

```ts
it.each(["__test__/factories/assignment.factory.ts", "__test__/factories/assignment.seeder.ts", "__test__/helpers/temp-sqlite.helper.ts"])
  ("accepts test support file %s", (p) => expect(checkFileName(`${R}/${p}`, R)).toBeNull());
it.each(["__test__/factories/assignment.ts", "__test__/fakes/x.helper.ts", "__test__/loose.ts", "__test__/helpers/x.helper.test.ts"])
  ("rejects test support file %s", (p) => expect(checkFileName(`${R}/${p}`, R)).not.toBeNull());
it("only test files may import __test__", () => {
  const imp = { specifier: "../../../__test__/factories/assignment.factory.js", typeOnly: false };
  expect(checkImport(`${R}/assignments/assignment/application/usecases/start-assignment.usecase.test.ts`, { ...imp, specifier: "../../../../__test__/factories/assignment.factory.js" }, R)).toBeNull();
  expect(checkImport(`${R}/assignments/assignment/application/usecases/start-assignment.usecase.ts`, { ...imp, specifier: "../../../../__test__/factories/assignment.factory.js" }, R)?.rule).toBe("import");
});
it("__test__ may import domain and repository ports of any module, not implementations or infra libs", () => {
  const f = `${R}/__test__/factories/assignment.seeder.ts`;
  expect(checkImport(f, { specifier: "../../assignments/assignment/domain/assignment.js", typeOnly: false }, R)).toBeNull();
  expect(checkImport(f, { specifier: "../../assignments/assignment/infra/adapter/assignment.repository.js", typeOnly: true }, R)).toBeNull();
  expect(checkImport(f, { specifier: "../../assignments/assignment/infra/persistence/sqlite-assignment.repository.js", typeOnly: false }, R)).not.toBeNull();
  expect(checkImport(f, { specifier: "better-sqlite3", typeOnly: false }, R)).not.toBeNull();
  expect(checkImport(f, { specifier: "vitest", typeOnly: false }, R)).toBeNull();
});
// ESLint block: a non-test use case importing ../../../../__test__/factories/x.factory.js is flagged; the same import from x.usecase.test.ts is clean; src/modules/__test__/factories/Bad.ts is flagged by check-file.
```

- [ ] **Step 2: Run** — `npm test -w @ai-office/server -- src/context` → FAIL.
- [ ] **Step 3: Implement the checker, the ESLint and the doc changes.**
- [ ] **Step 4: Run** — `npm test` (both workspaces) → PASS; `npm run lint` → exit 0; `grep -rn -i "fake" server/src/context/*.md` → no hits that tell readers to write fake classes.
- [ ] **Step 5: Commit** — `test(server): __test__ factories, seeders and helpers in the DDD checker` (checker + ESLint), then `docs: mock ports with vi.fn and shared test data in __test__` (docs).
