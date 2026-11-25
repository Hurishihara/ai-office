import { existsSync, readdirSync, readFileSync } from "node:fs";
import { posix } from "node:path";

export type Layer = "domain" | "application" | "infra";
export interface PathInfo {
  module: string;
  aggregate: string | null; // null for module-level application/services and infra/services
  layer: Layer;
  folder: string | null; // null for domain
}
export interface Violation { file: string; rule: "unknown-folder" | "file-name" | "import"; message: string }

export const INFRA_ONLY_LIBS = ["@langchain/", "langchain", "chromadb", "express", "better-sqlite3"];

const FOLDERS: Record<Layer, string[]> = {
  domain: [],
  application: ["ports", "usecases", "services"],
  infra: ["adapter", "persistence", "interface", "external"],
};

// Allowed name endings per folder (domain has no folder: bare name or value-object).
const ENDINGS: Record<string, string[]> = {
  domain: ["", ".value-object"],
  ports: [".port"],
  usecases: [".usecase"],
  services: [".service"],
  adapter: [".repository"],
  persistence: [".repository", ".mapper"],
  interface: [".dto", ".controller"],
  external: [".external"],
};

const norm = (p: string) => p.replaceAll("\\", "/");

/** Path segments below modulesRoot, or null when the file is not under it. */
function relSegments(file: string, modulesRoot: string): string[] | null {
  const root = norm(modulesRoot).replace(/\/$/, "") + "/";
  const f = norm(file);
  return f.startsWith(root) ? f.slice(root.length).split("/") : null;
}

export function classifyPath(file: string, modulesRoot: string): PathInfo | null {
  const s = relSegments(file, modulesRoot);
  if (!s) return null;
  const [module, second, third, fourth] = s;
  if ((second === "application" || second === "infra") && s.length === 4 && third === "services") {
    return { module, aggregate: null, layer: second, folder: "services" };
  }
  if (second === "application" || second === "infra") return null; // aggregate may not use these names
  if (third === "domain" && s.length === 4) return { module, aggregate: second, layer: "domain", folder: null };
  if ((third === "application" || third === "infra") && s.length === 5 && FOLDERS[third].includes(fourth)) {
    return { module, aggregate: second, layer: third, folder: fourth };
  }
  return null;
}

export function checkFileName(file: string, modulesRoot: string): Violation | null {
  if (!relSegments(file, modulesRoot)) return null;
  const info = classifyPath(file, modulesRoot);
  if (!info) return { file, rule: "unknown-folder", message: "file is not in a valid modules/ folder layout" };
  const folders = relSegments(file, modulesRoot)!.slice(0, info.aggregate === null ? 1 : 2);
  const badDir = folders.find((d) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d));
  if (badDir) return { file, rule: "file-name", message: `folder ${badDir} must be kebab-case` };
  const endings = ENDINGS[info.folder ?? "domain"].map((e) => e.replaceAll(".", "\\."));
  const re = new RegExp(`^[a-z0-9]+(-[a-z0-9]+)*(${endings.join("|")})(\\.test)?\\.ts$`);
  const name = norm(file).split("/").pop()!;
  return re.test(name) ? null : { file, rule: "file-name", message: `${name} must match ${re}` };
}

export function parseImports(source: string): { specifier: string; typeOnly: boolean }[] {
  const found: { index: number; specifier: string; typeOnly: boolean }[] = [];
  // clause tokens may not contain import/export so a preceding `export class A {}` is not swallowed
  const staticRe = /\b(?:import|export)\s+(type\s+)?((?:(?!\b(?:import|export)\b)[\w*\s,{}$])*?)\s*from\s*["']([^"']+)["']/g;
  for (const m of source.matchAll(staticRe)) {
    const names = /^\{([^}]*)\}$/.exec(m[2].trim())?.[1].split(",").map((n) => n.trim()).filter(Boolean);
    const typeOnly = !!m[1] || (!!names?.length && names.every((n) => n.startsWith("type ")));
    found.push({ index: m.index, specifier: m[3], typeOnly });
  }
  for (const m of source.matchAll(/\bimport\s*["']([^"']+)["']/g)) found.push({ index: m.index, specifier: m[1], typeOnly: false });
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push({ index: m.index, specifier: m[1], typeOnly: false });
  return found.sort((a, b) => a.index - b.index).map(({ specifier, typeOnly }) => ({ specifier, typeOnly }));
}

export function checkImport(file: string, imp: { specifier: string; typeOnly: boolean }, modulesRoot: string): Violation | null {
  const from = classifyPath(file, modulesRoot);
  if (!from) return null; // unclassifiable files are reported by checkFileName
  const s = imp.specifier;
  const bad = (why: string): Violation => ({ file, rule: "import", message: `${s}: ${why}` });

  if (!s.startsWith(".")) {
    if (s === "@ai-office/shared" || s.startsWith("node:")) return null;
    if (s === "vitest" || s.startsWith("vitest/")) return file.endsWith(".test.ts") ? null : bad("only test files may import vitest");
    if (INFRA_ONLY_LIBS.some((l) => (l.endsWith("/") ? s.startsWith(l) : s === l || s.startsWith(l + "/")))) {
      return from.layer === "infra" ? null : bad("infra-only library outside infra/");
    }
    return from.layer === "domain" ? bad("domain may not import packages") : null;
  }

  const root = norm(modulesRoot).replace(/\/$/, "");
  const target = posix.normalize(posix.join(posix.dirname(norm(file)), s.replace(/\.(js|ts)$/, "")));
  if (target.startsWith(posix.dirname(root) + "/core/")) return null;
  if (!target.startsWith(root + "/")) return from.layer === "infra" ? null : bad("outside modules/ and core/");

  const to = classifyPath(target + ".ts", root);
  if (!to) return bad("target is not in a valid modules/ folder layout");
  if (to.module !== from.module) return bad("modules may not import other modules");

  const sameAgg = from.aggregate !== null && from.aggregate === to.aggregate;
  let ok: boolean;
  if (from.aggregate === null) ok = from.layer === "infra" || to.layer === "domain" || to.layer === "application"; // module-level services
  else if (from.layer === "domain") ok = to.layer === "domain" && sameAgg;
  else if (from.layer === "application") {
    ok = to.layer === "domain" || (to.aggregate === null && to.layer === "application") ||
      (sameAgg && (to.layer === "application" || (to.folder === "adapter" && imp.typeOnly)));
  } else ok = true;
  return ok ? null : bad(`${from.layer} may not import ${to.layer}${to.folder ? "/" + to.folder : ""}`);
}

export function scanModules(modulesRoot: string): Violation[] {
  if (!existsSync(modulesRoot)) return [];
  const out: Violation[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) {
        const v = checkFileName(p, modulesRoot);
        if (v) out.push(v);
        for (const imp of parseImports(readFileSync(p, "utf8"))) {
          const iv = checkImport(p, imp, modulesRoot);
          if (iv) out.push(iv);
        }
      }
    }
  };
  walk(modulesRoot);
  return out;
}
