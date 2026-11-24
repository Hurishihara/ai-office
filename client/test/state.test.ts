import { describe, expect, it } from "vitest";
import type { AssignmentStatus, AssignmentSummary } from "@ai-office/shared";
import { agentsFromAssignments, applyEvent, initialState } from "../src/state";

const a = (id: string, status: AssignmentStatus): AssignmentSummary => ({ id, platform: "x", ask: "q", status, createdAt: "2026-01-01" });

describe("applyEvent", () => {
  it("agent events set that agent's state only", () => {
    const s = applyEvent(initialState(), { type: "agent", agent: "qa", state: "waiting" });
    expect(s.agents).toEqual({ writer: "idle", qa: "waiting" });
  });
  it("assignment events upsert by id", () => {
    let s = applyEvent(initialState(), { type: "assignment", assignment: a("1", "writing") });
    s = applyEvent(s, { type: "assignment", assignment: a("1", "awaiting_user") });
    expect(s.assignments).toHaveLength(1);
    expect(s.assignments[0].status).toBe("awaiting_user");
  });
  it("new assignments go first", () => {
    let s = applyEvent(initialState(), { type: "assignment", assignment: a("1", "writing") });
    s = applyEvent(s, { type: "assignment", assignment: a("2", "writing") });
    expect(s.assignments.map((x) => x.id)).toEqual(["2", "1"]);
  });
  it("handoff records the assignment id", () => {
    expect(applyEvent(initialState(), { type: "handoff", assignmentId: "1" }).lastHandoff).toBe("1");
  });
  it("two handoffs with the same id each bump handoffSeq (revise rounds)", () => {
    expect(initialState().handoffSeq).toBe(0);
    const s1 = applyEvent(initialState(), { type: "handoff", assignmentId: "1" });
    const s2 = applyEvent(s1, { type: "handoff", assignmentId: "1" });
    expect([s1.handoffSeq, s2.handoffSeq]).toEqual([1, 2]);
  });
  it("applyEvent does not mutate its input", () => {
    const s = initialState();
    const snap = structuredClone(s);
    applyEvent(s, { type: "agent", agent: "writer", state: "thinking" });
    applyEvent(s, { type: "assignment", assignment: a("1", "writing") });
    expect(s).toEqual(snap);
  });
});

describe("agentsFromAssignments", () => {
  it("awaiting_user puts QA in waiting", () => {
    expect(agentsFromAssignments([a("1", "approved"), a("2", "awaiting_user")])).toEqual({ writer: "idle", qa: "waiting" });
  });
  it("writing puts the writer thinking, reviewing puts QA thinking", () => {
    expect(agentsFromAssignments([a("1", "writing")])).toEqual({ writer: "thinking", qa: "idle" });
    expect(agentsFromAssignments([a("1", "reviewing"), a("2", "awaiting_user")])).toEqual({ writer: "idle", qa: "thinking" });
  });
  it("everything else (incl. error, which names no agent) stays idle", () => {
    expect(agentsFromAssignments([a("1", "approved"), a("2", "error"), a("3", "discarded")])).toEqual({ writer: "idle", qa: "idle" });
    expect(agentsFromAssignments([])).toEqual({ writer: "idle", qa: "idle" });
  });
});
