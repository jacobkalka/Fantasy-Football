"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Icon } from "@/components/ui/Icon";

/** Screens one level below a tab, and where "back" goes when you opened them directly. */
const PARENTS: [RegExp, string][] = [
  [/^\/games\/[^/]+$/, "/games"],
  [/^\/players\/(?!pickups$|watchlist$)[^/]+$/, "/players"],
  [/^\/chat\/[^/]+$/, "/chat"],
  [/^\/u\/[^/]+$/, "/chat"],
  [/^\/team\/import$/, "/team"],
  [/^\/(settings|account|offline)$/, "/"],
  [/^\/auth\//, "/"],
];

export function parentOf(pathname: string): string | null {
  return PARENTS.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
}

// Screens visited in this app session, so "back" returns where you came from when there is
// somewhere to return to, and goes up a level when the screen was opened from a link.
let visited = 0;
let lastPath: string | null = null;

/**
 * A back arrow at the top of detail screens on phones. The installed app on iPhone has no
 * browser back button, and a deep link (from a notification, a shared link) has no history.
 */
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const parent = parentOf(pathname);

  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) visited += 1;
    lastPath = pathname;
  }, [pathname]);

  if (!parent) return null;
  return (
    <button
      type="button"
      aria-label="Back"
      onClick={() => (visited > 0 ? router.back() : router.push(parent))}
      className="pressable -ml-2 grid size-10 place-items-center rounded-full text-ink hover:bg-raised"
    >
      <Icon name="chevronLeft" size={22} strokeWidth={2} />
    </button>
  );
}
