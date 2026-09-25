// Pure prompt-building, deliberately kept out of the "use server" action file
// (generateAltTextAction.ts) so it's unit-testable with no aiClient mock at
// all — same split src/lib/pages/prompt.ts already established.

export interface AltTextPromptContext {
  // Title of the page this image is used on, if the caller could resolve one
  // (Media Library already does this join — see src/app/(app)/media/page.tsx)
  // — helps disambiguate purpose (a hero banner vs. a diagram inside a blog
  // post) for a model that can otherwise only see the pixels themselves.
  pageTitle?: string;
}

export function buildAltTextPrompt(context: AltTextPromptContext = {}): string {
  return [
    "Write concise, accurate alt text for this image, suitable for screen readers and image search.",
    context.pageTitle ? `The image is used on a page titled "${context.pageTitle}".` : null,
    "Describe what's actually visible in the image in one specific sentence. Don't start with " +
      '"image of" or "picture of", and don\'t invent details you can\'t actually see.',
    "Also return a confidence level (high, medium, or low) for your own answer, and whether a " +
      "human should double-check it before trusting it (needsReview) — for example because the " +
      "image is ambiguous, text-heavy, or could be read multiple ways.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
