"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/sites", label: "Sites" },
  { href: "/pages", label: "Pages" },
  { href: "/media", label: "Media" },
  { href: "/dashboard", label: "Dashboard" },
];

// The cost/usage dashboard (tomorrow) extends this same screen rather than
// needing its own nav entry — listed now, disabled, so the shell's shape
// doesn't have to change again when it lands.
const SOON_ITEMS = ["FAQs"];

const SIDEBAR_NAV_ID = "app-sidebar-nav";

// Below `sm:`, this renders as a hidden-by-default slide-in drawer (toggled
// by a fixed hamburger button) instead of the permanent 224px-wide column it
// is from `sm:` up — previously there was no responsive treatment at all, so
// a 224px sidebar permanently ate well over half of a ~375px phone screen
// with no way to hide it. TopBar.tsx reserves left padding on narrow screens
// so its own content doesn't sit under the fixed toggle button.
export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Closes automatically on navigation — without this, tapping a link in the
  // drawer on mobile would leave the drawer covering the very page it just
  // navigated to. Adjusting state during render (React's documented pattern
  // for "reset state when a prop changes") rather than in a useEffect, which
  // would cause an extra, avoidable re-render on every navigation.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen]);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-controls={SIDEBAR_NAV_ID}
        className="fixed top-3 left-4 z-40 rounded-lg border border-zinc-300 bg-white p-2 text-zinc-700 sm:hidden dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300"
      >
        <span className="sr-only">{isOpen ? "Close menu" : "Open menu"}</span>
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth={1.75}>
          {isOpen ? (
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          ) : (
            <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
          className="fixed inset-0 z-30 bg-black/30 sm:hidden"
        />
      )}

      <nav
        id={SIDEBAR_NAV_ID}
        className={`fixed inset-y-0 left-0 z-30 w-56 shrink-0 transform overflow-y-auto border-r border-zinc-200 bg-white px-4 pt-14 pb-6 transition-transform duration-200 ease-in-out motion-reduce:transition-none sm:py-6 dark:border-zinc-800 dark:bg-zinc-950 sm:static sm:z-auto sm:translate-x-0 sm:transition-none ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
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
                  aria-current={active ? "page" : undefined}
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
              <span
                aria-disabled="true"
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-zinc-400 dark:text-zinc-600"
              >
                {label}
                <span className="text-xs">Soon</span>
              </span>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
