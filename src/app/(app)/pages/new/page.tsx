import { redirect } from "next/navigation";
import { getAdapterForCurrentUser, NoSiteConnectedError } from "@/lib/cms";
import { GeneratePageForm } from "@/components/GeneratePageForm";

export const metadata = { title: "New page" };

export default async function NewPagePage() {
  try {
    await getAdapterForCurrentUser();
  } catch (err) {
    if (err instanceof NoSiteConnectedError) {
      redirect("/sites");
    }
    throw err;
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">New page</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Describe the page you want, generate a draft, then save it to Sanity.
      </p>
      <GeneratePageForm />
    </div>
  );
}
