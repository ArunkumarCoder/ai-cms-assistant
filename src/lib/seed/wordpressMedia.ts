// Uploading a brand-new media attachment is the one write this seed script
// makes that doesn't go through CmsAdapter — the interface has no such
// method (every `createPage`/`updatePage` image block already requires an
// *existing* WordPress attachment id to reference, by design — see
// wordpressAdapter.ts's own `resolveImageSrc`), so there's nothing on the
// adapter to call here, any more than there would be for a human uploading
// a photo through wp-admin's Media Library before referencing it in a post.
// Every other write this script makes (pages, FAQs, alt text, status) goes
// through the real CmsAdapter, same as the rest of the app.
//
// Idempotent by title: a demo image is given a fixed, recognizable title
// ("Demo: Roast Bag Hero"), and this searches for that exact title before
// ever uploading — re-running the seed reuses the same attachment id rather
// than uploading a duplicate file every time.
export interface WordPressMediaFetcher {
  (url: string, init?: RequestInit): Promise<Response>;
}

export interface FindOrUploadMediaOptions {
  baseUrl: string;
  authHeader: string;
  title: string;
  filename: string;
  pngBuffer: Buffer;
  fetchImpl?: WordPressMediaFetcher;
}

interface WpMediaSearchResult {
  id: number;
}

// Returns the attachment id (as a string, matching `ImageAsset.cmsAssetId`'s
// own convention elsewhere in this codebase) of either the pre-existing or
// newly-uploaded attachment.
export async function findOrUploadDemoMedia(
  options: FindOrUploadMediaOptions,
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = { Authorization: options.authHeader };

  const searchUrl = new URL("/wp-json/wp/v2/media", options.baseUrl);
  searchUrl.searchParams.set("search", options.title);
  searchUrl.searchParams.set("media_type", "image");
  const searchResponse = await fetchImpl(searchUrl.toString(), { headers });
  if (!searchResponse.ok) {
    throw new Error(
      `Searching WordPress media for "${options.title}" failed: ${searchResponse.status}`,
    );
  }
  const existing = (await searchResponse.json()) as WpMediaSearchResult[];
  const exactMatch = existing[0];
  if (exactMatch) return String(exactMatch.id);

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(options.pngBuffer)], { type: "image/png" }),
    options.filename,
  );
  form.append("title", options.title);
  form.append("alt_text", ""); // Real alt text is set per-usage later via adapter.updateImage, same as the live app's own flow.

  const uploadUrl = new URL("/wp-json/wp/v2/media", options.baseUrl);
  const uploadResponse = await fetchImpl(uploadUrl.toString(), {
    method: "POST",
    headers,
    body: form,
  });
  if (!uploadResponse.ok) {
    throw new Error(
      `Uploading WordPress media "${options.title}" failed: ${uploadResponse.status}`,
    );
  }
  const uploaded = (await uploadResponse.json()) as WpMediaSearchResult;
  return String(uploaded.id);
}

// `ImageAsset.usedOnPageIds` (wordpressAdapter.ts's `toImageAsset`) reads an
// attachment's upload-time parent post, not a scan of which post's content
// actually references it — accurate for the normal "Add Media" flow inside
// a post editor, but this script uploads every image through a raw REST
// call with no parent at all, so without this every image reads as "used on
// an unknown page" regardless of which page's content block actually
// embeds it. Called once the referencing page has a real id, setting that
// attachment's parent after the fact gets the same real field populated.
// A shared attachment (the same image used on two pages) can still only
// have one parent — whichever page sets it last "wins," a known, minor
// limitation for the one demo image reused across two pages, not something
// this one-parent-per-attachment field can represent either way.
export async function attachMediaToPost(
  baseUrl: string,
  authHeader: string,
  mediaId: string,
  postId: string,
  fetchImpl: WordPressMediaFetcher = fetch,
): Promise<void> {
  const url = new URL(`/wp-json/wp/v2/media/${mediaId}`, baseUrl);
  const response = await fetchImpl(url.toString(), {
    method: "POST",
    headers: { Authorization: authHeader, "Content-Type": "application/json" },
    body: JSON.stringify({ post: Number(postId) }),
  });
  if (!response.ok) {
    throw new Error(
      `Setting parent post for media #${mediaId} failed: ${response.status}`,
    );
  }
}
