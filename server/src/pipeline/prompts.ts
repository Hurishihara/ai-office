import { PLATFORM_LABELS, PLATFORM_LIMITS, type Platform, type Preferences, type QaReview, type RetrievedChunk } from "@ai-office/shared";
import { PLATFORM_STYLE } from "./platform.js";

function prefLines(p: Preferences): string {
  return [
    p.tone && `Tone: ${p.tone}`,
    p.audience && `Audience: ${p.audience}`,
    p.emoji && `Emoji: ${p.emoji}`,
    p.hashtags && `Hashtags: ${p.hashtags}`,
    p.extra && `Extra instructions: ${p.extra}`,
  ].filter(Boolean).join("\n");
}

function platformLines(platform: Platform): string {
  return `Platform: ${PLATFORM_LABELS[platform]}\nHard limit: ${PLATFORM_LIMITS[platform]} characters.\nStyle: ${PLATFORM_STYLE[platform]}`;
}

export function buildWriterPrompt(p: {
  platform: Platform; preferences: Preferences;
  revision?: { previousDraft: string; qaReview: QaReview; feedback?: string };
}): string {
  const parts = [
    "You write social media posts from the user's own notes.",
    platformLines(p.platform),
    `Writing preferences:\n${prefLines(p.preferences)}`,
    "Call search_notes before writing, and search again if you need more. Use only facts found in the notes.",
    "Your final answer is { post, usedRefs }. In usedRefs, list only the refs (N1, N2, ... as shown in the search results) of notes the post relies on.",
  ];
  if (p.revision) {
    const { previousDraft, qaReview, feedback } = p.revision;
    parts.push(
      `This is a revision.\nPrevious draft:\n${previousDraft}`,
      `QA issues:\n${qaReview.issues.map((i) => `- ${i}`).join("\n") || "- none"}`,
      `QA suggestions:\n${qaReview.suggestions.map((i) => `- ${i}`).join("\n") || "- none"}`,
      ...(feedback ? [`User feedback:\n${feedback}`] : []),
    );
  }
  return parts.join("\n\n");
}

export function buildQaPrompt(p: { platform: Platform; preferences: Preferences; draft: string; usedNotes: RetrievedChunk[] }): string {
  const notes = p.usedNotes.map((n) => `${n.title}: ${n.text}`).join("\n---\n") || "(none)";
  return [
    "You review a draft social media post. Check three things: it follows the writing preferences, it fits the platform, and every claim is supported by the notes below (and only those notes).",
    platformLines(p.platform),
    `Writing preferences:\n${prefLines(p.preferences)}`,
    `Notes the writer used:\n${notes}`,
    `Draft:\n${p.draft}`,
    'Answer with a verdict ("pass" or "needs_revision"), a list of issues, and a list of suggestions.',
  ].join("\n\n");
}
