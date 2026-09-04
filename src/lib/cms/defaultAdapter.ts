import type { Site } from "@/types";
import { dataset, projectId } from "@/sanity/client";
import { SanityAdapter } from "./sanityAdapter";

// Stand-in until real Site management exists (no app datastore yet — see the
// design-decision comments in sanityAdapter.ts). This app currently only
// ever points at the one Sanity project/dataset from env, so there is only
// ever one Site to construct an adapter for.
const defaultSite: Site = {
  id: "default",
  name: "AI CMS Assistant (default site)",
  cms: "sanity",
  sanityProjectId: projectId,
  sanityDataset: dataset,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

export const defaultSanityAdapter = new SanityAdapter(defaultSite);
