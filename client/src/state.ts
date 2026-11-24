import type { AgentId, AgentState, AssignmentSummary, ServerEvent } from "@ai-office/shared";

export interface OfficeState {
  agents: Record<AgentId, AgentState>;
  assignments: AssignmentSummary[]; // newest first
  lastHandoff: string | null;
}

export const initialState = (): OfficeState => ({ agents: { writer: "idle", qa: "idle" }, assignments: [], lastHandoff: null });

export function applyEvent(s: OfficeState, e: ServerEvent): OfficeState {
  switch (e.type) {
    case "agent": return { ...s, agents: { ...s.agents, [e.agent]: e.state } };
    case "handoff": return { ...s, lastHandoff: e.assignmentId };
    case "assignment": {
      const i = s.assignments.findIndex((a) => a.id === e.assignment.id);
      const assignments = i >= 0
        ? s.assignments.map((a, j) => (j === i ? e.assignment : a))
        : [e.assignment, ...s.assignments];
      return { ...s, assignments };
    }
    default: return s;
  }
}

export function createStore<T>(initial: T) {
  let state = initial;
  const subs = new Set<(s: T) => void>();
  return {
    get: () => state,
    set(next: T) { state = next; subs.forEach((f) => f(state)); },
    subscribe(fn: (s: T) => void) { subs.add(fn); return () => subs.delete(fn); },
  };
}
