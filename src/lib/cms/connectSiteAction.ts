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
import { FetchWordPressApiClient, WordPressAdapter, WordPressApiError } from "./wordpressAdapter";

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
    return { error: await diagnoseWordPressFailure(normalizedUrl, username, applicationPassword, err) };
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

// Turns "the test call to /ai-cms-pages failed" into a specific, actionable
// reason by re-probing the connection in stages, cheapest/most-likely-cause
// first — only ever runs on the failure path, so a working connection pays
// no extra latency for this. Three outcomes a user actually needs to tell
// apart, each with a different fix:
//   1. Not a reachable WordPress REST API at all (wrong URL, REST API
//      disabled by a security plugin, site is down).
//   2. Reachable, but these credentials don't authenticate (wrong username,
//      mistyped application password, or — the one real gotcha this
//      project's own staging setup hit, SPEC.md §22 — Application Passwords
//      silently disabled because the site isn't served over HTTPS).
//   3. Reachable and authenticated, but the companion plugin isn't
//      installed, so the custom `ai-cms-pages` endpoint this adapter needs
//      doesn't exist yet.
async function diagnoseWordPressFailure(
  url: string,
  username: string,
  applicationPassword: string,
  originalError: unknown,
): Promise<string> {
  // A network-level failure (DNS, connection refused, TLS) already produces
  // a specific, actionable WordPressApiError message — no need to re-probe.
  if (originalError instanceof WordPressApiError && originalError.status === undefined) {
    return originalError.message;
  }

  let discovery: Response;
  try {
    discovery = await fetch(`${url}/wp-json/`, { cache: "no-store" });
  } catch (err) {
    return (
      `Couldn't reach "${url}" at all — double-check the URL is correct and publicly reachable. ` +
      `(${err instanceof Error ? err.message : "unknown network error"})`
    );
  }
  if (!discovery.ok) {
    return (
      `"${url}" doesn't look like a reachable WordPress REST API (got ${discovery.status} from ` +
      "/wp-json/) — double-check the URL, or whether a security plugin is blocking the REST API."
    );
  }

  const credentials = Buffer.from(`${username}:${applicationPassword}`).toString("base64");
  let authCheck: Response;
  try {
    authCheck = await fetch(`${url}/wp-json/wp/v2/users/me`, {
      headers: { Authorization: `Basic ${credentials}` },
      cache: "no-store",
    });
  } catch (err) {
    return (
      `Reached "${url}", but couldn't verify credentials — try again, or check for a network or ` +
      `proxy issue. (${err instanceof Error ? err.message : "unknown network error"})`
    );
  }
  if (authCheck.status === 401 || authCheck.status === 403) {
    return (
      "WordPress didn't accept that username/application password combination — double-check " +
      "both. If this site isn't served over HTTPS, also confirm Application Passwords are " +
      'actually enabled: WordPress disables them over plain HTTP unless WP_ENVIRONMENT_TYPE is ' +
      'set to "local" in wp-config.php.'
    );
  }
  if (!authCheck.ok) {
    return (
      `WordPress rejected the credential check (${authCheck.status}) — double-check the username ` +
      "and application password."
    );
  }

  return (
    "Connected and authenticated, but this WordPress site doesn't have the required companion " +
    'plugin installed (the "ai-cms-pages" endpoint doesn\'t exist yet) — see the README\'s ' +
    '"Connecting WordPress" section for how to install wordpress/mu-plugins/ai-cms-assistant-fields.php.'
  );
}
