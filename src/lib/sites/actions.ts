"use server";

import { redirect } from "next/navigation";
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
