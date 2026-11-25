// Root typescript@6 exists only for typescript-eslint; remove once it supports TS 7.
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
// Only *.test.ts files may import __test__ (later blocks replace earlier rule options, so it joins each layer's list).
const layer = (files: string, patterns: Pattern[]) => [
  { files: [files], ignores: ["**/*.test.ts"], rules: restrict([...patterns, "**/__test__/**"]) },
  ...(patterns.length ? [{ files: [[files, "**/*.test.ts"]], rules: restrict(patterns) }] : []),
];
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
  ...layer("src/modules/**/domain/**/*.ts", ["**/application/**", "**/infra/**", ...libPatterns]),
  ...layer("src/modules/**/application/**/*.ts", [
    "**/infra/persistence/**", "**/infra/interface/**", "**/infra/external/**", "**/infra/services/**",
    ...libPatterns,
    { group: ["**/infra/adapter/**"], allowTypeImports: true },
  ]),
  ...layer("src/modules/**/infra/**/*.ts", []),
  {
    files: ["src/core/**/*.ts"],
    rules: restrict(["**/modules/**"]),
  },
  {
    files: ["src/modules/**/*.ts"],
    rules: {
      "check-file/folder-naming-convention": ["error", { "src/modules/!(__test__)/**/": "KEBAB_CASE" }],
      "check-file/filename-naming-convention": ["error", {
        "src/modules/__test__/factories/*.ts": "+([a-z0-9-])@(.factory|.seeder)",
        "src/modules/__test__/helpers/*.ts": "+([a-z0-9-]).helper",
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
