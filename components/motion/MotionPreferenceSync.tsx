"use client";

import { useEffect } from "react";
import { applyMotionPreference } from "@/lib/motion/preference";
import { useSettings } from "@/lib/settings/store";

/** Keeps <html data-motion> in step with Settings → Animations and with the device's Reduce Motion switch. */
export function MotionPreferenceSync() {
  const { value, ready } = useSettings();
  useEffect(() => {
    if (!ready) return;
    applyMotionPreference(value.motion);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => applyMotionPreference(value.motion);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [ready, value.motion]);
  return null;
}
