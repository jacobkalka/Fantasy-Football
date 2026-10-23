"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import { canFill, sortLineup, type RosterPlayer } from "@/lib/roster/lineup";
import { decodeTeam } from "@/lib/roster/share";
import { rosterActions, useRoster } from "@/lib/roster/store";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

/** Shows what's in a team link and lets you load it onto this device (replacing what's here, if anything). */
export function ImportTeam() {
  const params = useSearchParams();
  const router = useRouter();
  const shared = useMemo(() => decodeTeam(params.get("t") ?? ""), [params]);
  const { players, error, retry } = usePlayers(Boolean(shared));
  const teams = useTeams();
  const { roster, ready } = useRoster();

  const matched = useMemo(() => {
    if (!shared || !players) return null;
    const byId = new Map(players.map((p) => [p.id, p]));
    const found: RosterPlayer[] = [];
    let missing = 0;
    for (const { playerId, slot } of shared.players) {
      const p = byId.get(playerId);
      if (!p) {
        missing++;
        continue;
      }
      found.push({
        playerId,
        name: p.name,
        position: p.position,
        teamId: p.teamId,
        headshot: p.headshot,
        slot: canFill(slot, p.position) ? slot : "BENCH",
      });
    }
    return { found: sortLineup(found), missing };
  }, [shared, players]);

  if (!shared) {
    return (
      <EmptyState title="This team link doesn't work" icon="alert" action={{ label: "Go to your team", href: "/team" }}>
        It may have been cut off when it was copied. Ask for the link again.
      </EmptyState>
    );
  }
  if (error) return <ErrorState what="Couldn't load player details to open this team." onRetry={retry} />;
  if (!matched || !ready) {
    return (
      <Card>
        <SkeletonRows rows={6} />
      </Card>
    );
  }

  const replacing = roster.players.length > 0;
  const apply = () => {
    rosterActions.replace({
      version: 1,
      name: shared.name || "My Team",
      format: shared.format,
      players: matched.found,
      updatedAt: new Date().toISOString(),
    });
    router.push("/team");
  };

  return (
    <Card>
      <h2 className="text-[16px] leading-6 font-semibold">{shared.name || "My Team"}</h2>
      <p className="mt-0.5 text-[14px] text-muted">
        {matched.found.length} players · {FORMAT_LABEL[shared.format]}
        {matched.missing > 0 && ` · ${matched.missing} no longer listed by ESPN (skipped)`}
      </p>
      <ul className="-mx-2 mt-3 flex flex-col divide-y divide-rule">
        {matched.found.map((p) => {
          const team = p.teamId ? teams[p.teamId] : undefined;
          return (
            <li key={p.playerId} className="flex min-h-12 items-center gap-3 px-2 py-1.5">
              <span className="w-10 text-[12px] font-medium text-faint">{p.slot === "BENCH" ? "BN" : p.slot}</span>
              <PlayerAvatar
                name={p.name}
                headshot={p.position === "DST" ? team?.logo : p.headshot}
                teamColor={visibleTeamColor(team)}
                size={32}
              />
              <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
              <span className="text-[13px] text-muted">{team?.abbr ?? "FA"}</span>
            </li>
          );
        })}
      </ul>
      {replacing && (
        <p className="mt-4 rounded-xl bg-warning-soft px-4 py-3 text-[14px] text-warning">
          This replaces the team saved on this device ({roster.players.length} players, “{roster.name || "My Team"}”).
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" size="lg" onClick={apply}>
          {replacing ? "Replace my team" : "Use this team"}
        </Button>
        <ButtonLink href="/team" variant="quiet" size="lg">
          Cancel
        </ButtonLink>
      </div>
    </Card>
  );
}
