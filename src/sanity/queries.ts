import { defineQuery } from "next-sanity";

export const PAGES_LIST_QUERY = defineQuery(`
  *[_type == "page" && defined(slug.current)] | order(_createdAt desc) {
    _id,
    title,
    "slug": slug.current,
    pageType,
    status,
    targetKeyword,
    qualityScore,
    "metaDescription": seo.metaDescription,
    "faqCount": count(faqItems),
    _createdAt,
    _updatedAt
  }
`);

// Shared projection so the by-slug and by-id lookups (adapter's `getPage` and
// its internal re-fetch-after-write helper) always return the same shape.
const PAGE_DETAIL_PROJECTION = `{
  _id,
  title,
  "slug": slug.current,
  pageType,
  status,
  targetKeyword,
  qualityScore,
  seo,
  faqItems[]{
    _key,
    question,
    answer,
    source
  },
  body[]{
    ...,
    _type == "imageBlock" => {
      ...,
      asset->{
        _id,
        url,
        metadata { lqip, dimensions { width, height } }
      }
    }
  },
  _createdAt,
  _updatedAt
}`;

export const PAGE_BY_SLUG_QUERY = defineQuery(`
  *[_type == "page" && slug.current == $slug][0]${PAGE_DETAIL_PROJECTION}
`);

export const PAGE_BY_ID_QUERY = defineQuery(`
  *[_type == "page" && _id == $id][0]${PAGE_DETAIL_PROJECTION}
`);

// Every imageBlock across every page's body, flattened in JS by the adapter
// (GROQ can't easily produce a flat cross-document array with each item's
// parent page id attached, so this returns one row per page and the adapter
// flattens). Used by `listImages`; images have no standalone document type
// (SPEC.md §4), so this is the only way to enumerate them.
export const PAGES_WITH_IMAGE_BLOCKS_QUERY = defineQuery(`
  *[_type == "page" && count(body[_type == "imageBlock"]) > 0]{
    _id,
    _createdAt,
    _updatedAt,
    "images": body[_type == "imageBlock"]{
      _key,
      alt,
      altTextStatus,
      asset->{ _id, url }
    }
  }
`);

// Locates the single page whose body contains an imageBlock with this _key,
// for `updateImage` (images are addressed by imageBlock _key, not a
// standalone asset id — see sanityAdapter.ts's translation notes).
export const PAGE_CONTAINING_IMAGE_KEY_QUERY = defineQuery(`
  *[_type == "page" && count(body[_key == $key && _type == "imageBlock"]) > 0][0]{
    _id
  }
`);
