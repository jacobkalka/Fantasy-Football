"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/lib/config";
import { TabIcon } from "./TabIcon";

function isActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** The bottom navigation. Pass `pathname={null}` to render with no tab highlighted. */
export function TabBarLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="grid grid-cols-5">
      {TABS.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <li key={tab.href}>
            <Link
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={`-mt-px flex h-16 flex-col items-center justify-center gap-1 border-t-2 font-mono text-[10px] tracking-[0.06em] uppercase transition-colors ${
                active
                  ? "border-gain text-gain"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <TabIcon name={tab.icon} />
              {tab.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function TabBar() {
  return <TabBarLinks pathname={usePathname()} />;
}
