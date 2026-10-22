"use client";

import { MotionConfig } from "motion/react";

/** Turns off movement-based animation for people who ask their device to reduce motion. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
