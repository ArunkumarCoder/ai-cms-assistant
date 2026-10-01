"use server";

import * as z from "zod";
import { createClient } from "next-sanity";
import { redirect } from "next/navigation";
import { apiVersion } from "@/sanity/apiVersion";
import { encryptSiteToken } from "@/lib/crypto/siteToken";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { setActiveSiteCookie } from "@/lib/sites/activeSite";
import { SanityAdapter } from "./sanityAdapter";
import { FetchWordPressApiClient, WordPressAdapter } from "./wordpressAdapter";

export type ConnectSiteState = { error?: string } | undefined;

const SanitySchema = z.object({
  cms: z.literal("sanity"),
  name: z.string().trim().min(1, { error: "Give this site a name." }),
  projectId: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+$/i, {
      error: "That doesn't look like a Sanity project ID.",
    }),
  dataset: z.string().trim().min(1, { error: "Dataset is required." }),
  token: z.string().trim().min(1, { error: "An API token is required." }),
  brandVoice: z.string().trim().optional(),
});

const WordPressSchema = z.object({
  cms: z.literal("wordpress"),
  name: z.string().trim().min(1, { error: "Give this site a name." }),
  url: z
    .url({ error: "Enter the site's full URL, e.g. https://example.com." })
    .trim(),
  username: z.string().trim().min(1, { error: "WordPress username is required." }),
  applicationPassword: z
    .string()
    .trim()
    .min(1, { error: "An application password is required." }),
  brandVoice: z.string().trim().optional(),
});

// A discriminated union keyed on the same "cms" value the connect form
// submits (a radio input, ConnectSiteForm.tsx) — each branch validates only
// the fields that CMS actually needs, rather than one schema with every
// field optional and cross-field rules bolted on.
const ConnectSiteSchema = z.discriminatedUnion("cms", [SanitySchema, WordPressSchema]);

export async function connectSiteAction(
  _prevState: ConnectSiteState,
  formData: FormData,
): Promise<ConnectSiteState> {
  const user = await requireUser();

  const parsed = ConnectSiteSchema.safeParse({
    cms: formData.get("cms"),
    name: formData.get("name"),
    projectId: formData.get("projectId"),
    dataset: formData.get("dataset"),
    token: formData.get("token"),
    url: formData.get("url"),
    username: formData.get("username"),
    applicationPassword: formData.get("applicationPassword"),
    brandVoice: formData.get("brandVoice") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  if (parsed.data.cms === "sanity") {
    return connectSanitySite(user.id, parsed.data);
  }
  return connectWordPressSite(user.id, parsed.data);
}

async function connectSanitySite(
  userId: string,
  data: z.infer<typeof SanitySchema>,
): Promise<ConnectSiteState> {
  const { name, projectId, dataset, token, brandVoice } = data;

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
      userId,
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

  const created = await prisma.site.create({
    data: {
      userId,
      name,
      cms: "sanity",
      sanityProjectId: projectId,
      sanityDataset: dataset,
      sanityTokenCiphertext: encryptSiteToken(token),
      brandVoice: brandVoice || null,
    },
  });

  await activateAndRedirect(created.id);
}

async function connectWordPressSite(
  userId: string,
  data: z.infer<typeof WordPressSchema>,
): Promise<ConnectSiteState> {
  const { name, url, username, applicationPassword, brandVoice } = data;
  // Strip a trailing slash so every stored URL is in the same shape
  // FetchWordPressApiClient's URL-joining logic (wordpressAdapter.ts) expects.
  const normalizedUrl = url.replace(/\/+$/, "");

  const testAdapter = new WordPressAdapter(
    {
      id: "unsaved",
      userId,
      name,
      cms: "wordpress",
      wordpressUrl: normalizedUrl,
      wordpressUsername: username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    new FetchWordPressApiClient(normalizedUrl, username, applicationPassword),
  );

  try {
    await testAdapter.getPages();
  } catch (err) {
    return {
      error:
        "Couldn't connect to that WordPress site — double-check the site URL, username, " +
        `and application password. (${err instanceof Error ? err.message : "Unknown error"})`,
    };
  }

  const created = await prisma.site.create({
    data: {
      userId,
      name,
      cms: "wordpress",
      wordpressUrl: normalizedUrl,
      wordpressUsername: username,
      wordpressAppPasswordCiphertext: encryptSiteToken(applicationPassword),
      brandVoice: brandVoice || null,
    },
  });

  await activateAndRedirect(created.id);
}

// A user who just connected a site almost certainly wants to see it, not
// whichever Site was active before (or the oldest one, if this is their
// first) — so make it active immediately rather than leaving that to a
// separate "Make active" click.
async function activateAndRedirect(siteId: string): Promise<never> {
  await setActiveSiteCookie(siteId);
  redirect("/pages");
}
