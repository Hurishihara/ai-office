import type { ServerEvent } from "@ai-office/shared";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "./event-bus.js";

describe("EventBus", () => {
  it("delivers to subscribers and stops after unsubscribe", () => {
    const e = { type: "x" } as unknown as ServerEvent;
    const bus = new EventBus();
    const fn = vi.fn();
    const off = bus.subscribe(fn);
    bus.publish(e);
    off();
    bus.publish(e);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.subscriberCount()).toBe(0);
  });
});
