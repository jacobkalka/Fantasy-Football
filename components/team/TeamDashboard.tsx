"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { UpdatedAgo } from "@/components/live/UpdatedAgo";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TiltCard } from "@/components/motion/TiltCard";
import { PlayerSheet, type SheetPlayer } from "@/components/player/PlayerSheet";
import { Notice, SectionLabel, Skeleton } from "@/components/ui/bits";
import { Sparkline } from "@/components/ui/Sparkline";
import { useTeams } from "@/lib/hooks/useTeams";
import { useTeamLive, useWeekParam } from "@/lib/hooks/useTeamLive";
import type { FeedItem, PlayerLive } from "@/lib/live/types";
import { isStarter, sortLineup } from "@/lib/roster/lineup";
import { roundPoints } from "@/lib/scoring";
import { PlayerRow } from "./PlayerRow";
import { WeekPicker } from "./WeekPicker";

const FORMAT_LABEL = { standard: "Standard", half: "Half PPR", ppr: "PPR" } as const;

/** Running total of a set of players' points, play by play, oldest first. */
function momentum(feed: FeedItem[], ids: Set<string>) {
  let total = 0;
  const values = [0];
  for (const item of [...feed].reverse()) {
    if (item.kind !== "points" || !ids.has(item.playerId)) continue;
    total += item.points;
    values.push(roundPoints(total));
  }
  return values;
}

function EmptyTeam() {
  return (
    <TiltCard className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
      <motion.div
        className="font-display text-7xl leading-none font-bold text-gain [text-shadow:0_0_40px_rgb(200_255_46/0.5)]"
        animate={{ rotateY: [0, 18, 0, -18, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        style={{ transform: "translateZ(40px)" }}
        aria-hidden="true"
      >
        0.0
      </motion.div>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Build your team</h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Search for your players and pick your league&apos;s scoring. Every play that moves their points shows up here
          live, in plain English.
        </p>
      </div>
      <Link
        href="/team/edit"
        transitionTypes={["nav-forward"]}
        className="glass-gain pressable rounded-2xl px-6 py-3 font-mono text-[12px] font-bold tracking-[0.12em] text-gain uppercase"
        style={{ transform: "translateZ(30px)" }}
      >
        Add players
      </Link>
    </TiltCard>
  );
}

export function TeamDashboard() {
  const week = useWeekParam();
  const { roster, ready, data, delayed } = useTeamLive(week);
  const teams = useTeams();
  const [open, setOpen] = useState<SheetPlayer | null>(null);
  const allTeams = { ...teams, ...data?.teams };

  const byId = new Map<string, PlayerLive>((data?.players ?? []).map((p) => [p.playerId, p]));
  const lineup = sortLineup(roster.players);
  const starters = lineup.filter(isStarter);
  const bench = lineup.filter((p) => !isStarter(p));
  const starterIds = new Set(starters.map((p) => p.playerId));

  if (!ready) return <Skeleton className="h-64 rounded-3xl" />;
  if (roster.players.length === 0) return <EmptyTeam />;

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
            sum + (allDone ? (p.projection ?? 0) : p.game?.state === "post" ? p.points : (p.liveProjection ?? p.projection ?? p.points)),
          0,
        ),
      )
    : null;
  const feed = data?.feed ?? [];

  const row = (p: (typeof lineup)[number]) => (
    <motion.li key={p.playerId} layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
      <PlayerRow
        slot={p.slot}
        name={p.name}
        headshot={p.headshot}
        live={byId.get(p.playerId)}
        momentum={momentum(feed, new Set([p.playerId]))}
        teams={allTeams}
        onOpen={() => setOpen({ playerId: p.playerId, name: p.name, headshot: p.headshot, live: byId.get(p.playerId) })}
      />
    </motion.li>
  );

  return (
    <div className="flex flex-col gap-5">
      <TiltCard className="glass flex flex-col gap-3 p-5" max={6}>
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.08em] text-muted uppercase">
          <span className="truncate">
            {roster.name} · {FORMAT_LABEL[roster.format]}
          </span>
          <UpdatedAgo fetchedAt={data?.fetchedAt} delayed={delayed} live={data?.anyLive} />
        </div>
        <div className="flex items-end justify-between gap-4" style={{ transform: "translateZ(36px)" }}>
          <span className="font-display text-[84px] leading-[0.8] font-bold text-ink-strong drop-shadow-[0_4px_24px_rgb(200_255_46/0.3)]">
            {data ? <AnimatedNumber value={total} /> : "–"}
          </span>
          {feed.length > 0 && <Sparkline values={momentum(feed, starterIds)} width={110} height={44} />}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted uppercase">
          {projected !== null && (
            <span>
              {playing > 0 ? "Est" : allDone ? "Projected" : "Proj"} <span className="text-ink">{projected.toFixed(1)}</span>
            </span>
          )}
          <span>
            Playing <span className={playing ? "text-gain" : "text-ink"}>{playing}</span>
          </span>
          <span>
            Yet to play <span className="text-ink">{toPlay}</span>
          </span>
        </div>
      </TiltCard>

      <div className="flex items-center justify-between gap-3">
        {data ? <WeekPicker currentWeek={data.currentWeek} week={week} /> : <span />}
        <Link
          href="/team/edit"
          transitionTypes={["nav-forward"]}
          className="glass-chip pressable shrink-0 rounded-xl px-4 py-2 font-mono text-[11px] tracking-[0.1em] text-ink uppercase"
        >
          Edit team
        </Link>
      </div>

      {delayed && !data && (
        <Notice title="Data delayed" tone="warn">
          ESPN isn&apos;t responding right now. Your points will appear as soon as it does.
        </Notice>
      )}

      <section>
        <SectionLabel>Starters</SectionLabel>
        <ul className="flex flex-col gap-2.5">{starters.map(row)}</ul>
      </section>

      {bench.length > 0 && (
        <section>
          <SectionLabel>Bench</SectionLabel>
          <ul className="flex flex-col gap-2.5 opacity-85">{bench.map(row)}</ul>
        </section>
      )}

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
