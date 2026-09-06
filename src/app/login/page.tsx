import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { loginAction } from "@/lib/auth/actions";

export const metadata = { title: "Log in" };

export default function LoginPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        No account yet?{" "}
        <Link href="/signup" className="underline">
          Sign up
        </Link>
        .
      </p>

      <AuthForm action={loginAction} submitLabel="Log in" />
    </div>
  );
}
