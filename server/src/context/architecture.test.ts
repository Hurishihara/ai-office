import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { checkFileName, checkImport, parseImports, scanModules } from "./architecture.js";

const R = "/repo/server/src/modules";

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
  it("application may import the domain of another aggregate in the same module", () =>
    expect(checkImport(`${R}/a/x/application/usecases/do-x.usecase.ts`, { specifier: "../../../y/domain/y.js", typeOnly: false }, R)).toBeNull());
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
