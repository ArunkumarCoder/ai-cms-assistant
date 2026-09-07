"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/sites", label: "Sites" },
  { href: "/pages", label: "Pages" },
];

// Later phases (SEO audit, image library, FAQ generation) each get their own
// screen — listed now, disabled, so the shell's shape doesn't have to change
// again when they land.
const SOON_ITEMS = ["Media", "FAQs", "Dashboard"];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <nav className="w-56 shrink-0 border-r border-zinc-200 px-4 py-6 dark:border-zinc-800">
      <div className="px-2 text-sm font-semibold tracking-tight">
        AI CMS Assistant
      </div>
      <ul className="mt-6 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  active
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
        {SOON_ITEMS.map((label) => (
          <li key={label}>
            <span className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600">
              {label}
              <span className="text-xs">Soon</span>
            </span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
