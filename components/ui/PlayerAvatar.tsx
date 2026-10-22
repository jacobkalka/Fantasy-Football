"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * A player's headshot inside a glowing ring of their team's color. Falls back
 * to initials if ESPN has no photo (common for rookies and practice-squad players).
 */
export function PlayerAvatar({
  name,
  headshot,
  teamColor = "#5a6570",
  size = 44,
  className = "",
}: {
  name: string;
  headshot?: string | null;
  teamColor?: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showPhoto = headshot && !failed;
  return (
    <span
      className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${teamColor} 55%, #10161c), #0a0e12 75%)`,
        boxShadow: `0 0 0 2px ${teamColor}, 0 0 18px -4px ${teamColor}, inset 0 1px 0 rgb(255 255 255 / 0.25)`,
      }}
    >
      {showPhoto ? (
        <Image
          src={headshot}
          alt={name}
          // ESPN headshots are 350×254; scale so the face fills the circle.
          width={Math.round(size * 1.38)}
          height={size}
          className="h-full w-auto max-w-none object-cover object-top"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="flex h-full w-full items-center justify-center font-display font-bold text-ink-strong"
          style={{ fontSize: size * 0.36 }}
          role="img"
          aria-label={name}
        >
          {initials(name)}
        </span>
      )}
    </span>
  );
}
