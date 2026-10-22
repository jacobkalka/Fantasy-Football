"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { ReplayControls } from "@/components/motion/ReplayControls";
import { PlayerSheet, type SheetPlayer } from "@/components/player/PlayerSheet";
import { WeekPicker } from "@/components/team/WeekPicker";
import { Notice, Skeleton } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/Segmented";
import { useTeams } from "@/lib/hooks/useTeams";
import { useReplay } from "@/lib/hooks/useReplay";
import { useTeamLive, useWeekParam } from "@/lib/hooks/useTeamLive";
import { isKeyPlay } from "@/lib/live/play-text";
import type { FeedItem } from "@/lib/live/types";
import { roundPoints } from "@/lib/scoring";
import { FeedCard } from "./FeedCard";

const FILTERS = [
  { value: "key", label: "Key plays" },
  { value: "all", label: "All plays" },
  { value: "scoring", label: "TDs" },
  { value: "injury", label: "Injuries" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/** Feed items that weren't there on the previous update, so only those get the arrival animation. */
function useNewIds(items: FeedItem[] | undefined) {
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = items ? items.map((i) => i.id).join(",") : null;
  useEffect(() => {
    if (key === null) return;
    const ids = key ? key.split(",") : [];
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const added = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (added.length) setFresh(new Set(added));
  }, [key]);
  return fresh;
}

export function FeedList() {
  const week = useWeekParam();
  const { roster, ready, data, delayed } = useTeamLive(week);
  const teams = useTeams();
  const [filter, setFilter] = useState<Filter>("key");
  const [open, setOpen] = useState<SheetPlayer | null>(null);

  // Replay a finished week: the real plays arrive one by one, oldest first, on a sped-up clock.
  const chronological = useMemo(() => [...(data?.feed ?? [])].reverse(), [data?.feed]);
  const times = useMemo(
    () => chronological.map((i) => (i.wallclock ? Date.parse(i.wallclock) : NaN)),
    [chronological],
  );
  // A week spans hours between games, so cap the pause between plays lower than in Game Center.
  const replay = useReplay(times, { maxWaitMs: 1200 });
  const feed = replay.active ? chronological.slice(0, replay.shown).reverse() : (data?.feed ?? []);
  const fresh = useNewIds(data ? feed : undefined);
  const allTeams = { ...teams, ...data?.teams };
  const headshots = useMemo(
    () => new Map(roster.players.map((p) => [p.playerId, p.position === "DST" ? null : p.headshot])),
    [roster.players],
  );

  if (!ready) return <Skeleton className="h-40 rounded-3xl" />;
  if (roster.players.length === 0) {
    return (
      <Notice title="Nothing to follow yet">
        The feed shows every play that moves your players&apos; points.{" "}
        <Link href="/team/edit" className="text-gain underline">
          Add your players
        </Link>{" "}
        to start it.
      </Notice>
    );
  }

  const items = feed.filter((item) =>
    filter === "key"
      ? isKeyPlay(item)
      : filter === "all"
        ? true
        : filter === "scoring"
          ? item.isTouchdown
          : item.kind === "injury",
  );
  const live = data?.players.find((p) => p.playerId === open?.playerId);
  const canReplay = data !== undefined && data.week < data.currentWeek && data.feed.length > 0;
  const starters = new Set(roster.players.filter((p) => p.slot !== "BENCH").map((p) => p.playerId));
  const replayTotal = roundPoints(feed.filter((i) => starters.has(i.playerId)).reduce((sum, i) => sum + i.points, 0));
  const nextKickoff = data?.players
    .map((p) => p.game)
    .filter((g) => g?.state === "pre")
    .sort((a, b) => a!.kickoff.localeCompare(b!.kickoff))[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        {data ? <WeekPicker currentWeek={data.currentWeek} week={week} /> : <span />}
        {!replay.active && <UpdatedAgo fetchedAt={data?.fetchedAt} delayed={delayed} live={data?.anyLive} />}
      </div>
      {canReplay && !replay.active && (
        <button
          type="button"
          onClick={replay.start}
          className="glass-gain pressable self-start rounded-xl px-3.5 py-2 font-mono text-[11px] font-bold tracking-[0.1em] text-gain uppercase"
        >
          ▶ Replay week {data.week}
        </button>
      )}
      {replay.active && (
        <ReplayControls replay={replay} total={chronological.length}>
          <div className="flex items-end justify-between px-1">
            <span className="font-mono text-[11px] tracking-[0.1em] text-muted uppercase">
              Replaying week {data?.week} · starters
            </span>
            <span className="font-display text-5xl leading-none font-bold text-ink-strong">
              <AnimatedNumber value={replayTotal} />
            </span>
          </div>
        </ReplayControls>
      )}
      <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filter the feed" />

      {!data && !delayed && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28 rounded-3xl" />
          ))}
        </div>
      )}
      {delayed && !data && (
        <Notice title="Data delayed" tone="warn">
          ESPN isn&apos;t responding right now. New plays will appear as soon as it does.
        </Notice>
      )}
      {data && items.length === 0 && (
        <Notice title={filter === "all" || filter === "key" ? "No plays yet" : "Nothing here yet"}>
          {filter === "all" || filter === "key"
            ? nextKickoff
              ? "Your players haven't touched the ball yet this week. Plays appear here seconds after they happen."
              : "None of your players' plays this week moved their points."
            : filter === "scoring"
              ? "No touchdowns from your players yet this week."
              : "No in-game injury reports for your players this week."}
        </Notice>
      )}

      <ul className="flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.li
              key={item.id}
              layout="position"
              initial={{ opacity: 0, y: -24, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
            >
              <FeedCard
                item={item}
                team={item.teamId ? allTeams[item.teamId] : undefined}
                headshot={headshots.get(item.playerId) ?? (item.teamId ? allTeams[item.teamId]?.logo ?? null : null)}
                isNew={fresh.has(item.id)}
                onOpenPlayer={() =>
                  setOpen({ playerId: item.playerId, name: item.playerName, headshot: headshots.get(item.playerId) ?? null })
                }
              />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <PlayerSheet
        player={open ? { ...open, live } : null}
        plays={data?.feed ?? []}
        teams={allTeams}
        format={roster.format}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
