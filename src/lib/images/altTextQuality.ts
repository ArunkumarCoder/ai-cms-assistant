import type { AltTextStatus } from "@/types";

export interface AltTextAssessment {
  flagged: boolean;
  reason: string | null;
}

// Words that show up as alt text far too often to mean anything — either a
// CMS/upload-tool default nobody replaced, or someone typing the first word
// that came to mind just to get past a required field.
const GENERIC_ALT_TEXT: ReadonlySet<string> = new Set([
  "image",
  "photo",
  "picture",
  "img",
  "graphic",
  "untitled",
  "screenshot",
  "placeholder",
  "placeholder image",
  "photo of",
  "picture of",
  "image of",
]);

const MIN_MEANINGFUL_LENGTH = 5;

function normalize(text: string): string {
  return text.trim().toLowerCase();
}

// Best-effort filename from a CDN URL, extension and query string stripped,
// separators normalized — good enough to catch "alt text is literally the
// filename," not meant to be a general-purpose URL parser.
function filenameStem(url: string): string {
  const last = url.split("/").pop() ?? "";
  const withoutQuery = last.split(/[?#]/)[0];
  const withoutExtension = withoutQuery.replace(/\.[a-z0-9]+$/i, "");
  return normalize(withoutExtension).replace(/[-_\s]+/g, " ").trim();
}

// Content-based, deliberately independent of `altTextStatus` beyond the
// "missing" case: an image marked "ai-generated" or even "reviewed" can still
// carry weak text (e.g. someone typed "image" and moved on), and this is the
// signal that actually tells a reader whether the text is worth anything —
// SPEC.md §12 has the full reasoning for treating these as separate checks.
export function assessAltText(
  image: { altText: string | null; altTextStatus: AltTextStatus; url: string },
): AltTextAssessment {
  if (image.altTextStatus === "missing" || !image.altText || !image.altText.trim()) {
    return { flagged: true, reason: "Missing alt text." };
  }

  const trimmed = image.altText.trim();
  const normalized = normalize(trimmed);

  if (trimmed.length < MIN_MEANINGFUL_LENGTH) {
    return {
      flagged: true,
      reason: `Alt text is very short ("${trimmed}") — probably not descriptive enough.`,
    };
  }

  if (GENERIC_ALT_TEXT.has(normalized)) {
    return {
      flagged: true,
      reason: `Alt text is just a generic word ("${trimmed}") instead of describing the image.`,
    };
  }

  const filename = filenameStem(image.url);
  if (filename && filename.length >= MIN_MEANINGFUL_LENGTH && normalized === filename) {
    return {
      flagged: true,
      reason: `Alt text just repeats the filename ("${trimmed}").`,
    };
  }

  return { flagged: false, reason: null };
}
