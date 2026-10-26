"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string) {
  const words = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "FL";
}

/** A fantasy team's logo (ESPN-hosted when it has one) or its initials on a nested-panel grey. */
export function TeamBadge({ name, logo, size = 36, className = "" }: { name: string; logo?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size };
  if (logo && !failed) {
    return (
      <span className={`relative inline-flex shrink-0 overflow-hidden rounded-[30%] bg-well ${className}`} style={style}>
        <Image src={logo} alt="" width={size} height={size} className="object-cover" onError={() => setFailed(true)} unoptimized />
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-[30%] bg-well font-semibold text-ink ${className}`}
      style={{ ...style, fontSize: size * 0.36 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
