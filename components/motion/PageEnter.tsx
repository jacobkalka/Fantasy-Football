"use client";

import { useRef } from "react";
import { gsap, MOTION, prefersReducedMotion, ScrollTrigger, useGSAP } from "@/lib/motion/gsap";

/** What animates in on every screen: cards, and anything marked data-animate. */
const TARGETS = ".card, [data-animate]";

/**
 * Every screen's entrance (app/template.tsx wraps each page in this):
 * - the screen fades in and its title rises,
 * - the cards on screen cascade in one after another,
 * - cards further down slide up as you scroll to them (ScrollTrigger),
 * - cards that appear later (data arriving, a list filtering) animate in when they appear.
 * Each card animates once. With animations reduced, things simply appear.
 *
 * On the first page load the screen starts hidden by CSS (html[data-motion="full"]
 * #main [data-page]) so nothing flashes before the animation; a CSS fallback reveals it
 * after 1.5 s if scripts never run.
 */
export function PageEnter({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const page = ref.current;
      if (!page) return;
      const done = new WeakSet<Element>();

      const show = () => {
        page.setAttribute("data-entered", "");
        gsap.set(page, { clearProps: "opacity,visibility" });
      };

      if (prefersReducedMotion()) {
        show();
        return;
      }

      const inView = (el: Element) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      };

      /** Animate new targets: the visible ones cascade now, the rest wait for scroll. */
      const enter = (elements: Element[], baseDelay = 0) => {
        const fresh = elements.filter((el) => !done.has(el) && !el.closest("dialog"));
        if (!fresh.length) return;
        fresh.forEach((el) => done.add(el));
        const now = fresh.filter(inView);
        const later = fresh.filter((el) => !inView(el));
        if (now.length) {
          gsap.fromTo(
            now,
            { autoAlpha: 0, y: 22, scale: 0.985 },
            {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              duration: 0.55,
              ease: "power3.out",
              stagger: 0.07,
              delay: baseDelay,
              clearProps: "transform,opacity,visibility",
            },
          );
        }
        if (later.length) {
          gsap.set(later, { autoAlpha: 0, y: 34 });
          ScrollTrigger.batch(later, {
            start: "top 92%",
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, {
                autoAlpha: 1,
                y: 0,
                duration: 0.6,
                ease: "power3.out",
                stagger: 0.08,
                clearProps: "transform,opacity,visibility",
              }),
          });
        }
      };

      // The screen itself, then its title, then the cards.
      gsap.fromTo(page, { autoAlpha: 0 }, { autoAlpha: 1, duration: MOTION.base, onComplete: show });
      const title = page.querySelector("h1");
      if (title) gsap.from(title.parentElement ?? title, { y: 14, autoAlpha: 0, duration: 0.5, ease: "power3.out" });
      enter(Array.from(page.querySelectorAll(TARGETS)), 0.08);

      // Content loading above a waiting card moves it; re-measure so it still triggers in view.
      let refreshTimer: ReturnType<typeof setTimeout> | undefined;
      const refreshSoon = () => {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
      };

      // Cards that arrive later (data loaded, filters changed) come in as they appear.
      const observer = new MutationObserver((mutations) => {
        const added: Element[] = [];
        for (const m of mutations) {
          m.addedNodes.forEach((node) => {
            if (!(node instanceof Element)) return;
            if (node.matches(TARGETS)) added.push(node);
            node.querySelectorAll(TARGETS).forEach((el) => added.push(el));
          });
        }
        if (added.length) enter(added);
        refreshSoon();
      });
      observer.observe(page, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        clearTimeout(refreshTimer);
      };
    },
    { scope: ref },
  );

  return (
    <div ref={ref} data-page="">
      {children}
    </div>
  );
}
