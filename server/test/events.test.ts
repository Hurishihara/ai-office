import { describe, it, expect, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.js";
import { EventBus } from "../src/core/event-bus.js";

let server: http.Server | undefined;
afterEach(() => { server?.closeAllConnections(); server?.close(); });

async function openStream(bus: EventBus) {
  server = createApp({ bus }).listen(0, "127.0.0.1");
  await new Promise((r) => server!.once("listening", r));
  const { port } = server.address() as AddressInfo;
  const req = http.get({ host: "127.0.0.1", port, path: "/api/events" });
  const res = await new Promise<http.IncomingMessage>((r) => req.once("response", r));
  return { req, res };
}

async function waitFor(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("events", () => {
  it("SSE streams published events", async () => {
    const bus = new EventBus();
    const { res } = await openStream(bus);
    expect(res.headers["content-type"]).toMatch(/^text\/event-stream/);
    let body = "";
    res.on("data", (c) => { body += c; });
    bus.publish({ type: "handoff", assignmentId: "a1" });
    await waitFor(() => body.includes("\n\n"));
    expect(body).toContain(`data: {"type":"handoff","assignmentId":"a1"}\n\n`);
  });

  it("closing the SSE connection removes its listener", async () => {
    const bus = new EventBus();
    const { req } = await openStream(bus);
    expect(bus.subscriberCount()).toBe(1);
    req.destroy();
    await waitFor(() => bus.subscriberCount() === 0);
  });
});
