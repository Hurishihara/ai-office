import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import type { AssignmentStatus, QaReview, ServerEvent } from "@ai-office/shared";
import { createApp } from "../src/app.js";
import { EventBus } from "../src/core/event-bus.js";
import { AssignmentService } from "../src/pipeline/assignments.js";
import { buildGraph } from "../src/pipeline/graph.js";
import type { WriterFn } from "../src/pipeline/writer.js";
import { PreferencesStore } from "../src/preferences.js";
import { describeModelError } from "../src/models/openrouter.js";

const review: QaReview = { verdict: "pass", issues: [], suggestions: [] };
const okWriter: WriterFn = async (input) => {
  input.onSearch("q", 1);
  return { post: "draft", usedNoteIds: ["a"], retrievedNotes: [{ noteId: "a", title: "A", chunkIndex: 0, text: "x", score: 1 }] };
};

async function setup(opts: { dir?: string; writer?: WriterFn } = {}) {
  const dir = opts.dir ?? await fs.mkdtemp(path.join(os.tmpdir(), "assignments-"));
  const bus = new EventBus();
  const events: ServerEvent[] = [];
  bus.subscribe((e) => events.push(e));
  const writer = vi.fn(opts.writer ?? okWriter);
  const graph = buildGraph({
    writer, qa: async () => review,
    checkpointer: SqliteSaver.fromConnString(path.join(dir, "checkpoints.sqlite")),
    emit: (e) => bus.publish(e),
  });
  const service = new AssignmentService({ graph, preferences: new PreferencesStore(path.join(dir, "preferences.json")), indexFile: path.join(dir, "assignments.json"), bus });
  await service.load();
  const app = createApp({ assignments: service, bus });
  const waitForStatus = (id: string, status: AssignmentStatus) => waitFor(async () => (await service.get(id))?.status === status);
  const start = async (ask = "post about my launch") => {
    const res = await request(app).post("/api/assignments").send({ platform: "x", ask });
    expect(res.status).toBe(202);
    return res.body.id as string;
  };
  const decide = (id: string, d: object) => request(app).post(`/api/assignments/${id}/decision`).send(d);
  const retry = (id: string) => request(app).post(`/api/assignments/${id}/retry`);
  return { dir, bus, events, writer, service, app, waitForStatus, start, decide, retry };
}

async function waitFor(check: () => Promise<boolean> | boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 10));
  }
}

function gate() {
  let open!: () => void;
  const wait = new Promise<void>((r) => { open = r; });
  return { wait, open };
}

const failOnce =(err: unknown): WriterFn => {
  let failed = false;
  return async (input) => {
    if (!failed) { failed = true; throw err; }
    return okWriter(input);
  };
};

