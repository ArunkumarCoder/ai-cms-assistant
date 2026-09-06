"use server";

import * as z from "zod";
import { createClient } from "next-sanity";
import { redirect } from "next/navigation";
import { apiVersion } from "@/sanity/apiVersion";
import { encryptSiteToken } from "@/lib/crypto/siteToken";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { SanityAdapter } from "./sanityAdapter";

export type ConnectSiteState = { error?: string } | undefined;

const ConnectSiteSchema = z.object({
  name: z.string().trim().min(1, { error: "Give this site a name." }),
  projectId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+$/i, {
      error: "That doesn't look like a Sanity project ID.",
    }),
  dataset: z.string().trim().min(1, { error: "Dataset is required." }),
  token: z.string().trim().min(1, { error: "An API token is required." }),
});

export async function connectSiteAction(
  _prevState: ConnectSiteState,
  formData: FormData,
): Promise<ConnectSiteState> {
  const user = await requireUser();

  const parsed = ConnectSiteSchema.safeParse({
    name: formData.get("name"),
    projectId: formData.get("projectId"),
    dataset: formData.get("dataset"),
    token: formData.get("token"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const { name, projectId, dataset, token } = parsed.data;

  // Validate before saving anything: construct a throwaway adapter against
  // exactly what the user typed and make one real call through it. A wrong
  // project ID, wrong dataset, or wrong/expired token all surface here as a
  // real Sanity API error, not as a save-then-fail-on-first-use surprise.
  const testClient = createClient({
    projectId,
    dataset,
    apiVersion,
    token,
    useCdn: false,
  });
  const testAdapter = new SanityAdapter(
    {
      id: "unsaved",
      userId: user.id,
      name,
      cms: "sanity",
      sanityProjectId: projectId,
      sanityDataset: dataset,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    testClient,
  );

  try {
    await testAdapter.getPages();
  } catch (err) {
    return {
      error:
        "Couldn't connect to that Sanity project — double-check the project ID, dataset, " +
        `and token. (${err instanceof Error ? err.message : "Unknown error"})`,
    };
  }

  await prisma.site.create({
    data: {
      userId: user.id,
      name,
      cms: "sanity",
      sanityProjectId: projectId,
      sanityDataset: dataset,
      sanityTokenCiphertext: encryptSiteToken(token),
    },
  });

  redirect("/pages");
}
