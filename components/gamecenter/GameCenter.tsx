"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { Segmented } from "@/components/ui/Segmented";
import { periodLabel } from "@/lib/format";
import { usePoll } from "@/lib/hooks/usePoll";
import { REPLAY_SPEEDS, useReplay } from "@/lib/hooks/useReplay";
import type { GameView, LeaderView } from "@/lib/live/game-view";
import type { Team } from "@/lib/providers/types";
import { useRoster } from "@/lib/roster/store";
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
  const { roster } = useRoster();
  const [tab, setTab] = useState<Tab>("plays");
  const format = roster.format;
  const { data, delayed } = usePoll<GameView>(`/api/games/${initial.game.id}?format=${format}`, {
    initial: format === initial.format ? initial : undefined,
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
        {replay.active ? <span /> : <UpdatedAgo fetchedAt={view.fetchedAt} delayed={delayed} live={game.state === "in"} />}
        {game.state === "post" && view.plays.length > 0 && !replay.active && (
          <button
            type="button"
            onClick={replay.start}
            className="glass-gain pressable rounded-xl px-3.5 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-gain uppercase"
          >
            ▶ Replay game
          </button>
        )}
      </div>

      {replay.active && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass flex flex-wrap items-center gap-2 p-3"
        >
          <button
            type="button"
            onClick={replay.toggle}
            disabled={replay.done}
            className="glass-chip pressable flex size-11 items-center justify-center rounded-xl text-lg text-ink disabled:opacity-40"
            aria-label={replay.playing ? "Pause replay" : "Play replay"}
          >
            {replay.playing ? "❚❚" : "▶"}
          </button>
          <Segmented
            options={REPLAY_SPEEDS}
            value={replay.speed}
            onChange={replay.setSpeed}
            label="Replay speed"
            className="flex-1"
          />
          <button
            type="button"
            onClick={replay.skipToEnd}
            className="glass-chip pressable rounded-xl px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] text-ink uppercase"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={replay.stop}
            className="glass-chip pressable rounded-xl px-3 py-2.5 font-mono text-[10px] tracking-[0.1em] text-muted uppercase"
          >
            Exit
          </button>
          <div className="h-1 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-gain"
              animate={{ width: `${(replay.shown / Math.max(1, view.plays.length)) * 100}%` }}
              transition={{ ease: "linear", duration: 0.3 }}
            />
          </div>
        </motion.div>
      )}

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
