import { describe, it, expect } from "vitest";
import { Settings } from "./settings.js";

describe("Settings", () => {
  it("round-trips valid props", () => expect(Settings.create({ writerModel: "w", qaModel: "q" }).toJSON()).toEqual({ writerModel: "w", qaModel: "q" }));
  it("rejects an empty model id", () => {
    expect(() => Settings.create({ writerModel: "", qaModel: "q" })).toThrow("writerModel: must not be empty");
    expect(() => Settings.create({ writerModel: "w", qaModel: "" })).toThrow("qaModel: must not be empty");
  });
  it("rejects non-string model ids", () => expect(() => Settings.create({ writerModel: 1 as never, qaModel: "q" })).toThrow("writerModel: must be a string"));
  it("whitespace model id is accepted, as today", () => expect(Settings.create({ writerModel: "  ", qaModel: "q" }).toJSON().writerModel).toBe("  "));
  it("drops extra keys", () => expect(Settings.create({ writerModel: "w", qaModel: "q", foo: 1 } as never).toJSON()).toEqual({ writerModel: "w", qaModel: "q" }));
});
