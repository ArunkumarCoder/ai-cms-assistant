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
  return (
    <div>
      {blocks
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((block) => (
          <ContentBlockView key={block.id} block={block} />
        ))}
    </div>
  );
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "heading": {
      const level = block.metadata?.level;
      if (level === 3) {
        return <h3 className="mt-6 mb-2 text-xl font-semibold">{block.content}</h3>;
      }
      if (level === 4) {
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
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
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
