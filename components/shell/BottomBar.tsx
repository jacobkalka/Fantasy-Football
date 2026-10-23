"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef } from "react";
import { LiquidGlass } from "@/components/glass/LiquidGlass";
import { Icon } from "@/components/ui/Icon";
import { gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { NAV, sectionFor } from "@/lib/config";

/**
 * The phone's tab bar: five sections in a floating liquid-glass bar, clear of the home
 * indicator. The active section's icon and label turn white and a lens slides under it.
 */
export function BottomBarLinks({ pathname }: { pathname: string | null }) {
  const active = sectionFor(pathname);
  const row = useRef<HTMLDivElement>(null);
  const lens = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = row.current;
    const pill = lens.current;
    if (!root || !pill) return;
    const target = root.querySelector<HTMLElement>('[aria-current="page"], [data-active]');
    if (!target) {
      gsap.set(pill, { autoAlpha: 0 });
      return;
    }
    const to = { x: target.offsetLeft, width: target.offsetWidth, autoAlpha: 1 };
    const reduce = prefersReducedMotion();
    if (!placed.current || reduce) gsap.set(pill, to);
    else gsap.to(pill, { ...to, duration: 0.5, ease: "back.out(1.4)" });
    placed.current = true;
  }, [active?.href]);

  return (
    <div ref={row} className="relative flex h-full items-stretch px-1.5">
      <span
        ref={lens}
        aria-hidden="true"
        className="absolute top-1.5 bottom-1.5 left-0 rounded-[22px] bg-white/[0.09]"
        style={{ width: 0, visibility: "hidden" }}
      />
      {NAV.map((item) => {
        const on = active?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={(event) => {
              // A small bounce on the icon you tapped.
              if (prefersReducedMotion()) return;
              const icon = event.currentTarget.querySelector("svg");
              if (icon) gsap.fromTo(icon, { scale: 0.8, y: 2 }, { scale: 1, y: 0, duration: 0.45, ease: "back.out(2.2)" });
            }}
            aria-current={on && pathname === item.href ? "page" : undefined}
            data-active={on ? "" : undefined}
            className={`pressable relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[22px] ${
              on ? "text-ink" : "text-[#a3a3a3]"
            }`}
          >
            <Icon name={item.icon} size={22} strokeWidth={on ? 1.9 : 1.6} />
            <span className={`text-[11px] leading-[14px] ${on ? "font-medium" : ""}`}>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function BottomBar() {
  const pathname = usePathname();
  return <BottomBarLinks pathname={pathname} />;
}

/** The floating frame, safe-area aware. */
export function BottomBarFrame({ children }: { children: React.ReactNode }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 px-[max(12px,var(--safe-left))] pb-[max(10px,var(--safe-bottom))] lg:hidden"
      style={{ paddingRight: "max(12px, var(--safe-right))" }}
    >
      <LiquidGlass className="mx-auto h-[var(--tabbar-height)] max-w-[480px]" radius={30} tint={0.05}>
        {children}
      </LiquidGlass>
    </nav>
  );
}
