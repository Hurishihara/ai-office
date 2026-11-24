export type Platform = "x" | "linkedin" | "instagram";
export interface Preferences { tone: string; audience: string; emoji: "none" | "light" | "heavy"; hashtags: string; extra: string }
export interface NoteSummary { id: string; title: string; source: string; createdAt: string; preview: string }
export interface CreateNoteBody { title: string; text: string; source: string }
export interface RetrievedChunk { noteId: string; title: string; chunkIndex: number; text: string; score: number }
export interface QaReview { verdict: "pass" | "needs_revision"; issues: string[]; suggestions: string[] }
export interface UserDecision { action: "approve" | "revise" | "discard"; feedback?: string }
export type AssignmentStatus = "writing" | "reviewing" | "awaiting_user" | "approved" | "discarded" | "error";
export interface AssignmentSummary { id: string; platform: Platform; ask: string; status: AssignmentStatus; createdAt: string }
export interface AssignmentView extends AssignmentSummary {
  round: number; draft: string | null; retrievedNotes: RetrievedChunk[]; usedNoteIds: string[];
  qaReview: QaReview | null; finalPost: string | null; error: string | null; canRevise: boolean;
}
export interface ModelInfo { id: string; name: string; free: boolean; contextLength: number; promptPrice: string; completionPrice: string; supportsTools: boolean }
export interface Settings { writerModel: string; qaModel: string }
export type AgentId = "writer" | "qa";
export type AgentState = "idle" | "thinking" | "waiting" | "error";
export type ServerEvent =
  | { type: "agent"; agent: AgentId; state: AgentState; assignmentId?: string }
  | { type: "search"; assignmentId: string; query: string; hits: number }
  | { type: "handoff"; assignmentId: string }
  | { type: "assignment"; assignment: AssignmentSummary };
export const PLATFORMS: Platform[] = ["x", "linkedin", "instagram"];
export * from "./rules.js";
