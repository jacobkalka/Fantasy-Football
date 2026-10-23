"use client";

import { useEffect, useRef } from "react";
import { Icon } from "@/components/ui/Icon";
import { gsap, prefersReducedMotion } from "@/lib/motion/gsap";
import { isStandalone } from "./install";

/** How far (after resistance) you pull before letting go reloads. */
const THRESHOLD = 64;
const MAX_PULL = 96;
/** Finger movement ignored at the start, so taps and small drags never count. */
const SLOP = 10;

/**
 * Pull down from the top of any screen to reload it, like a native app. Only in the installed
 * app: a browser tab has its own reload, and the installed app on iPhone has none. Screens
 * already refresh live data by themselves; this is for when you want to be sure.
 * Doesn't start inside text fields, open sheets, sideways scrollers, or anything marked
 * data-no-pull, and never once the page is scrolled down.
 */
export function PullToRefresh() {
  const indicator = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = indicator.current;
    const glyph = icon.current;
    if (!el || !glyph || !isStandalone() || !window.matchMedia("(pointer: coarse)").matches) return;

    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let armed = false;
    let busy = false;
    let distance = 0;

    const reset = () => {
      start = null;
      pulling = false;
      armed = false;
      distance = 0;
      el.removeAttribute("data-armed");
    };

    const onStart = (event: TouchEvent) => {
      if (busy || event.touches.length !== 1 || window.scrollY > 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], dialog, [data-no-pull]")) return;
      if (document.querySelector("dialog[open]")) return;
      const touch = event.touches[0];
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches[0];
      const dy = touch.clientY - start.y;
      const dx = touch.clientX - start.x;
      if (!pulling) {
        if (dy < SLOP && Math.abs(dx) < SLOP) return;
        // Sideways or upward: not a pull. Let the page (or a carousel) have it.
        if (dy < SLOP || Math.abs(dx) > dy) return reset();
        pulling = true;
      }
      if (window.scrollY > 0) {
        gsap.to(el, { y: 0, autoAlpha: 0, duration: 0.2 });
        return reset();
      }
      // Resistance: the indicator follows the finger at half speed, slowing near the end.
      const raw = (dy - SLOP) * 0.5;
      distance = Math.min(MAX_PULL, raw < THRESHOLD ? raw : THRESHOLD + (raw - THRESHOLD) * 0.35);
      gsap.set(el, { y: distance, autoAlpha: Math.min(1, distance / 32) });
      gsap.set(glyph, { rotation: distance * 4 });
      const nowArmed = distance >= THRESHOLD;
      if (nowArmed !== armed) {
        armed = nowArmed;
        el.toggleAttribute("data-armed", armed);
        if (armed) navigator.vibrate?.(8);
        if (!prefersReducedMotion()) gsap.fromTo(el, { scale: armed ? 0.85 : 1.1 }, { scale: 1, duration: 0.3, ease: "back.out(3)" });
      }
    };

    const onEnd = () => {
      if (!pulling) return reset();
      if (armed) {
        busy = true;
        gsap.to(el, { y: THRESHOLD * 0.75, duration: 0.2, ease: "power2.out" });
        if (!prefersReducedMotion()) gsap.to(glyph, { rotation: "+=360", duration: 0.7, ease: "none", repeat: -1 });
        // Let the spinner show for a moment so the reload reads as the pull's result.
        window.setTimeout(() => window.location.reload(), 220);
      } else {
        gsap.to(el, { y: 0, autoAlpha: 0, duration: 0.25, ease: "power2.out" });
      }
      reset();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  return (
    <div
      ref={indicator}
      aria-hidden="true"
      data-pwa="pull-to-refresh"
      className="pointer-events-none invisible fixed top-[calc(var(--safe-top)-36px)] left-1/2 z-[60] -ml-5 grid size-10 place-items-center rounded-full bg-raised text-muted opacity-0 shadow-[0_8px_24px_rgb(0_0_0/0.5)] data-[armed]:text-ink"
    >
      <span ref={icon} className="grid place-items-center">
        <Icon name="refresh" size={20} strokeWidth={2} />
      </span>
    </div>
  );
}
