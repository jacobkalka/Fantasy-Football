"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { gsap, MOTION, prefersReducedMotion } from "@/lib/motion/gsap";
import { activeChild, NAV } from "@/lib/config";

/** Where the underline was on the previous screen, so it can slide from there to the new tab. */
let last: { section: string; x: number; width: number } | null = null;

/**
 * Underline tabs for a section's sub-pages (Team: Lineup · Rating · Start/Sit · Roster).
 * Each page renders its own tabs with its own path, so there's nothing to load and
 * nothing shifts; the 2px underline slides from the tab you came from.
 */
export function SectionTabs({ section: sectionHref, current }: { section: string; current: string }) {
  const section = NAV.find((s) => s.href === sectionHref) ?? null;
  const active = activeChild(section, current);
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const root = list.current;
    const line = bar.current;
    const target = root?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!root || !line) return;
    if (!target) {
      gsap.set(line, { width: 0 });
      return;
    }
    const style = getComputedStyle(target);
    const left = parseFloat(style.paddingLeft) || 0;
    const right = parseFloat(style.paddingRight) || 0;
    const to = { x: target.offsetLeft + left, width: target.offsetWidth - left - right };
    const reduce = prefersReducedMotion();
    if (last && last.section === sectionHref && !reduce && (last.x !== to.x || last.width !== to.width)) {
      gsap.fromTo(line, { x: last.x, width: last.width }, { ...to, duration: MOTION.base, ease: "power3.out" });
    } else {
      gsap.set(line, to);
    }
    last = { section: sectionHref, ...to };
    // Keep the active tab in view on narrow screens.
    if (target.offsetLeft + target.offsetWidth > root.scrollLeft + root.clientWidth || target.offsetLeft < root.scrollLeft) {
      root.scrollLeft = target.offsetLeft;
    }
  }, [sectionHref, current]);

  if (!section?.children) return null;
  return (
    // Inside the page's gutter, so on a phone the row scrolls without text reaching the screen edge.
    <nav aria-label={`${section.label} pages`} className="mb-1 border-b border-line">
      <div ref={list} className="no-scrollbar relative flex overflow-x-auto">
        {section.children.map((tab) => {
          const on = active?.href === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center px-3 text-[14px] whitespace-nowrap transition-colors first:pl-0 last:pr-0 ${
                on ? "font-medium text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
        <span
          ref={bar}
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-0.5 rounded-full bg-ink"
          style={{ width: 0 }}
        />
      </div>
    </nav>
  );
}
