import Image from "next/image";
import { PortableText, type PortableTextComponents } from "next-sanity";
import { urlFor } from "@/sanity/image";
import type { PageBodyBlock, PageBodyImageBlock, PageBodyCtaBlock } from "@/sanity/types";

const IMAGE_WIDTH = 1200;

const components: PortableTextComponents = {
  block: {
    h2: ({ children }) => <h2 className="mt-8 mb-3 text-2xl font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mt-6 mb-2 text-xl font-semibold">{children}</h3>,
    h4: ({ children }) => <h4 className="mt-4 mb-2 text-lg font-semibold">{children}</h4>,
    blockquote: ({ children }) => (
      <blockquote className="my-4 border-l-4 border-zinc-300 pl-4 italic text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
        {children}
      </blockquote>
    ),
    normal: ({ children }) => <p className="mb-4 leading-relaxed">{children}</p>,
  },
  types: {
    imageBlock: ({ value }: { value: PageBodyImageBlock }) => {
      if (!value?.asset) return null;

      const dimensions = value.asset.metadata?.dimensions;
      const height = dimensions
        ? Math.round((IMAGE_WIDTH * dimensions.height) / dimensions.width)
        : Math.round(IMAGE_WIDTH / 1.5);

      return (
        <figure className="my-6">
          <Image
            src={urlFor(value).width(IMAGE_WIDTH).url()}
            alt={value.alt || ""}
            width={IMAGE_WIDTH}
            height={height}
            className="w-full rounded-lg"
            placeholder={value.asset.metadata?.lqip ? "blur" : "empty"}
            blurDataURL={value.asset.metadata?.lqip}
          />
          {value.caption && (
            <figcaption className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              {value.caption}
            </figcaption>
          )}
          {value.altTextStatus !== "reviewed" && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Alt text status: {value.altTextStatus}
            </p>
          )}
        </figure>
      );
    },
    ctaBlock: ({ value }: { value: PageBodyCtaBlock }) => (
      <a
        href={value.href}
        target={value.openInNewTab ? "_blank" : undefined}
        rel={value.openInNewTab ? "noopener noreferrer" : undefined}
        className="my-4 inline-flex items-center rounded-full bg-foreground px-5 py-3 font-medium text-background transition-colors hover:opacity-90"
      >
        {value.text}
      </a>
    ),
  },
};

export function PageBody({ value }: { value: PageBodyBlock[] }) {
  return <PortableText value={value} components={components} />;
}
