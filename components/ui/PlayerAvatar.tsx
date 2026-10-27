"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string) {
  const parts = name.replace(/[^A-Za-z' .-]/g, "").split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/**
 * A player's headshot on a flat grey disc (colour is kept for data, so no team tint or ring).
 * Falls back to initials if ESPN has no photo (common for rookies and practice-squad players).
 * `teamColor` is accepted from callers but not drawn.
 */
export function PlayerAvatar({
  name,
  headshot,
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
      className={`relative inline-flex shrink-0 items-end justify-center overflow-hidden rounded-full bg-well ${className}`}
      style={{ width: size, height: size }}
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
          className="flex h-full w-full items-center justify-center font-semibold text-ink"
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
