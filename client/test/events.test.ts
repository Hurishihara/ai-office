import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { subscribeEvents } from "../src/api";

// Node has no EventSource: a minimal fake with the spec's readyState constants.
class FakeEventSource {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readyState = FakeEventSource.CONNECTING;
  private listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) { FakeEventSource.instances.push(this); }
  addEventListener(type: string, fn: (e: unknown) => void) { (this.listeners[type] ??= []).push(fn); }
  emit(type: string, e: unknown = {}) { this.listeners[type]?.forEach((f) => f(e)); }
  close() { this.readyState = FakeEventSource.CLOSED; }
}

describe("subscribeEvents", () => {
  beforeEach(() => { FakeEventSource.instances = []; vi.useFakeTimers(); vi.stubGlobal("EventSource", FakeEventSource); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("calls onReconnect on every open, including the first", () => {
    const onReconnect = vi.fn();
    subscribeEvents(() => {}, onReconnect);
    const es = FakeEventSource.instances[0];
    es.emit("open");
    es.emit("open");
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });
  it("reopens after ~2 s when the stream is closed for good (e.g. a 502 from the proxy)", () => {
    const onEvent = vi.fn();
    subscribeEvents(onEvent, () => {});
    const first = FakeEventSource.instances[0];
    first.emit("error"); // still CONNECTING: the browser retries by itself
    vi.advanceTimersByTime(5000);
    expect(FakeEventSource.instances).toHaveLength(1);
    first.readyState = FakeEventSource.CLOSED;
    first.emit("error");
    vi.advanceTimersByTime(1999);
    expect(FakeEventSource.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].emit("message", { data: JSON.stringify({ type: "handoff", assignmentId: "a" }) });
    expect(onEvent).toHaveBeenCalledWith({ type: "handoff", assignmentId: "a" });
  });
  it("unsubscribe closes the stream and stops reconnect attempts", () => {
    const off = subscribeEvents(() => {}, () => {});
    const first = FakeEventSource.instances[0];
    first.readyState = FakeEventSource.CLOSED;
    first.emit("error");
    off();
    vi.advanceTimersByTime(10_000);
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(first.readyState).toBe(FakeEventSource.CLOSED);
  });
});
