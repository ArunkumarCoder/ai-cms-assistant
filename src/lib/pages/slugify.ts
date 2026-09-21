const FALLBACK_SLUG = "page";

// SanityAdapter's assertValidSlug (src/lib/cms/sanityAdapter.ts) requires
// lowercase alphanumeric, hyphen-separated — the AI's own `slug` suggestion
// (pageDraftSchema.slug) is an unconstrained string, so anything it returns
// has to pass through here before it ever reaches createPage/updatePage.
// Sanitizes silently rather than validating-and-rejecting, matching this
// project's low-friction-demo posture elsewhere (e.g. Sanity's own
// `options: {source: 'title'}` slugifies rather than erroring).
export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || FALLBACK_SLUG;
}
