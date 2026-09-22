import type { ContentBlock } from "@/types";

export interface HeadingBlock {
  level: 1 | 2 | 3 | 4;
  text: string;
}

// ContentBlocks.tsx defaults an unset/unrecognized `metadata.level` to h2
// when rendering — mirrored here so the hierarchy check sees exactly what a
// reader would.
function normalizeHeadingLevel(raw: unknown): 1 | 2 | 3 | 4 {
  return raw === 1 || raw === 2 || raw === 3 || raw === 4 ? raw : 2;
}

export function extractHeadingBlocks(contentBlocks: ContentBlock[]): HeadingBlock[] {
  return contentBlocks
    .filter((block) => block.type === "heading")
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block) => ({
      level: normalizeHeadingLevel(block.metadata?.level),
      text: block.content,
    }));
}

export function extractParagraphText(contentBlocks: ContentBlock[]): string {
  return contentBlocks
    .filter((block) => block.type === "paragraph")
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((block) => block.content)
    .join(" ");
}

export function extractWords(text: string): string[] {
  return text.match(/[A-Za-z']+/g) ?? [];
}

export function countSentences(text: string): number {
  return text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean).length;
}

// Approximate, dictionary-free syllable count: strips a trailing silent
// e/es/ed, then counts vowel-group clusters. This is the same heuristic
// widely used by JS readability libraries (e.g. the `syllable` package) —
// it isn't perfectly accurate for every word, but it's deterministic,
// dependency-free, and good enough for a reading-ease estimate.
export function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length === 0) return 0;
  if (word.length <= 3) return 1;

  const stripped = word
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");

  const vowelGroups = stripped.match(/[aeiouy]{1,2}/g);
  return vowelGroups ? Math.max(vowelGroups.length, 1) : 1;
}

// Flesch Reading Ease: 206.835 - 1.015*(words/sentences) - 84.6*(syllables/words).
// Returns null when there's no analyzable text (no words or no sentences),
// since the formula is undefined at that point rather than meaningfully zero.
export function fleschReadingEase(text: string): number | null {
  const words = extractWords(text);
  const sentenceCount = countSentences(text);
  if (words.length === 0 || sentenceCount === 0) return null;

  const syllableCount = words.reduce((sum, word) => sum + countSyllables(word), 0);
  const wordsPerSentence = words.length / sentenceCount;
  const syllablesPerWord = syllableCount / words.length;

  const score = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  return Math.round(score * 10) / 10;
}

export function fleschEaseLabel(score: number): string {
  if (score >= 90) return "very easy";
  if (score >= 80) return "easy";
  if (score >= 70) return "fairly easy";
  if (score >= 60) return "standard";
  if (score >= 50) return "fairly difficult";
  if (score >= 30) return "difficult";
  return "very difficult";
}
