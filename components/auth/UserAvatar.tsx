"use client";

import Image from "next/image";
import { useState } from "react";

// Token colors only; which one a person gets is fixed by their username.
const TONES = [
  "bg-gain/20 text-gain ring-gain/40",
  "bg-sky/20 text-sky ring-sky/40",
  "bg-alert/20 text-alert ring-alert/40",
  "bg-loss/15 text-loss ring-loss/40",
  "bg-white/10 text-ink-strong ring-white/25",
];

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
        className={`shrink-0 rounded-full object-cover ring-1 ring-white/20 ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold ring-1 ${toneFor(username)} ${className}`}
      style={{ ...style, fontSize: size * 0.4 }}
    >
      {initials}
    </span>
  );
}
