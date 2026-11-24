import { Annotation, StateGraph, START, END, interrupt } from "@langchain/langgraph";
import type { BaseCheckpointSaver } from "@langchain/langgraph";
import { MAX_ROUNDS, type AssignmentStatus, type Platform, type Preferences, type QaReview, type RetrievedChunk, type ServerEvent, type UserDecision } from "@ai-office/shared";
import type { WriterFn } from "./writer.js";
import type { QaFn } from "./qa.js";

// Every field uses the default "last value wins" channel (no reducers).
const State = Annotation.Root({
  assignmentId: Annotation<string>(),
  platform: Annotation<Platform>(),
  ask: Annotation<string>(),
  preferences: Annotation<Preferences>(),
  draft: Annotation<string | null>(),
  retrievedNotes: Annotation<RetrievedChunk[]>(),
  usedNoteIds: Annotation<string[]>(),
  qaReview: Annotation<QaReview | null>(),
  userDecision: Annotation<UserDecision | null>(),
  round: Annotation<number>(),
  status: Annotation<AssignmentStatus>(),
  finalPost: Annotation<string | null>(),
});
export type PipelineState = typeof State.State;

export interface HumanReviewPayload {
  draft: string; qaReview: QaReview; retrievedNotes: RetrievedChunk[]; usedNoteIds: string[]; round: number; canRevise: boolean;
}

export function nextAfterHuman(state: PipelineState): "write" | "__end__" {
  return state.userDecision?.action === "revise" && state.round < MAX_ROUNDS ? "write" : "__end__";
}

export function buildGraph(deps: { writer: WriterFn; qa: QaFn; checkpointer: BaseCheckpointSaver; emit: (e: ServerEvent) => void }) {
  const { writer, qa, checkpointer, emit } = deps;

  const write = async (s: PipelineState) => {
    const id = s.assignmentId;
    emit({ type: "agent", agent: "writer", state: "thinking", assignmentId: id });
    // The round bumps here, not in human_review: nextAfterHuman must see the round that was just reviewed.
    const revising = s.userDecision?.action === "revise";
    const round = revising ? s.round + 1 : s.round;
    const revision = revising && s.draft && s.qaReview ? { previousDraft: s.draft, qaReview: s.qaReview, feedback: s.userDecision?.feedback } : undefined;
    const r = await writer({
      platform: s.platform, ask: s.ask, preferences: s.preferences, revision,
      onSearch: (query, hits) => emit({ type: "search", assignmentId: id, query, hits }),
    });
    emit({ type: "agent", agent: "writer", state: "idle", assignmentId: id });
    emit({ type: "handoff", assignmentId: id });
    return { round, draft: r.post, usedNoteIds: r.usedNoteIds, retrievedNotes: r.retrievedNotes, status: "reviewing" as const };
  };

  const qaReview = async (s: PipelineState) => {
    emit({ type: "agent", agent: "qa", state: "thinking", assignmentId: s.assignmentId });
    const review = await qa({
      platform: s.platform, preferences: s.preferences, draft: s.draft!,
      usedNotes: s.retrievedNotes.filter((c) => s.usedNoteIds.includes(c.noteId)),
    });
    emit({ type: "agent", agent: "qa", state: "waiting", assignmentId: s.assignmentId });
    return { qaReview: review, status: "awaiting_user" as const };
  };

  // Re-runs from the top on resume: nothing with side effects before interrupt().
  const humanReview = (s: PipelineState) => {
    const decision = interrupt<HumanReviewPayload, UserDecision>({
      draft: s.draft!, qaReview: s.qaReview!, retrievedNotes: s.retrievedNotes, usedNoteIds: s.usedNoteIds,
      round: s.round, canRevise: s.round < MAX_ROUNDS,
    });
    emit({ type: "agent", agent: "qa", state: "idle", assignmentId: s.assignmentId });
    if (decision.action === "approve") return { userDecision: decision, finalPost: s.draft, status: "approved" as const };
    if (decision.action === "discard") return { userDecision: decision, status: "discarded" as const };
    return { userDecision: decision, status: "writing" as const };
  };

  return new StateGraph(State)
    .addNode("write", write)
    .addNode("qa_review", qaReview)
    .addNode("human_review", humanReview)
    .addEdge(START, "write")
    .addEdge("write", "qa_review")
    .addEdge("qa_review", "human_review")
    .addConditionalEdges("human_review", nextAfterHuman, { write: "write", [END]: END })
    .compile({ checkpointer });
}
