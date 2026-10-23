"use client";

import { useEffect } from "react";

/**
 * Entrance animations only play for things that appear after the page is already on
 * screen (a screen you navigated to, data that replaced its loading placeholder).
 * Content that arrives with the first page load is shown as-is: animating it would
 * make it flash (drawn, hidden, then animated in) because the page paints before
 * the scripts start.
 */
let hydrated = false;

export function isHydrated() {
  return hydrated;
}

/** Mounted once in the root layout. Effects run after every layout effect of the first render. */
export function HydrationMarker() {
  useEffect(() => {
    hydrated = true;
  }, []);
  return null;
}
