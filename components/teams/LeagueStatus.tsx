"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { useLeague, type LeagueError } from "@/lib/fantasy/context";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";

/**
 * Is the ESPN connection healthy? One line: which league, when it last refreshed, and the fix
 * when something's wrong (private league → connect ESPN; expired login → reconnect).
 */
export function LeagueStatus({ className = "" }: { className?: string }) {
  const { team, data, error, receivedAt } = useLeague();
  const now = useNow(15_000);
  if (!team.espn) return null;
  const code = (error ? (data ? null : "espn-down") : null) as LeagueError["code"] | null;
  const message = error ?? "";
  const privateProblem = /private|connect/i.test(message) && !data;
  const expired = /expired/i.test(message) && !data;
  const healthy = Boolean(data);
  return (
    <div className={`flex flex-wrap items-center gap-2 text-[12px] ${className}`}>
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 ${healthy ? "bg-white/[0.05] text-muted" : "bg-warning-soft text-warning"}`}>
        <Icon name={healthy ? "link" : "alert"} size={14} />
        {team.espn.leagueName} · ESPN
        {healthy && receivedAt && now ? ` · synced ${agoLabel(now - receivedAt)}` : ""}
      </span>
      {!healthy && (expired || privateProblem) && (
        <Link href={`/team/connect?league=${team.espn.leagueId}`} className="font-medium text-accent hover:underline">
          {expired ? "Reconnect ESPN" : "Connect ESPN to see this private league"}
        </Link>
      )}
      {!healthy && !expired && !privateProblem && code && <span className="text-warning">{message || "Can't reach ESPN right now."}</span>}
    </div>
  );
}
