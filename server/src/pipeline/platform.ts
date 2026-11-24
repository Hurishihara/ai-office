import { PLATFORM_LABELS, PLATFORM_LIMITS, countChars, type Platform } from "@ai-office/shared";

export const PLATFORM_STYLE: Record<Platform, string> = {
  x: "Punchy, one idea, no filler.",
  linkedin: "Short paragraphs, a clear opening line, professional but human.",
  instagram: "A caption that reads well on its own, with hashtags at the end.",
};

export function lengthIssue(platform: Platform, text: string): string | null {
  const n = countChars(text);
  const limit = PLATFORM_LIMITS[platform];
  return n <= limit ? null : `Too long for ${PLATFORM_LABELS[platform]}: ${n}/${limit} characters`;
}
