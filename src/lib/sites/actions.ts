"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/db";
import { setActiveSiteCookie } from "./activeSite";

// Backs both the top bar's site switcher and the Sites screen's "Make
// active" button — same action, two different `redirectTo` targets, so
// switching sites re-renders wherever the user already was instead of always
// bouncing to one fixed page.
export async function setActiveSiteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const siteId = formData.get("siteId");
  const redirectTo = formData.get("redirectTo");

  if (typeof siteId === "string") {
    const site = await prisma.site.findFirst({
      where: { id: siteId, userId: user.id },
    });
    if (site) {
      await setActiveSiteCookie(site.id);
    }
  }

  redirect(
    typeof redirectTo === "string" && redirectTo ? redirectTo : "/pages",
  );
}

// The only place a brand voice can be set for a Site that's already
// connected — /sites/connect only sets it at creation time. Scoped to
// `userId` in the same findFirst-then-update shape as setActiveSiteAction
// above, so one account can never edit another's Site by guessing an id.
export async function updateSiteBrandVoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const siteId = formData.get("siteId");
  const brandVoice = formData.get("brandVoice");

  if (typeof siteId === "string") {
    const site = await prisma.site.findFirst({
      where: { id: siteId, userId: user.id },
    });
    if (site) {
      const trimmed = typeof brandVoice === "string" ? brandVoice.trim() : "";
      await prisma.site.update({
        where: { id: site.id },
        data: { brandVoice: trimmed || null },
      });
    }
  }

  revalidatePath("/sites");
}
