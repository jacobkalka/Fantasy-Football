"use client";

import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useRef } from "react";

/**
 * A card that tilts in 3D toward your finger or cursor, with the glass sheen
 * following along. Children can pop forward with `style={{ transform: "translateZ(30px)" }}`.
 */
export function TiltCard({
  children,
  className = "",
  max = 8,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum tilt in degrees. */
  max?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 220, damping: 22, mass: 0.6 };
  const rotateX = useSpring(useTransform(py, [0, 1], [max, -max]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-max, max]), spring);

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduce) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    px.set(x);
    py.set(y);
    el.style.setProperty("--sheen-x", `${Math.round(x * 100)}%`);
    el.style.setProperty("--sheen-y", `${Math.round(y * 100 - 30)}%`);
  }

  function reset() {
    px.set(0.5);
    py.set(0.5);
    ref.current?.style.removeProperty("--sheen-x");
    ref.current?.style.removeProperty("--sheen-y");
  }

  return (
    <div style={{ perspective: 900 }}>
      <motion.div
        ref={ref}
        className={className}
        style={{ ...style, rotateX, rotateY, transformStyle: "preserve-3d" }}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        onPointerUp={reset}
        onPointerCancel={reset}
      >
        {children}
      </motion.div>
    </div>
  );
}
