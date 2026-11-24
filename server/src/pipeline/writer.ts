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

// Every agent call goes through here: ChatOpenRouter has no timeout option, so the signal is the only time limit.
export function invokeWithTimeout<R>(agent: { invoke: (input: { messages: { role: string; content: string }[] }, opts: { signal: AbortSignal }) => Promise<R> }, content: string): Promise<R> {
  return agent.invoke({ messages: [{ role: "user", content }] }, { signal: AbortSignal.timeout(MODEL_TIMEOUT_MS) });
}

export function makeSearchTool(opts: { search: (q: string, k: number) => Promise<RetrievedChunk[]>; onSearch: (query: string, hits: number) => void }) {
  let calls = 0;
  const refOf = new Map<string, string>(); // noteId -> ref
  const seen = new Map<string, RetrievedChunk>(); // noteId+chunkIndex -> chunk
  const searchTool = tool(
    async ({ query }: { query: string }) => {
      if (calls >= MAX_SEARCHES) return "Search limit reached. Write the post now with the notes you have.";
      calls++;
      const hits = await opts.search(query, SEARCH_K);
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

const writerOutput = z.object({ post: z.string(), usedRefs: z.array(z.string()) });

export function makeWriter(opts: { model: () => Promise<BaseChatModel>; search: NoteService["search"]; runAgent?: RunAgent }): WriterFn {
  const runAgent: RunAgent = opts.runAgent ?? (async ({ tool: t, systemPrompt, ask }) => {
    const agent = createAgent({ model: await opts.model(), tools: [t], systemPrompt, responseFormat: writerOutput });
    return (await invokeWithTimeout(agent, ask)).structuredResponse as z.infer<typeof writerOutput>;
  });
  return async ({ platform, ask, preferences, revision, onSearch }) => {
    const st = makeSearchTool({ search: opts.search, onSearch }); // fresh per run: cap and refs are never shared
    const { post, usedRefs } = await runAgent({ tool: st.tool, systemPrompt: buildWriterPrompt({ platform, preferences, revision }), ask });
    return { post, usedNoteIds: resolveUsedRefs(usedRefs, st.refs()), retrievedNotes: st.retrieved() };
  };
}
