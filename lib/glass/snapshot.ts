"use client";

/**
 * The page picture behind the liquid glass. Liquid Glass JS refracts a snapshot of the
 * page (it can't read live pixels), so this keeps one snapshot fresh enough:
 * - taken when the browser is idle and you're not scrolling,
 * - again after you navigate, resize, or the content changes (debounced),
 * - at a reduced scale (the glass blurs it anyway), capped to a safe texture size.
 * If a capture is slow on this device, glass turns itself off for the visit and the
 * CSS fallback stays (no jank on older phones).
 */
import type { Container as ContainerType } from "@/lib/vendor/liquid-glass/container";

type ContainerClass = typeof ContainerType;

const MAX_TEXTURE = 4096;
const SLOW_CAPTURE_MS = 450;

let Container: ContainerClass | null = null;
let capturing = false;
let pending = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let lastScroll = 0;
let disabled = false;
const listeners = new Set<(on: boolean) => void>();

export function glassDisabled() {
  return disabled;
}

export function onGlassAvailability(listener: (on: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function disable() {
  disabled = true;
  listeners.forEach((listener) => listener(false));
}

if (typeof window !== "undefined") {
  window.addEventListener("scroll", () => (lastScroll = performance.now()), { passive: true });
}

export async function loadContainer(): Promise<ContainerClass> {
  if (!Container) Container = (await import("@/lib/vendor/liquid-glass/container")).Container;
  return Container;
}

function whenIdle(run: () => void) {
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
    .requestIdleCallback;
  if (idle) idle(run, { timeout: 2000 });
  else setTimeout(run, 200);
}

async function capture() {
  if (disabled || capturing || document.hidden) return;
  // Wait for scrolling to settle: a capture mid-scroll can drop frames.
  if (performance.now() - lastScroll < 400) {
    requestSnapshot(400);
    return;
  }
  capturing = true;
  pending = false;
  try {
    const [{ default: html2canvas }, GlassContainer] = await Promise.all([import("html2canvas-pro"), loadContainer()]);
    const page = document.documentElement;
    const cssWidth = page.clientWidth;
    const cssHeight = Math.max(page.scrollHeight, window.innerHeight);
    const phone = window.matchMedia("(max-width: 1023px)").matches;
    const scale = Math.min(phone ? 0.5 : 0.75, MAX_TEXTURE / cssHeight, MAX_TEXTURE / cssWidth);
    const started = performance.now();
    const canvas = await html2canvas(document.body, {
      scale,
      backgroundColor: "#000000",
      useCORS: true,
      allowTaint: false,
      logging: false,
      width: cssWidth,
      height: cssHeight,
      windowWidth: cssWidth,
      windowHeight: window.innerHeight,
      x: 0,
      y: 0,
      ignoreElements: (element: Element) =>
        element.hasAttribute("data-glass") ||
        element.hasAttribute("data-glass-ignore") ||
        element.tagName === "DIALOG" ||
        element.tagName === "IFRAME" ||
        element.tagName === "VIDEO",
    });
    const took = performance.now() - started;
    GlassContainer.setSnapshot(canvas, cssWidth, cssHeight);
    if (took > SLOW_CAPTURE_MS) disable();
  } catch {
    disable();
  } finally {
    capturing = false;
    if (pending) requestSnapshot(1500);
  }
}

/** Ask for a fresh snapshot soon (coalesced: many requests make one capture). */
export function requestSnapshot(delay = 600) {
  if (typeof window === "undefined" || disabled) return;
  if (capturing) {
    pending = true;
    return;
  }
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    whenIdle(capture);
  }, delay);
}

/** Can this device run the WebGL glass well? Otherwise the CSS fallback is used. */
export function canRunLiquidGlass(): boolean {
  if (typeof window === "undefined" || disabled) return false;
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return false;
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if ((nav.hardwareConcurrency ?? 8) < 4) return false;
  if ((nav.deviceMemory ?? 8) < 4) return false;
  if (nav.connection?.saveData) return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl"));
  } catch {
    return false;
  }
}
