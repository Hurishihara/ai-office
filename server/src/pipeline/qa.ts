import { createAgent } from "langchain";
import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Platform, Preferences, QaReview, RetrievedChunk } from "@ai-office/shared";
import { buildQaPrompt } from "./prompts.js";
import { lengthIssue } from "./platform.js";
import { invokeWithTimeout } from "./writer.js";

export type QaFn = (input: { platform: Platform; preferences: Preferences; draft: string; usedNotes: RetrievedChunk[] }) => Promise<QaReview>;

const qaOutput = z.object({ verdict: z.enum(["pass", "needs_revision"]), issues: z.array(z.string()), suggestions: z.array(z.string()) });

export function applyLengthCheck(review: QaReview, platform: Platform, draft: string): QaReview {
  const issue = lengthIssue(platform, draft);
  return issue ? { ...review, verdict: "needs_revision", issues: [issue, ...review.issues] } : review;
}

export function makeQa(opts: { model: () => Promise<BaseChatModel> }): QaFn {
  return async ({ platform, preferences, draft, usedNotes }) => {
    const agent = createAgent({ model: await opts.model(), tools: [], systemPrompt: buildQaPrompt({ platform, preferences, draft, usedNotes }), responseFormat: qaOutput });
    const result = await invokeWithTimeout(agent, "Review the draft.");
    if (!result.structuredResponse) throw new Error("QA returned no structured response");
    return applyLengthCheck(result.structuredResponse as QaReview, platform, draft);
  };
}
