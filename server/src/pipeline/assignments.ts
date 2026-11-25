import { randomUUID } from "node:crypto";
import { Command } from "@langchain/langgraph";
import { MAX_ROUNDS, type AssignmentStatus, type AssignmentSummary, type AssignmentView, type Platform, type Preferences, type UserDecision } from "@ai-office/shared";
import type { EventBus } from "../core/event-bus.js";
import { readJson, writeJson } from "../core/json-file.js";
import { NotFoundError, ConflictError, BadRequestError } from "../core/errors.js";
import { describeModelError } from "../models/openrouter.js";
import type { buildGraph, PipelineState } from "./graph.js";


type IndexEntry = AssignmentSummary & { error: string | null };
type Graph = ReturnType<typeof buildGraph>;

export const INTERRUPTED_ERROR = "Server stopped during this step. Press Retry.";
const MAX_FEEDBACK = 2000;

export class AssignmentService {
  private graph: Graph;
  private preferences: { get(): Promise<Preferences> };
  private indexFile: string;
  private bus: EventBus;
  private index = new Map<string, IndexEntry>();
  private saving: Promise<void> = Promise.resolve();

  constructor(opts: { graph: Graph; preferences: { get(): Promise<Preferences> }; indexFile: string; bus: EventBus }) {
    ({ graph: this.graph, preferences: this.preferences, indexFile: this.indexFile, bus: this.bus } = opts);
    // The writer's handoff is the only signal that a run moved from writing to QA.
    this.bus.subscribe((e) => {
      if (e.type === "handoff" && this.index.get(e.assignmentId)?.status === "writing") this.update(e.assignmentId, { status: "reviewing" });
    });
  }

  async load(): Promise<void> {
    const entries = await readJson<IndexEntry[]>(this.indexFile, []);
    this.index = new Map(entries.map((e) => [e.id, e]));
  }

  async recoverInterrupted(): Promise<number> {
    let n = 0;
    for (const e of this.index.values()) {
      if (e.status !== "writing" && e.status !== "reviewing") continue;
      this.update(e.id, { status: "error", error: INTERRUPTED_ERROR });
      n++;
    }
    await this.saving;
    return n;
  }

  async start(input: { platform: Platform; ask: string }): Promise<AssignmentSummary> {
    const preferences = await this.preferences.get();
    const id = randomUUID();
    this.update(id, { id, platform: input.platform, ask: input.ask, status: "writing", createdAt: new Date().toISOString(), error: null });
    const initial: PipelineState = {
      assignmentId: id, platform: input.platform, ask: input.ask, preferences, draft: null, retrievedNotes: [], usedNoteIds: [],
      qaReview: null, userDecision: null, round: 1, status: "writing", finalPost: null,
    };
    this.run(id, initial);
    return summary(this.index.get(id)!);
  }

  async get(id: string): Promise<AssignmentView | null> {
    const e = this.index.get(id);
    if (!e) return null;
    const v = (await this.graph.getState(cfg(id))).values as Partial<PipelineState>;
    const reviewed = v.round ?? 1;
    // The round bumps when the write node starts, so a revision in progress still shows the previous round in state.
    // Right after a revise claim the checkpoint is still awaiting_user until human_review re-runs.
    const revising = (e.status === "writing" && v.status === "awaiting_user") || (v.status === "writing" && v.userDecision?.action === "revise");
    const round = revising ? reviewed + 1 : reviewed;
    return {
      ...summary(e), round, draft: v.draft ?? null, retrievedNotes: v.retrievedNotes ?? [], usedNoteIds: v.usedNoteIds ?? [],
      // human_review sets finalPost = draft; derive it so an approve claim never shows approved without its post.
      qaReview: v.qaReview ?? null, finalPost: v.finalPost ?? (e.status === "approved" ? v.draft ?? null : null), error: e.error,
      canRevise: e.status === "awaiting_user" && reviewed < MAX_ROUNDS,
    };
  }

  async list(): Promise<AssignmentSummary[]> {
    return [...this.index.values()].map(summary).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async decide(id: string, d: UserDecision): Promise<AssignmentView> {
    const e = this.index.get(id);
    if (!e) throw new NotFoundError("Assignment not found");
    if ((d.feedback?.length ?? 0) > MAX_FEEDBACK) throw new BadRequestError("Feedback is over 2,000 characters");
    if (e.status !== "awaiting_user") throw new ConflictError("Assignment is not waiting for a decision");
    // Synchronous claim: a second decision arriving now sees the new status and gets 409.
    const claimed: AssignmentStatus = d.action === "approve" ? "approved" : d.action === "discard" ? "discarded" : "writing";
    e.status = claimed;
    if (d.action === "revise") {
      // Nothing runs while we hold the claim, so the round read here is the one the user is deciding on.
      try {
        if ((await this.graph.getState(cfg(id))).values.round >= MAX_ROUNDS) throw new BadRequestError("Revision limit reached: approve or discard");
      } catch (err) {
        this.update(id, { status: "awaiting_user" }); // via update: another run's save may have written our claim to disk
        throw err;
      }
    }
    this.update(id, { status: claimed });
    this.run(id, new Command({ resume: d }));
    return (await this.get(id))!;
  }

  async retry(id: string): Promise<AssignmentView> {
    const e = this.index.get(id);
    if (!e) throw new NotFoundError("Assignment not found");
    if (e.status !== "error") throw new ConflictError("Assignment has not failed");
    this.update(id, { status: "writing", error: null });
    this.run(id, null); // resumes from the last checkpoint, re-running the node that failed
    return (await this.get(id))!;
  }

  private run(id: string, input: unknown): void {
    const c = cfg(id);
    this.graph.invoke(input as PipelineState, c)
      .then(async () => {
        const status = (await this.graph.getState(c)).values.status as AssignmentStatus;
        this.update(id, { status, error: null });
      }, async (err: unknown) => {
        const failedIn = (await this.graph.getState(c)).values.status as AssignmentStatus | undefined;
        this.update(id, { status: "error", error: describeModelError(err) });
        this.bus.publish({ type: "agent", agent: failedIn === "reviewing" ? "qa" : "writer", state: "error", assignmentId: id });
      })
      .catch((err: unknown) => {
        console.error(`assignment ${id}: could not record the run result`, err);
        this.update(id, { status: "error", error: describeModelError(err) });
      });
  }

  // Updates the in-memory entry synchronously; disk writes are queued so concurrent runs never overwrite each other.
  private update(id: string, patch: Partial<IndexEntry>): void {
    const e = { ...this.index.get(id), ...patch } as IndexEntry;
    this.index.set(id, e);
    this.saving = this.saving
      .then(() => writeJson(this.indexFile, [...this.index.values()]))
      .catch((err: unknown) => console.error("could not save the assignment index", err));
    this.bus.publish({ type: "assignment", assignment: summary(e) });
  }
}

const cfg = (id: string) => ({ configurable: { thread_id: id } });
const summary = ({ id, platform, ask, status, createdAt }: IndexEntry): AssignmentSummary => ({ id, platform, ask, status, createdAt });
