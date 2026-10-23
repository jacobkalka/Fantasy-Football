"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { buttonClass } from "@/components/ui/Button";
import { useAuth, useProfile } from "@/lib/supabase/auth";
import { useRosterSync, type SyncPhase } from "@/lib/supabase/roster-sync";
import { UserAvatar } from "./UserAvatar";

const SYNC_LABEL: Partial<Record<SyncPhase, { text: string; dot: string }>> = {
  checking: { text: "Checking your saved team", dot: "bg-accent live-dot text-accent" },
  waiting: { text: "Saving your team", dot: "bg-accent live-dot text-accent" },
  saving: { text: "Saving your team", dot: "bg-accent live-dot text-accent" },
  offline: { text: "Team not saved yet: offline", dot: "bg-warning" },
  error: { text: "Team not saved yet", dot: "bg-warning" },
};

/**
 * "Sign in", or your picture and name (with a dot while your team saves). Purely visual:
 * the roster sync itself is mounted once in the root layout (<RosterSync />).
 */
export function AccountButton({ compact = false }: { compact?: boolean }) {
  const auth = useAuth();
  const { profile } = useProfile();
  const sync = useRosterSync();
  const router = useRouter();

  if (auth.status === "loading") {
    return <span className="skeleton block h-9 w-[5.5rem] rounded-full" aria-hidden="true" />;
  }
  if (auth.status !== "signed-in") {
    return (
      <Link
        href="/auth/sign-in"
        onClick={(event) => {
          // Come back to this screen after signing in.
          const here = window.location.pathname + window.location.search;
          if (here === "/" || here.startsWith("/auth")) return;
          event.preventDefault();
          router.push(`/auth/sign-in?next=${encodeURIComponent(here)}`);
        }}
        className={buttonClass("secondary", "sm")}
      >
        Sign in
      </Link>
    );
  }
  const name = profile?.username ?? auth.user.email?.split("@")[0] ?? "you";
  const status = SYNC_LABEL[sync.phase];
  return (
    <Link
      href="/account"
      aria-label={`Your account, @${name}${status ? `. ${status.text}` : ""}`}
      className="pressable flex h-9 items-center gap-2 rounded-full py-1 pr-3 pl-1 hover:bg-raised"
    >
      <span className="relative">
        <UserAvatar username={name} avatarUrl={profile?.avatarUrl} size={28} />
        {status && (
          <span
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-ground ${status.dot}`}
            aria-hidden="true"
          />
        )}
      </span>
      {!compact && <span className="max-w-[7.5rem] truncate text-[13px]">@{name}</span>}
    </Link>
  );
}
