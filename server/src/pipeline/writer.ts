import { createAgent, tool } from "langchain";
import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredTool } from "@langchain/core/tools";
import type { Platform, Preferences, QaReview, RetrievedChunk } from "@ai-office/shared";
import type { NoteService } from "../notes/noteService.js";
import { MODEL_TIMEOUT_MS } from "../models/openrouter.js";
import { buildWriterPrompt } from "./prompts.js";

export const MAX_SEARCHES = 4;
export const SEARCH_K = 5;
// The signal covers the whole writer run: up to MAX_SEARCHES tool loops plus the final structured step.
export const WRITER_TIMEOUT_MS = MODEL_TIMEOUT_MS * (MAX_SEARCHES + 2);
const WRITER_RECURSION_LIMIT = 12; // bounds tool spinning after the search cap

type InvokeOpts = { signal: AbortSignal; recursionLimit?: number };

// Every agent call goes through here: ChatOpenRouter has no timeout option, so the signal is the only time limit.
export function invokeWithTimeout<R>(
  agent: { invoke: (input: { messages: { role: string; content: string }[] }, opts: InvokeOpts) => Promise<R> },
  content: string, timeoutMs = MODEL_TIMEOUT_MS, recursionLimit?: number,
): Promise<R> {
  const opts: InvokeOpts = { signal: AbortSignal.timeout(timeoutMs) };
  if (recursionLimit) opts.recursionLimit = recursionLimit; // an explicit undefined would override LangGraph's default
  return agent.invoke({ messages: [{ role: "user", content }] }, opts);
}

export function makeSearchTool(opts: { search: (q: string, k: number) => Promise<RetrievedChunk[]>; onSearch: (query: string, hits: number) => void }) {
  let calls = 0;
  let error: unknown; // first search failure; the writer rethrows it (ToolNode would otherwise hide it from the run)
  const refOf = new Map<string, string>(); // noteId -> ref
  const seen = new Map<string, RetrievedChunk>(); // noteId+chunkIndex -> chunk
  const searchTool = tool(
    async ({ query }: { query: string }) => {
      if (calls >= MAX_SEARCHES) return "Search limit reached. Write the post now with the notes you have.";
      calls++;
      let hits: RetrievedChunk[];
      try { hits = await opts.search(query, SEARCH_K); } catch (e) { error ??= e; return "Note search failed."; }
      opts.onSearch(query, hits.length);
      if (hits.length === 0) return "No matching notes found.";
      return hits.map((h) => {
        if (!refOf.has(h.noteId)) refOf.set(h.noteId, `N${refOf.size + 1}`);
        seen.set(`${h.noteId}:${h.chunkIndex}`, h);
        return `[${refOf.get(h.noteId)}] ${h.title}: ${h.text}`;
      }).join("\n\n");
    },
    { name: "search_notes", description: "Search the user's notes for passages relevant to a query.", schema: z.object({ query: z.string() }) },
  ) as unknown as StructuredTool;
  return {
    tool: searchTool,
    error: () => error,
    retrieved: () => [...seen.values()],
    refs: () => Object.fromEntries([...refOf].map(([id, ref]) => [ref, id])) as Record<string, string>,
  };
}

export function resolveUsedRefs(usedRefs: string[], refs: Record<string, string>): string[] {
  const ids = usedRefs.map((r) => refs[r.trim().toUpperCase()]).filter((id): id is string => !!id);
  return [...new Set(ids)];
}

export type WriterFn = (input: {
  platform: Platform; ask: string; preferences: Preferences;
  revision?: { previousDraft: string; qaReview: QaReview; feedback?: string };
  onSearch: (q: string, hits: number) => void;
}) => Promise<{ post: string; usedNoteIds: string[]; retrievedNotes: RetrievedChunk[] }>;

type RunAgent = (args: { tool: StructuredTool; systemPrompt: string; ask: string }) => Promise<{ post: string; usedRefs: string[] }>;

const writerOutput = z.object({ post: z.string().min(1), usedRefs: z.array(z.string()) });

export function makeWriter(opts: { model: () => Promise<BaseChatModel>; search: NoteService["search"]; runAgent?: RunAgent }): WriterFn {
  const runAgent: RunAgent = opts.runAgent ?? (async ({ tool: t, systemPrompt, ask }) => {
    const agent = createAgent({ model: await opts.model(), tools: [t], systemPrompt, responseFormat: writerOutput });
    const result = await invokeWithTimeout(agent, ask, WRITER_TIMEOUT_MS, WRITER_RECURSION_LIMIT);
    if (!result.structuredResponse) throw new Error("Writer returned no structured response");
    return result.structuredResponse as z.infer<typeof writerOutput>;
  });
  return async ({ platform, ask, preferences, revision, onSearch }) => {
    const st = makeSearchTool({ search: opts.search, onSearch }); // fresh per run: cap and refs are never shared
    const { post, usedRefs } = await runAgent({ tool: st.tool, systemPrompt: buildWriterPrompt({ platform, preferences, revision }), ask });
    if (st.error()) throw st.error(); // retrieval failures fail the run (spec 5.8), never a post without notes
    return { post, usedNoteIds: resolveUsedRefs(usedRefs, st.refs()), retrievedNotes: st.retrieved() };
  };
}
