import { Router } from "express";
import type { EventBus } from "../events.js";

const PING_MS = 25_000;

export function eventsRouter(bus: EventBus): Router {
  const r = Router();
  r.get("/", (req, res) => {
    res.set({ "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    res.flushHeaders();
    const unsubscribe = bus.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
    const ping = setInterval(() => res.write(": ping\n\n"), PING_MS);
    req.on("close", () => {
      clearInterval(ping);
      unsubscribe();
    });
  });
  return r;
}
