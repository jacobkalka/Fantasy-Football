"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "@/lib/config";
import { TabIcon } from "./TabIcon";

function tabIndex(pathname: string | null) {
  if (!pathname) return -1;
  return TABS.findIndex((tab) =>
    tab.href === "/" ? pathname === "/" || pathname.startsWith("/team") : pathname.startsWith(tab.href),
  );
}

/**
 * The floating glass tab bar. The lime "liquid" highlight slides to the active tab,
 * and screens slide left or right depending on which way you moved.
 * Pass `pathname={null}` to render with no tab highlighted.
 */
export function TabBarLinks({ pathname }: { pathname: string | null }) {
  const active = tabIndex(pathname);
  return (
    <ul className="glass-bar grid grid-cols-5 gap-1 rounded-[1.75rem] p-1.5">
      {TABS.map((tab, index) => {
        const isActive = index === active;
        const direction = active === -1 || index > active ? "nav-forward" : "nav-back";
        return (
          <li key={tab.href} className="relative">
            {isActive && (
              <motion.span
                layoutId="tab-pill"
                className="glass-gain absolute inset-0 rounded-[1.35rem]"
                transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }}
                aria-hidden="true"
              />
            )}
            <Link
              href={tab.href}
              transitionTypes={isActive ? undefined : [direction]}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-[1.35rem] font-mono text-[9.5px] tracking-[0.06em] uppercase transition-colors active:scale-95 ${
                isActive ? "text-gain" : "text-muted hover:text-ink"
              }`}
            >
              <motion.span
                animate={isActive ? { y: -1, scale: 1.08 } : { y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 26 }}
              >
                <TabIcon name={tab.icon} />
              </motion.span>
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
