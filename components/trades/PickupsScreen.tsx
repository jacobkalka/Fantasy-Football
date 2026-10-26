"use client";

import { useSearchParams } from "next/navigation";
import { PlayerChip } from "@/components/player/PlayerChip";
import { Pill } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { useTeamAnalysis } from "@/lib/hooks/useTeamAnalysis";
import { useTeams } from "@/lib/hooks/useTeams";
import { setQueryParams } from "@/lib/nav/query";
import type { Position } from "@/lib/providers/types";
import { settingsActions, useSettings } from "@/lib/settings/store";
import { teamsActions } from "@/lib/teams/store";

const FILTERS = [
  { value: "ALL", label: "All" },
  { value: "QB", label: "QB" },
  { value: "RB", label: "RB" },
  { value: "WR", label: "WR" },
  { value: "TE", label: "TE" },
  { value: "K", label: "K" },
  { value: "DST", label: "D/ST" },
] as const;

/**
 * "Who should I pick up?" for the active team: available players who'd make your team better,
 * how much (rating change), where they'd play, and who you'd drop. With an ESPN league connected,
 * "available" means not on any team in your league; otherwise it's an estimate from ESPN's % rostered.
 */
export function PickupsScreen() {
  const params = useSearchParams();
  const filter = (FILTERS.find((f) => f.value === params.get("pos"))?.value ?? "ALL") as Position | "ALL";
  const a = useTeamAnalysis({ pickups: true });
  const teams = useTeams();
  const { value: settings } = useSettings();

  if (a.team.players.length === 0) {
    return <EmptyState title="Add your team first" icon="team" action={{ label: "Connect an ESPN league", href: "/team/connect" }} />;
  }
  if (a.error && !a.universe) return <ErrorState what="Couldn't load player projections." onRetry={a.refresh} />;

  const list = a.pickups?.pickups.filter((p) => filter === "ALL" || p.player.position === filter) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4">
        <Segmented options={FILTERS} value={filter} onChange={(v) => setQueryParams({ pos: v === "ALL" ? null : v })} label="Position" size="sm" />
      </div>
      {!a.pickups ? (
        <div className="flex flex-col gap-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-[22px]" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState title={filter === "ALL" ? "No pickup would help right now" : `No ${filter} pickup would help right now`} icon="check">
          Every available player we checked would leave your team about where it is. Check back after the waiver run, or look at{" "}
          <a href="/team/trades" className="text-accent underline">
            trade ideas
          </a>
          .
        </EmptyState>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {list.map((p) => {
            const watched = settings.watchlist.includes(p.player.id);
            return (
              <li key={p.player.id} className="card flex flex-col gap-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <PlayerChip player={p.player} teams={teams} figure={p.player.perGame} figureLabel="per game" size={44} />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[12px]">
                  <Pill tone={p.kind === "starter" ? "accent" : "neutral"}>{p.kind === "starter" ? `Starts at ${p.spot === "DST" ? "D/ST" : p.spot}` : "Depth"}</Pill>
                  {p.atWeakSpot && <Pill tone="warning">Fills a weak spot</Pill>}
                  <span className="tabular font-semibold text-positive">
                    +{p.ratingChange.toFixed(1)} rating ({p.ratingBefore.toFixed(1)} → {p.ratingAfter.toFixed(1)})
                  </span>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-5 text-muted">
                  {p.reasons.slice(0, 3).map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-faint">
                  <span>{p.availability}</span>
                  <span className="flex gap-3">
                    <button type="button" className="font-medium text-accent hover:underline" onClick={() => settingsActions.toggleWatch(p.player.id)}>
                      {watched ? "Tracking" : "Track"}
                    </button>
                    {!a.knownRosters && (
                      <button
                        type="button"
                        className="font-medium text-muted hover:text-ink"
                        onClick={() => teamsActions.toggleTaken(a.team.id, p.player.id)}
                      >
                        Already taken
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {a.pickups && <p className="text-[12px] text-faint">{a.pickups.method}</p>}
    </div>
  );
}
