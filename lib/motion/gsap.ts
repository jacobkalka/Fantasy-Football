"use client";

/**
 * The app's one animation engine. Every animated component imports GSAP from here so
 * plugins are registered once and every move shares the same timing.
 *
 * Rules (DECISIONS.md, "Motion"): transform and opacity only; most interactions are
 * immediate and only a few things move (a screen arriving, a sheet opening, a number
 * changing, a list re-ordering); with "reduce motion" on, things appear without travel.
 */
import gsap from "gsap";
import { Flip } from "gsap/Flip";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, Flip, ScrollTrigger);
gsap.defaults({ ease: "power3.out", duration: 0.24 });

export { gsap, Flip, ScrollTrigger, useGSAP };

/** Durations in seconds. */
export const MOTION = {
  /** Presses, toggles, small state changes. */
  fast: 0.14,
  /** A screen or a block arriving. */
  base: 0.24,
  /** Sheets, re-ordering lists, a number rolling to its new value. */
  slow: 0.42,
  /** Delay between siblings arriving together. */
  stagger: 0.04,
} as const;

/**
 * True when animations should be reduced: the device asks for it (and the app follows the
 * device), or Settings → Animations is Reduced. Settings → Full always animates.
 */
export { motionReduced as prefersReducedMotion } from "./preference";
