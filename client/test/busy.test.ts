import { describe, expect, it } from "vitest";
import { withBusy } from "../src/ui/panel";

describe("withBusy", () => {
  it("runs fn once for a double click and re-enables afterwards, even on error", async () => {
    const btn = { disabled: false };
    let calls = 0;
    const slow = async () => { calls++; await Promise.resolve(); throw new Error("x"); };
    await Promise.allSettled([withBusy(btn, slow), withBusy(btn, slow)]);
    expect(calls).toBe(1);
    expect(btn.disabled).toBe(false);
  });
});
