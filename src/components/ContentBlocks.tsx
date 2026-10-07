import Image from "next/image";
import type { ContentBlock } from "@/types";

const IMAGE_WIDTH = 1200;

// Renders the CmsAdapter's generic `ContentBlock[]`, not Sanity's Portable
// Text — this is deliberately CMS-agnostic (WordPress's future adapter would
// feed the same shape into the same component). The tradeoff: `content` is a
// single plain-text string (see sanityAdapter.ts's translation notes), so
// inline formatting/links within a paragraph — which the old PortableText
// renderer supported via Sanity's native marks — can't be rendered here.
export function ContentBlocks({ blocks }: { blocks: ContentBlock[] }) {
  const sorted = blocks.slice().sort((a, b) => a.order - b.order);
  const levelById = normalizeHeadingLevels(sorted);
  return (
    <div>
      {sorted.map((block) => (
        <ContentBlockView key={block.id} block={block} headingLevel={levelById.get(block.id)} />
      ))}
    </div>
  );
}

// `metadata.level` (2/3/4, see pageDraft.ts's schema) is whatever an AI
// generation or hand-edit set per block independently — nothing upstream
// stops two adjacent heading blocks from jumping straight from an h2 to an
// h4, a real WCAG 1.3.1/2.4.6 heading-order violation if rendered literally.
// This clamps the *rendered* tag to never jump more than one level deeper
// than the previous heading actually rendered, without touching the stored
// data — an author's heading levels are still whatever they chose; only the
// semantic tag emitted here is corrected. Starts at a baseline of "the
// surrounding page already has at least an h3" (true on this page's own
// `/pages/[slug]` route, whose SeoPanel section renders h2/h3 before this
// component), so a page's very first content heading can be h2, h3, or h4
// without being treated as a skip relative to chrome that isn't visible to
// this component.
function normalizeHeadingLevels(blocks: ContentBlock[]): Map<string, 2 | 3 | 4> {
  const levelById = new Map<string, 2 | 3 | 4>();
  let previousLevel = 3;
  for (const block of blocks) {
    if (block.type !== "heading") continue;
    const requested = block.metadata?.level;
    const normalized = requested === 3 || requested === 4 ? requested : 2;
    const clamped = Math.min(normalized, previousLevel + 1) as 2 | 3 | 4;
    levelById.set(block.id, clamped);
    previousLevel = clamped;
  }
  return levelById;
}

function ContentBlockView({
  block,
  headingLevel,
}: {
  block: ContentBlock;
  headingLevel?: 2 | 3 | 4;
}) {
  switch (block.type) {
    case "heading": {
      if (headingLevel === 3) {
        return <h3 className="mt-6 mb-2 text-xl font-semibold">{block.content}</h3>;
      }
      if (headingLevel === 4) {
        return <h4 className="mt-4 mb-2 text-lg font-semibold">{block.content}</h4>;
      }
      return <h2 className="mt-8 mb-3 text-2xl font-semibold">{block.content}</h2>;
    }
    case "paragraph": {
      if (block.metadata?.style === "blockquote") {
        return (
          <blockquote className="my-4 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {block.content}
          </blockquote>
        );
      }
      return <p className="mb-4 leading-relaxed">{block.content}</p>;
    }
    case "cta": {
      const href = typeof block.metadata?.href === "string" ? block.metadata.href : "#";
      const openInNewTab = block.metadata?.openInNewTab === true;
      return (
        <a
          href={href}
          target={openInNewTab ? "_blank" : undefined}
          rel={openInNewTab ? "noopener noreferrer" : undefined}
          className="my-4 inline-flex items-center rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:opacity-90"
        >
          {block.content}
        </a>
      );
    }
    case "image": {
      const url = block.metadata?.url;
      if (typeof url !== "string") return null;

      const dimensions = block.metadata?.dimensions as
        | { width: number; height: number }
        | undefined;
      const height = dimensions
        ? Math.round((IMAGE_WIDTH * dimensions.height) / dimensions.width)
        : Math.round(IMAGE_WIDTH / 1.5);
      const altTextStatus = block.metadata?.altTextStatus;
      const caption = block.metadata?.caption;
      const lqip = block.metadata?.lqip;

      return (
        <figure className="my-6">
          <Image
            src={url}
            alt={block.content || ""}
            width={IMAGE_WIDTH}
            height={height}
            className="w-full rounded-lg"
            placeholder={typeof lqip === "string" ? "blur" : "empty"}
            blurDataURL={typeof lqip === "string" ? lqip : undefined}
          />
          {typeof caption === "string" && caption && (
            <figcaption className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {caption}
            </figcaption>
          )}
          {altTextStatus !== "reviewed" && (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Alt text status: {String(altTextStatus)}
            </p>
          )}
        </figure>
      );
    }
    case "faq-schema":
      // No Sanity content of this type exists to translate from (SPEC.md
      // §4) — FAQ schema is generated at render time from faqItems.
      return null;
    default:
      return null;
  }
}
