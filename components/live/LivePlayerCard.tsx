"use client";

import { useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { PlayerLink } from "@/components/player/PlayerLink";
import { GameStatus } from "@/components/team/GameStatus";
import { Possession } from "@/components/team/Possession";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { visibleTeamColor } from "@/lib/color";
import { projectPlayer } from "@/lib/fantasy/projection";
import { periodLabel, pts, signedPts } from "@/lib/format";
import type { FeedItem, PlayerLive, TeamLite } from "@/lib/live/types";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import { formatBreakdown } from "@/lib/scoring";

/** Points from plays in the last `minutes` of real time (the "live trend"). */
export function recentPoints(plays: FeedItem[], now: number, minutes = 20): number | null {
  if (!now) return null;
  const since = now - minutes * 60_000;
  const recent = plays.filter((p) => p.kind === "points" && p.wallclock && Date.parse(p.wallclock) >= since);
  if (recent.length === 0) return null;
  return Math.round(recent.reduce((s, p) => s + p.points, 0) * 100) / 100;
}

/**
 * A player in the Live tracker views: points to the hundredth, ESPN's projection, how much of it
 * he's scored, his game and who has the ball, his recent scoring, and an expandable list of
 * every play that earned his points (newest first). The name and photo open his profile.
 */
export function LivePlayerCard({
  player,
  plays,
  teams,
  headshot,
  slot,
  now,
  action,
}: {
  player: PlayerLive;
  plays: FeedItem[];
  teams: Record<string, TeamLite>;
  headshot: string | null;
  slot?: string;
  now: number;
  /** A trailing control (remove from tracker). */
  action?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const chevron = useRef<HTMLSpanElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const team = player.teamId ? teams[player.teamId] : undefined;
  const proj = projectPlayer(player);
  const share = player.projection ? player.points / player.projection : null;
  const trend = player.game?.state === "in" ? recentPoints(plays, now) : null;
  const scoring = plays.filter((p) => p.kind === "points");

  const { contextSafe } = useGSAP({ scope: root });
  const animate = (next: boolean) => {
    const el = panel.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      gsap.set(el, { height: next ? "auto" : 0, autoAlpha: next ? 1 : 0 });
      return;
    }
    gsap.to(chevron.current, { rotation: next ? 180 : 0, duration: MOTION.base, ease: "power2.out" });
    if (next) {
      gsap.fromTo(el, { height: 0, autoAlpha: 0 }, { height: "auto", autoAlpha: 1, duration: MOTION.base, ease: "power3.out" });
      gsap.from(el.querySelectorAll("[data-play]"), { y: 8, yPercent: 0, autoAlpha: 0, duration: MOTION.base, stagger: 0.035, ease: "power2.out", delay: 0.05 });
    } else {
      gsap.to(el, { height: 0, autoAlpha: 0, duration: MOTION.fast, ease: "power2.in" });
    }
  };
  const toggle = () => {
    const next = !open;
    setOpen(next);
    // Created in an event handler, so it's wrapped to be cleaned up with the component (gsap-react skill).
    contextSafe(animate)(next);
  };

  return (
    <div ref={root} className="card overflow-hidden">
      <div className="flex items-center gap-3 p-3.5">
        {slot && <span className="w-8 shrink-0 text-[11px] font-semibold text-faint">{slot}</span>}
        <PlayerLink id={player.playerId} className="shrink-0" label={`Open ${player.name}`}>
          <PlayerAvatar name={player.name} headshot={headshot} teamColor={visibleTeamColor(team)} size={44} />
        </PlayerLink>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <PlayerLink id={player.playerId} className="truncate text-[15px] font-semibold hover:underline">
              {player.name}
            </PlayerLink>
            <InjuryBadge status={player.injuryStatus} />
          </div>
          <p className="truncate text-[12px]">
            <GameStatus game={player.game} onBye={player.onBye} teams={teams} />
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Possession game={player.game} position={player.position} />
            {trend !== null && (
              <span className={`tabular rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${trend >= 0 ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative"}`}>
                {signedPts(trend)} last 20 min
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[22px] leading-7 font-semibold tracking-[-0.01em]">
            <AnimatedNumber value={player.points} />
          </span>
          <span className="tabular text-[11px] text-faint">
            {player.game?.state === "in" ? `est ${pts(proj.projected)}` : `proj ${pts(player.projection)}`}
          </span>
        </div>
        {action}
      </div>
      {share !== null && player.game && (
        <div className="flex items-center gap-2 px-3.5 pb-2 text-[11px] text-muted">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-well" aria-hidden="true">
            <span
              className={`block h-full rounded-full ${share >= 1 ? "bg-positive" : "bg-accent"}`}
              style={{ width: `${Math.min(100, Math.max(0, share * 100))}%` }}
            />
          </span>
          <span className="tabular">{Math.round(share * 100)}% of ESPN&apos;s {pts(player.projection)}</span>
        </div>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-t border-white/[0.06] px-3.5 py-2.5 text-left text-[13px] text-muted hover:bg-white/[0.03] hover:text-ink"
      >
        <span className="flex-1">
          {scoring.length ? `${scoring.length} scoring ${scoring.length === 1 ? "play" : "plays"}` : "No scoring plays yet"}
        </span>
        <span ref={chevron} className="inline-flex">
          <Icon name="chevronDown" size={16} />
        </span>
      </button>
      <div ref={panel} className="h-0 overflow-hidden opacity-0" style={{ visibility: "hidden" }}>
        <ul className="flex flex-col divide-y divide-rule px-3.5 pb-3">
          {plays.length === 0 && <li className="py-2 text-[13px] text-faint">Plays show up here seconds after they happen.</li>}
          {plays.map((p) => (
            <li key={p.id} data-play="" className="flex gap-3 py-2">
              <div className="flex w-[70px] shrink-0 flex-col items-start gap-1">
                {p.kind === "injury" ? (
                  <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">Injury</span>
                ) : (
                  <PointsBadge points={p.points} size="sm" />
                )}
                <span className="tabular text-[11px] text-faint">
                  {periodLabel(p.period)} {p.clock}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] leading-5 text-ink-soft">
                  {p.isTouchdown && <span className="font-semibold text-accent">TD · </span>}
                  {p.text}
                </p>
                {p.parts.length > 0 && <p className="mt-0.5 text-[11px] text-faint">{formatBreakdown(p.parts)}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
