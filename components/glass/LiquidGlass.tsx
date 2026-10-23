"use client";

import { useEffect, useRef, useState } from "react";
import { canRunLiquidGlass, loadContainer, onGlassAvailability, requestSnapshot } from "@/lib/glass/snapshot";
import { useSettings } from "@/lib/settings/store";

/**
 * A floating surface in liquid glass (Liquid Glass JS: WebGL refraction of the page
 * behind it). Used only for things that float above content: the phone tab bar and
 * floating trays. It always renders the CSS fallback first (blur + rim); the WebGL glass
 * takes over once it's ready, on devices that can run it, unless turned off in Settings.
 */
export function LiquidGlass({
  children,
  className = "",
  radius = 28,
  shape = "rounded",
  tint = 0.06,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  radius?: number;
  shape?: "rounded" | "pill" | "circle";
  /** How much the library's light tint shows (0-1). Kept low on the dark theme. */
  tint?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const { value: settings, ready: settingsReady } = useSettings();
  const wanted = settingsReady && settings.glass !== "off";

  useEffect(() => {
    const element = ref.current;
    if (!element || !wanted || !canRunLiquidGlass()) return;
    let container: { destroy(): void } | null = null;
    let cancelled = false;
    loadContainer().then((Container) => {
      if (cancelled || !ref.current) return;
      container = new Container({
        element,
        borderRadius: radius,
        type: shape,
        tintOpacity: tint,
        onReady: () => !cancelled && setReady(true),
      });
      if (Container.snapshot) setReady(true);
      requestSnapshot(300);
    });
    const off = onGlassAvailability((on) => {
      if (!on) {
        container?.destroy();
        container = null;
        setReady(false);
      }
    });
    return () => {
      cancelled = true;
      off();
      container?.destroy();
      setReady(false);
    };
  }, [wanted, radius, shape, tint]);

  // Content changes (a new screen, data arriving, lists filtering) → refresh the picture, at most every few seconds.
  useEffect(() => {
    if (!ready) return;
    const main = document.getElementById("main");
    if (!main) return;
    let last = 0;
    const observer = new MutationObserver(() => {
      const now = performance.now();
      if (now - last < 3000) return requestSnapshot(1500);
      last = now;
      requestSnapshot(900);
    });
    observer.observe(main, { childList: true, subtree: true });
    const onResize = () => requestSnapshot(500);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [ready]);

  return (
    <div
      ref={ref}
      data-glass=""
      data-glass-ready={ready ? "" : undefined}
      className={`relative isolate ${ready ? "liquid-glass-ready" : "glass-float"} ${className}`}
      style={{ borderRadius: shape === "rounded" ? radius : 9999, ...style }}
    >
      {children}
    </div>
  );
}
