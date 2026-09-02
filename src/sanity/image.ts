import createImageUrlBuilder, { type SanityImageSource } from "@sanity/image-url";
import { dataset, projectId } from "./client";

const builder = createImageUrlBuilder({ projectId: projectId!, dataset: dataset! });

export function urlFor(source: SanityImageSource) {
  return builder.image(source);
}
