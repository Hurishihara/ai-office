import { describe, it, expect } from "vitest";
import { Preferences } from "./preferences.js";

const d = { tone: "", audience: "", emoji: "light" as const, hashtags: "", extra: "" };

describe("Preferences", () => {
  it("defaults match the previous defaults", () => expect(Preferences.defaults().toJSON()).toEqual({ tone: "", audience: "", emoji: "light", hashtags: "", extra: "" }));
  it("rejects an unknown emoji level", () => expect(() => Preferences.create({ ...d, emoji: "lots" as never })).toThrow("emoji: must be one of none, light, heavy"));
  it("rejects a non-string field", () => expect(() => Preferences.create({ ...d, tone: 1 as never })).toThrow("tone: must be a string"));
  it("drops extra keys", () => expect(Preferences.create({ ...d, foo: 1 } as never).toJSON()).toEqual(d));
  it("accepts 2000 chars and rejects 2001", () => {
    Preferences.create({ ...d, tone: "a".repeat(2000) });
    expect(() => Preferences.create({ ...d, tone: "a".repeat(2001) })).toThrow("tone: must be at most 2000 characters");
  });
});
