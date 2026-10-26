"use client";

import Image from "next/image";
import { useState } from "react";

// Greys only (colour is for data): which step a person gets is fixed by their username.
const TONES = ["bg-well text-ink", "bg-control text-ink", "bg-ink text-black"];

function toneFor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

/** A person's picture, or their initials on a colored disc if they have none (or it won't load). */
export function UserAvatar({
  username,
  avatarUrl,
  size = 36,
  className = "",
}: {
  username: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials = username.replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
  const style = { width: size, height: size };
  if (avatarUrl && avatarUrl.startsWith("https://") && !failed) {
    return (
      <Image
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        unoptimized
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${toneFor(username)} ${className}`}
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
