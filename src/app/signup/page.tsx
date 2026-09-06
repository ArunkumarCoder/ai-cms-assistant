import Link from "next/link";
import { AuthForm } from "@/components/AuthForm";
import { signupAction } from "@/lib/auth/actions";

export const metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <div className="mx-auto w-full max-w-sm px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign up</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Already have an account?{" "}
        <Link href="/login" className="underline">
          Log in
        </Link>
        .
      </p>

      <AuthForm action={signupAction} submitLabel="Sign up" />
    </div>
  );
}
