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
    "faqCount": count(faqItems),
    _createdAt,
    _updatedAt
  }
`);

export const PAGE_BY_SLUG_QUERY = defineQuery(`
  *[_type == "page" && slug.current == $slug][0]{
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
  }
`);
