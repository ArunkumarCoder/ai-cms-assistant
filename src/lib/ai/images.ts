export interface FetchedImage {
  base64: string;
  mediaType: string;
}

// Anthropic's vision API wants inline base64 image bytes, not a URL (unlike
// OpenAI's `image_url`, which accepts a URL directly — see
// providers/openaiProvider.ts). This is the one place that difference is
// bridged, so AnthropicProvider itself stays a thin translation of
// AiProvider, not a place that also knows how to fetch images.
export async function fetchImageAsBase64(url: string): Promise<FetchedImage> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image "${url}": ${response.status} ${response.statusText}`,
    );
  }
  const mediaType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());
  return { base64: buffer.toString("base64"), mediaType };
}
