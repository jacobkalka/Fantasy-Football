"use client";

import Link from "next/link";
import { useAdminStatus } from "@/lib/hooks/useEntitlements";

/** "ADMIN MODE" in the top bar while it's on (the server said so). Tapping it opens the switch in Settings. */
export function AdminIndicator() {
  const admin = useAdminStatus();
  if (!admin.active) return null;
  return (
    <Link
      href="/settings#admin"
      className="shrink-0 rounded-md bg-ink px-2 py-1 text-[11px] leading-none font-semibold tracking-wide whitespace-nowrap text-black"
      aria-label="Admin Mode is on. Open Admin Mode settings"
    >
      ADMIN MODE
    </Link>
  );
}
