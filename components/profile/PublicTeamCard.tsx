"use client";

import { PlayerLink } from "@/components/player/PlayerLink";
import { TeamBadge } from "@/components/teams/TeamBadge";
import { pts } from "@/lib/format";
import { useTeams } from "@/lib/hooks/useTeams";
import type { PublicTeam } from "@/lib/profiles/public-teams";

const SLOT_LABEL: Record<string, string> = { DST: "D/ST", BENCH: "BN" };

/** One team someone chose to show: only the details they switched on are there to show. */
export function PublicTeamCard({ team, primary = false, hiddenNote = false }: { team: PublicTeam; primary?: boolean; hiddenNote?: boolean }) {
  const nflTeams = useTeams();
  const starters = team.roster?.filter((p) => p.slot !== "BENCH") ?? [];
  const bench = team.roster?.filter((p) => p.slot === "BENCH") ?? [];
  const meta = [team.leagueName, team.leagueName && team.season ? String(team.season) : null, team.scoringLabel].filter(Boolean).join(" · ");

  const list = (title: string, players: typeof starters) =>
    players.length > 0 && (
      <div>
        <p className="mb-1 text-[12px] font-medium text-faint">{title}</p>
        <ul className="flex flex-col">
          {players.map((p) => (
            <li key={`${p.slot}-${p.id}`}>
              <PlayerLink id={p.id} className="flex min-h-10 items-center gap-3 rounded-lg px-1 hover:bg-raised">
                <span className="w-8 shrink-0 text-[11px] font-semibold text-faint">{SLOT_LABEL[p.slot] ?? p.slot}</span>
                <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
                <span className="shrink-0 text-[12px] text-faint">
                  {p.position === "DST" ? "D/ST" : p.position} · {p.teamId ? (nflTeams[p.teamId]?.abbr ?? "") : "FA"}
                </span>
              </PlayerLink>
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <article className="card flex flex-col gap-4 p-4 lg:p-5">
      <header className="flex items-center gap-3">
        <TeamBadge name={team.name} logo={team.logoUrl} size={44} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold">{team.name}</span>
            {primary && <span className="shrink-0 rounded-full bg-well px-2 py-0.5 text-[11px] font-medium text-muted">Primary</span>}
          </p>
          {meta && <p className="truncate text-[13px] text-muted">{meta}</p>}
        </div>
        {team.record && (
          <span className="tabular shrink-0 text-right">
            <span className="block text-[18px] leading-6 font-semibold">{team.record}</span>
            <span className="block text-[11px] text-faint">Record</span>
          </span>
        )}
      </header>
      {team.matchup && (
        <p className="well flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
          <span className="min-w-0 truncate text-muted">
            Week {team.matchup.week} vs {team.matchup.opponent}
          </span>
          <span className="tabular shrink-0 font-semibold">
            {pts(team.matchup.points)} <span className="text-faint">–</span> {pts(team.matchup.opponentPoints)}
          </span>
        </p>
      )}
      {list("Lineup", starters)}
      {list("Bench", bench)}
      {!team.roster && <p className="text-[13px] text-muted">The roster isn&apos;t shared.</p>}
      {hiddenNote && !team.isVisible && <p className="text-[13px] text-warning">Hidden from your profile.</p>}
    </article>
  );
}