describe("assignments", () => {
  it("POST starts an assignment and it reaches awaiting_user", async () => {
    const t = await setup();
    const id = await t.start();
    await t.waitForStatus(id, "awaiting_user");
    const view = (await request(t.app).get(`/api/assignments/${id}`)).body;
    expect(view).toMatchObject({ id, platform: "x", status: "awaiting_user", draft: "draft", round: 1, canRevise: true, usedNoteIds: ["a"], qaReview: review, error: null });
    expect((await request(t.app).get("/api/assignments")).body.map((a: { id: string }) => a.id)).toEqual([id]);
  });

  it("rejects an unknown platform", async () => {
    const t = await setup();
    const res = await request(t.app).post("/api/assignments").send({ platform: "myspace", ask: "hi" });
    expect(res.status).toBe(400);
    expect((await request(t.app).post("/api/assignments").send({ platform: "x", ask: "" })).status).toBe(400);
  });

  it("approve → approved with finalPost", async () => {
    const t = await setup();
    const id = await t.start();
    await t.waitForStatus(id, "awaiting_user");
    const res = await t.decide(id, { action: "approve" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "approved", finalPost: "draft" });
    await t.waitForStatus(id, "approved");
    expect((await t.service.get(id))!.finalPost).toBe("draft");
  });

  it("two decisions sent at the same moment: one 200, one 409, one resume", async () => {
    // The revision blocks until both responses are in, so the second decision can't land on a finished round 2.
    const g = gate();
    const t = await setup({ writer: async (input) => { if (input.revision) await g.wait; return okWriter(input); } });
    const id = await t.start();
    await t.waitForStatus(id, "awaiting_user");
    const [a, b] = await Promise.all([t.decide(id, { action: "revise", feedback: "x" }), t.decide(id, { action: "revise", feedback: "y" })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 200 ? a : b).body).toMatchObject({ status: "writing", round: 2 });
    await waitFor(() => t.writer.mock.calls.length === 2); // the revision is now in the write node
    expect((await t.service.get(id))!).toMatchObject({ status: "writing", round: 2 });
    g.open();
    await t.waitForStatus(id, "awaiting_user");
    expect(t.writer).toHaveBeenCalledTimes(2); // first draft + exactly one revision
    expect((await t.service.get(id))!.round).toBe(2);

    // Same tick, no network in between: only a synchronous check-and-claim gives one winner here.
    const [c, d] = await Promise.allSettled([t.service.decide(id, { action: "revise" }), t.service.decide(id, { action: "revise" })]);
    expect([c.status, d.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect([c, d].find((r) => r.status === "rejected")).toMatchObject({ reason: { message: "Assignment is not waiting for a decision" } });
    await t.waitForStatus(id, "awaiting_user");
    expect(t.writer).toHaveBeenCalledTimes(3);
  });

  it("two retries at the same moment start one run", async () => {
    const g = gate();
    let calls = 0;
    const t = await setup({ writer: async (input) => {
      if (++calls === 1) throw new Error("boom");
      await g.wait; // the retried run stays in flight until both retries are answered
      return okWriter(input);
    } });
    const id = await t.start();
    await t.waitForStatus(id, "error");
    const [a, b] = await Promise.all([t.retry(id), t.retry(id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    g.open();
    await t.waitForStatus(id, "awaiting_user");
    expect(t.writer).toHaveBeenCalledTimes(2);

    // Same tick at the service level: fail the next revision, then retry twice at once.
    calls = 0;
    await t.service.decide(id, { action: "revise" });
    await t.waitForStatus(id, "error");
    const [c, d] = await Promise.allSettled([t.service.retry(id), t.service.retry(id)]);
    expect([c.status, d.status].sort()).toEqual(["fulfilled", "rejected"]);
    await t.waitForStatus(id, "awaiting_user");
    expect(t.writer).toHaveBeenCalledTimes(4);
  });

  it("an assignment cut off mid-run comes back as error and Retry finishes it", async () => {
    const first = await setup({ writer: () => new Promise(() => {}) });
    const id = await first.start();
    await waitFor(() => first.writer.mock.calls.length === 1);
    await waitFor(async () => (await fs.readFile(path.join(first.dir, "assignments.json"), "utf8").catch(() => "")).includes(id));

    const second = await setup({ dir: first.dir });
    expect(await second.service.recoverInterrupted()).toBe(1);
    const view = (await second.service.get(id))!;
    expect(view.status).toBe("error");
    expect(view.error).toBe("Server stopped during this step. Press Retry.");
    expect((await second.retry(id)).status).toBe(200);
    await second.waitForStatus(id, "awaiting_user");
    expect((await second.service.get(id))!.draft).toBe("draft");
  });

  it("two assignments finishing together both keep their status in the file", async () => {
    const g = gate();
    const t = await setup({ writer: async (input) => { await g.wait; return okWriter(input); } });
    const a = await t.start("a");
    const b = await t.start("b");
    await waitFor(() => t.writer.mock.calls.length === 2);
    g.open();
    await t.waitForStatus(a, "awaiting_user");
    await t.waitForStatus(b, "awaiting_user");
    await waitFor(async () => {
      const fresh = await setup({ dir: t.dir });
      return (await fresh.service.list()).every((s) => s.status === "awaiting_user");
    });
    const fresh = await setup({ dir: t.dir });
    expect((await fresh.service.list()).map((s) => s.status)).toEqual(["awaiting_user", "awaiting_user"]);
  });

  it("revise on round 3 returns 400 and stays paused", async () => {
    const t = await setup();
    const id = await t.start();
    await t.waitForStatus(id, "awaiting_user");
    for (const round of [2, 3]) {
      expect((await t.decide(id, { action: "revise", feedback: "more" })).status).toBe(200);
      await waitFor(async () => (await t.service.get(id))!.round === round && (await t.service.get(id))!.status === "awaiting_user");
    }
    expect((await t.service.get(id))!.canRevise).toBe(false);
    const res = await t.decide(id, { action: "revise", feedback: "again" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Revision limit reached: approve or discard");
    const view = (await t.service.get(id))!;
    expect(view).toMatchObject({ status: "awaiting_user", round: 3 });
    expect(t.writer).toHaveBeenCalledTimes(3);
    expect((await t.decide(id, { action: "approve" })).status).toBe(200);
    await t.waitForStatus(id, "approved");
  });

  it("rejects bad decisions", async () => {
    const t = await setup();
    expect((await t.decide("00000000-0000-4000-8000-000000000000", { action: "approve" })).status).toBe(404);
    const id = await t.start();
    await t.waitForStatus(id, "awaiting_user");
    expect((await t.decide(id, { action: "revise", feedback: "x".repeat(2001) })).status).toBe(400);
    expect((await t.decide(id, { action: "maybe" })).status).toBe(400);
    expect((await t.decide(id, { action: "approve" })).status).toBe(200);
    const late = await t.decide(id, { action: "approve" });
    expect(late.status).toBe(409);
    expect(late.body.error).toBe("Assignment is not waiting for a decision");
  });

  it("survives a restart while paused", async () => {
    const first = await setup();
    const id = await first.start();
    await first.waitForStatus(id, "awaiting_user");
    await waitFor(async () => (await fs.readFile(path.join(first.dir, "assignments.json"), "utf8").catch(() => "")).includes("awaiting_user"));

    const second = await setup({ dir: first.dir });
    expect(await second.service.recoverInterrupted()).toBe(0);
    expect((await second.service.get(id))!.status).toBe("awaiting_user");
    expect((await second.decide(id, { action: "approve" })).status).toBe(200);
    await second.waitForStatus(id, "approved");
    expect((await second.service.get(id))!.finalPost).toBe("draft");
  });

  it("a writer failure marks error and retry recovers", async () => {
    const t = await setup({ writer: failOnce(Object.assign(new Error("Too many requests"), { status: 429 })) });
    const id = await t.start();
    await t.waitForStatus(id, "error");
    expect((await t.service.get(id))!.error).toBe(describeModelError({ status: 429 }));
    expect(t.events).toContainEqual({ type: "agent", agent: "writer", state: "error", assignmentId: id });
    expect((await t.retry(id)).status).toBe(200);
    await t.waitForStatus(id, "awaiting_user");
    expect((await t.service.get(id))!.error).toBeNull();
  });
});
