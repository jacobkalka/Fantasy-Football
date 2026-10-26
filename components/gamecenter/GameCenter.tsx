"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { ReplayControls } from "@/components/motion/ReplayControls";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Segmented } from "@/components/ui/Segmented";
import { periodLabel } from "@/lib/format";
import { usePoll } from "@/lib/hooks/usePoll";
import { useReplay } from "@/lib/hooks/useReplay";
import type { GameView, LeaderView } from "@/lib/live/game-view";
import type { Team } from "@/lib/providers/types";
import { specOf } from "@/lib/fantasy/context";
import { specQuery } from "@/lib/scoring/spec";
import { useActiveTeam } from "@/lib/teams/store";
import { roundPoints } from "@/lib/scoring";
import { FieldBar, WinProbabilityBar } from "./Bars";
import { Scorebug, scoreStateFor, type ScoreState } from "./Scorebug";
import { DrivesList, FantasyLeaders, PlaysList, TeamStatsTable } from "./Tabs";

const TABS = [
  { value: "plays", label: "Plays" },
  { value: "drives", label: "Drives" },
  { value: "stats", label: "Box score" },
  { value: "fantasy", label: "Fantasy" },
] as const;
type Tab = (typeof TABS)[number]["value"];

function interval(view: GameView | undefined) {
  if (!view) return 30_000;
  if (view.game.state === "in") return 6_000;
  if (view.game.state === "pre") return 60_000;
  return 10 * 60_000;
}

/** Plays that weren't on screen a moment ago, so only they get the arrival animation. */
function useNewPlayIds(ids: string[]) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join(",");
  useEffect(() => {
    const list = key ? key.split(",") : [];
    if (seen.current === null) {
      seen.current = new Set(list);
      return;
    }
    const added = list.filter((id) => !seen.current!.has(id));
    list.forEach((id) => seen.current!.add(id));
    if (added.length) setFresh(new Set(added));
  }, [key]);
  return fresh;
}

export function GameCenter({ initial }: { initial: GameView }) {
  const { team } = useActiveTeam();
  const [tab, setTab] = useState<Tab>("plays");
  const spec = specOf(team);
  const format = spec.format;
  // Scored with the active team's rules (a league's own scoring included).
  const { data, error, receivedAt } = usePoll<GameView & { servedAt?: string }>(`/api/games/${initial.game.id}?${specQuery(spec)}`, {
    initial: format === initial.format && !spec.rules ? initial : undefined,
    intervalMs: interval,
  });
  const view = data ?? initial;
  const { game } = view;

  const times = useMemo(() => view.plays.map((p) => (p.wallclock ? Date.parse(p.wallclock) : NaN)), [view.plays]);
  const replay = useReplay(times);
  const plays = replay.active ? view.plays.slice(0, replay.shown) : view.plays;
  const fresh = useNewPlayIds(plays.map((p) => p.id));

  const teams: Record<string, Team> = { [game.home.team.id]: game.home.team, [game.away.team.id]: game.away.team };

  // During a replay the header follows the replayed plays, not the final result.
  const last = plays[plays.length - 1];
  const state: ScoreState = replay.active
    ? {
        awayScore: last?.awayScore ?? 0,
        homeScore: last?.homeScore ?? 0,
        status: replay.done ? "Final" : last ? `${periodLabel(last.period)} ${last.clock}` : "Kickoff",
        live: !replay.done,
        replay: true,
        possessionTeamId: last?.teamId,
        isRedZone: false,
      }
    : scoreStateFor(game);
  const homeWinPct = replay.active
    ? ([...plays].reverse().find((p) => p.homeWinPct !== undefined)?.homeWinPct ?? 0.5)
    : view.homeWinPct;

  // Replay leaders come from the plays revealed so far.
  const leaders: LeaderView[] = replay.active
    ? Object.entries(
        plays.reduce<Record<string, number>>((acc, p) => {
          for (const f of p.fantasy) acc[f.playerId] = (acc[f.playerId] ?? 0) + f.points;
          return acc;
        }, {}),
      )
        .map(([playerId, points]) => ({ playerId, points: roundPoints(points), summary: "" }))
        .sort((a, b) => b.points - a.points)
        .slice(0, 10)
    : view.leaders;

  return (
    <div className="flex flex-col gap-4">
      <Scorebug game={game} state={state} />

      <div className="flex items-center justify-between gap-3 px-1">
        {replay.active ? <span /> : <UpdatedAgo stamps={data} receivedAt={receivedAt} error={error} live={game.state === "in"} />}
        <div className="flex items-center gap-2">
          <ButtonLink href={`/chat/game-${game.id}`} size="sm" icon="chat">
            Game chat
          </ButtonLink>
          {game.state === "post" && view.plays.length > 0 && !replay.active && (
            <Button size="sm" icon="refresh" onClick={replay.start}>
              Replay game
            </Button>
          )}
        </div>
      </div>

      {replay.active && <ReplayControls replay={replay} total={view.plays.length} />}

      {homeWinPct !== null && game.state !== "pre" && (
        <WinProbabilityBar away={game.away.team} home={game.home.team} homeWinPct={homeWinPct} />
      )}
      {view.field && !replay.active && <FieldBar away={game.away.team} home={game.home.team} field={view.field} />}

      <Segmented options={TABS} value={tab} onChange={setTab} label="Game Center section" />

      {tab === "plays" && <PlaysList plays={plays} teams={teams} players={view.players} newIds={fresh} />}
      {tab === "drives" && <DrivesList drives={replay.active ? [] : view.drives} plays={view.plays} teams={teams} />}
      {tab === "stats" && <TeamStatsTable stats={replay.active ? [] : view.teamStats} away={game.away.team} home={game.home.team} />}
      {tab === "fantasy" && <FantasyLeaders leaders={leaders} players={view.players} teams={teams} />}
    </div>
  );
}
