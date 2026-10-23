"use client";

import { useState } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { Reveal } from "@/components/motion/Reveal";
import { PlayerSheet, type SheetPlayer } from "@/components/player/PlayerSheet";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton, SkeletonRows } from "@/components/ui/States";
import { usePreference } from "@/lib/hooks/usePreference";
import { useTeams } from "@/lib/hooks/useTeams";
import { useTeamLive, useWeekParam } from "@/lib/hooks/useTeamLive";
import type { PlayerLive } from "@/lib/live/types";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { roundPoints } from "@/lib/scoring";
import { LineupField } from "./LineupField";
import { PlayerRow } from "./PlayerRow";
import { WeekPicker } from "./WeekPicker";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

const VIEWS = [
  { value: "list", label: "List" },
  { value: "field", label: "Field" },
] as const;

/** The same frame as the loaded screen, with grey bars, so nothing jumps when data arrives. */
function LineupSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your team">
      <Card>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-3 h-10 w-28" />
        <Skeleton className="mt-3 h-4 w-56" />
      </Card>
      <Card>
        <SkeletonRows rows={9} height={64} />
      </Card>
    </div>
  );
}

export function TeamDashboard() {
  const week = useWeekParam();
  const { roster, ready, data, delayed } = useTeamLive(week);
  const teams = useTeams();
  const [open, setOpen] = useState<SheetPlayer | null>(null);
  const [view, setView] = usePreference<"field" | "list">("lineup-view", "list");
  const allTeams = { ...teams, ...data?.teams };

  const byId = new Map<string, PlayerLive>((data?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = sortLineup(roster.players);
  const starters = lineup.filter(isStarter);
  const bench = lineup.filter((p) => !isStarter(p));

  if (!ready) return <LineupSkeleton />;
  if (roster.players.length === 0) {
    return (
      <EmptyState
        title="Add your team to see it here"
        icon="team"
        action={{ label: "Add players", href: "/team/edit" }}
      >
        Search for your players and pick your league&apos;s scoring. Every play that moves their points shows up live.
        Your team is saved on this device, and to your account if you sign in.
      </EmptyState>
    );
  }

  const startersLive = starters.map((p) => byId.get(p.playerId)).filter((p): p is PlayerLive => Boolean(p));
  const total = roundPoints(startersLive.reduce((sum, p) => sum + p.points, 0));
  const playing = startersLive.filter((p) => p.game?.state === "in").length;
  const toPlay = startersLive.filter((p) => p.game?.state === "pre").length;
  const allDone = playing === 0 && toPlay === 0;
  // Mid-week: where we're headed (points banked + estimates). After the games: what was projected.
  const projected = startersLive.some((p) => p.projection !== null)
    ? roundPoints(
        startersLive.reduce(
          (sum, p) =>
            sum +
            (allDone
              ? (p.projection ?? 0)
              : p.game?.state === "post"
                ? p.points
                : (p.liveProjection ?? p.projection ?? p.points)),
          0,
        ),
      )
    : null;
  const feed = data?.feed ?? [];
  const openPlayer = (p: (typeof lineup)[number]) =>
    setOpen({ playerId: p.playerId, name: p.name, headshot: p.headshot, live: byId.get(p.playerId) });

  const rows = (players: typeof lineup) => (
    <ul className="-mx-2 flex flex-col divide-y divide-rule">
      {players.map((p) => (
        <li key={p.playerId}>
          <PlayerRow
            slot={p.slot}
            name={p.name}
            headshot={p.headshot}
            live={byId.get(p.playerId)}
            teams={allTeams}
            onOpen={() => openPlayer(p)}
          />
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="min-w-0 truncate text-[14px] text-muted">
            {roster.name.trim() || "My Team"} · {FORMAT_LABEL[roster.format]}
          </p>
          <UpdatedAgo fetchedAt={data?.fetchedAt} delayed={delayed} live={data?.anyLive} />
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[40px] leading-[44px] font-semibold tracking-[-0.02em]">
              {data ? <AnimatedNumber value={total} /> : <Skeleton className="h-10 w-28" />}
              <span className="ml-1.5 text-[15px] font-normal tracking-normal text-faint">pts</span>
            </p>
            <p className="tabular mt-1 text-[14px] text-muted">
              {projected !== null && (
                <>
                  {playing > 0 ? "On pace for" : allDone ? "Projected" : "Projected"}{" "}
                  <span className="text-ink">{projected.toFixed(1)}</span>
                  {" · "}
                </>
              )}
              <span className={playing ? "text-positive" : undefined}>{playing} playing</span> · {toPlay} yet to play
            </p>
          </div>
          {data && <WeekPicker currentWeek={data.currentWeek} week={week} />}
        </div>
      </Card>

      {delayed && !data && (
        <ErrorState what="ESPN isn't responding right now. Your points will appear as soon as it does." />
      )}

      <Reveal className="flex flex-col gap-4" stagger={false}>
        <Card>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-[16px] leading-6 font-semibold">Starters</h2>
            <Segmented options={VIEWS} value={view} onChange={setView} label="Lineup view" size="sm" />
          </div>
          {view === "field" ? (
            <LineupField starters={starters} live={byId} teams={allTeams} onOpen={openPlayer} />
          ) : (
            rows(starters)
          )}
        </Card>

        {bench.length > 0 && (
          <Card>
            <h2 className="mb-2 text-[16px] leading-6 font-semibold">Bench</h2>
            {rows(bench)}
          </Card>
        )}

        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/team/edit" icon="edit">
            Edit roster
          </ButtonLink>
          <ButtonLink href="/start-sit" icon="swap">
            Start/Sit help
          </ButtonLink>
        </div>
      </Reveal>

      <PlayerSheet
        player={open ? { ...open, live: byId.get(open.playerId) } : null}
        plays={feed}
        teams={allTeams}
        format={roster.format}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
