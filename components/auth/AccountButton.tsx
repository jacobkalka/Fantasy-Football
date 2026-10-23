"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useProfile } from "@/lib/supabase/auth";
import { useRosterSync, type SyncPhase } from "@/lib/supabase/roster-sync";
import { RosterSync } from "./RosterSync";
import { UserAvatar } from "./UserAvatar";

const SYNC_LABEL: Partial<Record<SyncPhase, { text: string; dot: string }>> = {
  checking: { text: "Checking your saved team", dot: "bg-sky live-dot text-sky" },
  waiting: { text: "Saving your team", dot: "bg-sky live-dot text-sky" },
  saving: { text: "Saving your team", dot: "bg-sky live-dot text-sky" },
  offline: { text: "Team not saved yet: offline", dot: "bg-alert" },
  error: { text: "Team not saved yet", dot: "bg-alert" },
};

/** Right side of the header: "Sign in", or your picture and name (with a dot while your team saves). */
export function AccountButton() {
  const auth = useAuth();
  const { profile } = useProfile();
  const sync = useRosterSync();
  const router = useRouter();

  let content: React.ReactNode;
  if (auth.status === "loading") {
    content = <span className="skeleton block h-9 w-[5.5rem] rounded-full" aria-hidden="true" />;
  } else if (auth.status !== "signed-in") {
    content = (
      <Link
        href="/auth/sign-in"
        onClick={(event) => {
          // Come back to this screen after signing in.
          const here = window.location.pathname + window.location.search;
          if (here === "/" || here.startsWith("/auth")) return;
          event.preventDefault();
          router.push(`/auth/sign-in?next=${encodeURIComponent(here)}`);
        }}
        className="flex h-11 items-center"
      >
        <span className="glass-chip pressable rounded-full px-3.5 py-2 font-mono text-[10.5px] font-bold tracking-[0.1em] text-ink-strong uppercase">
          Sign in
        </span>
      </Link>
    );
  } else {
    const name = profile?.username ?? auth.user.email?.split("@")[0] ?? "you";
    const status = SYNC_LABEL[sync.phase];
    content = (
      <Link href="/account" className="flex h-11 items-center" aria-label={`Your account, @${name}${status ? `. ${status.text}` : ""}`}>
        <span className="glass-chip pressable flex items-center gap-2 rounded-full py-1 pr-3 pl-1">
          <span className="relative">
            <UserAvatar username={name} avatarUrl={profile?.avatarUrl} size={28} />
            {status && (
              <span
                className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-ground ${status.dot}`}
                aria-hidden="true"
              />
            )}
          </span>
          <span className="max-w-[7.5rem] truncate font-mono text-[11px] tracking-[0.04em] text-ink-strong">@{name}</span>
        </span>
      </Link>
    );
  }

  return (
    <>
      {content}
      <RosterSync />
    </>
  );
}
