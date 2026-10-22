"use client";

import Image from "next/image";
import { useState } from "react";

/** A team logo, or the team's initials on its color if the logo won't load. */
export function TeamLogo({
  abbr,
  logo,
  color,
  size = 32,
  className = "",
}: {
  abbr: string;
  logo?: string | null;
  color?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!logo || failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-ink-strong ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.36, background: color ?? "#333" }}
        aria-label={abbr}
        role="img"
      >
        {abbr}
      </span>
    );
  }
  return (
    <Image
      src={logo}
      alt={abbr}
      width={size}
      height={size}
      className={`shrink-0 object-contain drop-shadow-[0_4px_10px_rgb(0_0_0/0.6)] ${className}`}
      onError={() => setFailed(true)}
    />
  );
}
