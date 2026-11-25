import { describe, it, expect } from "vitest";
import type { ModelInfo } from "@ai-office/shared";
import { ModelCatalog } from "./model-catalog.js";

const m = (id: string, name: string, free: boolean, supportsTools: boolean): ModelInfo => ({
  id, name, free, supportsTools, contextLength: 1000, promptPrice: free ? "0" : "0.000001", completionPrice: free ? "0" : "0.000002",
});
const catalog = new ModelCatalog([
  m("paid/notools", "Paid No Tools", false, false),
  m("paid/tools", "Paid Tools", false, true),
  m("free/notools", "Free No Tools", true, false),
  m("free/tools", "Free Tools", true, true),
]);

describe("ModelCatalog", () => {
  it("writer list = free, tool-capable only by default", () => {
    expect(catalog.select({ role: "writer", freeOnly: true }).map((x) => x.id)).toEqual(["free/tools"]);
  });
  it("freeOnly=false adds paid tool-capable models", () => {
    expect(catalog.select({ role: "qa", freeOnly: false }).map((x) => x.id)).toEqual(["free/tools", "paid/tools"]);
  });
});
