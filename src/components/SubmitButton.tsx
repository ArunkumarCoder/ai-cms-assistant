"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

// A plain <button type="submit"> gives no feedback while its form's action is
// in flight — useFormStatus only works in a component nested *under* the
// <form>, so this has to be its own component rather than inlined at the
// call site.
export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className ?? ""} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
