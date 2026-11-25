import tseslint from "typescript-eslint";
import checkFile from "eslint-plugin-check-file";
import { INFRA_ONLY_LIBS } from "./src/context/architecture.js";

// Cross-module imports are not checked here (globs can't compare module names); src/context/architecture.test.ts covers them.
const libPatterns = INFRA_ONLY_LIBS.flatMap((l) => (l.endsWith("/") ? [`${l}*`] : [l, `${l}/*`]));
type Pattern = string | { group: string[]; allowTypeImports?: boolean };
// the rule requires all-string or all-object patterns, so normalise to objects
const restrict = (patterns: Pattern[]) => ({
  "@typescript-eslint/no-restricted-imports": ["error", { patterns: patterns.map((p) => (typeof p === "string" ? { group: [p] } : p)) }],
});
// `.test` is optional via ?(.test)
const endings = (dir: string, alts: string[]) => ({
  [`src/modules/**/${dir}/*.ts`]: `+([a-z0-9-])@(${alts.join("|")})?(.test)`,
});

export default tseslint.config(
  {
    files: ["src/modules/**/*.ts", "src/core/**/*.ts"],
    extends: [tseslint.configs.base],
    plugins: { "check-file": checkFile },
  },
  {
    files: ["src/modules/**/domain/**/*.ts"],
    rules: restrict(["**/application/**", "**/infra/**", ...libPatterns]),
  },
  {
    files: ["src/modules/**/application/**/*.ts"],
    rules: restrict([
      "**/infra/persistence/**", "**/infra/interface/**", "**/infra/external/**", "**/infra/services/**",
      ...libPatterns,
      { group: ["**/infra/adapter/**"], allowTypeImports: true },
    ]),
  },
  {
    files: ["src/core/**/*.ts"],
    rules: restrict(["**/modules/**"]),
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "check-file/folder-naming-convention": ["error", { "src/modules/**/": "KEBAB_CASE" }],
      "check-file/filename-naming-convention": ["error", {
        "src/modules/**/domain/*.ts": "+([a-z0-9-])?(.value-object)?(.test)",
        ...endings("application/ports", [".port"]),
        ...endings("application/usecases", [".usecase"]),
        ...endings("application/services", [".service"]),
        ...endings("infra/services", [".service"]),
        ...endings("infra/adapter", [".repository"]),
        ...endings("infra/persistence", [".repository", ".mapper"]),
        ...endings("infra/interface", [".dto", ".controller"]),
        ...endings("infra/external", [".external"]),
      }],
    },
  },
);
