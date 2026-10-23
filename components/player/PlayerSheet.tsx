"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { GameStatus } from "@/components/team/GameStatus";
import { ButtonLink } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Card";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { periodLabel } from "@/lib/format";
import { statLineSummary } from "@/lib/live/statline";
import type { FeedItem, PlayerLive, TeamLite } from "@/lib/live/types";
import { gsap, MOTION, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import type { NewsItem } from "@/lib/providers/types";
import { formatBreakdown, type ScoringFormat } from "@/lib/scoring";

interface PlayerExtra {
  outlook: string | null;
  projection: number | null;
  weeks: { week: number; points: number }[];
  news: NewsItem[];
}

export interface SheetPlayer {
  playerId: string;
  name: string;
  headshot: string | null;
  live?: PlayerLive;
}

/** Fantasy points by week this season: one hue, square bars from a zero line, the week under each. */
function WeekBars({ weeks }: { weeks: { week: number; points: number }[] }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-bar]", { scaleY: 0, transformOrigin: "bottom", duration: MOTION.slow, stagger: 0.03, ease: "power3.out" });
    },
    { scope: root },
  );
  if (weeks.length === 0) return <p className="text-[14px] text-muted">No games played yet this season.</p>;
  const max = Math.max(10, ...weeks.map((w) => w.points));
  const best = Math.max(...weeks.map((w) => w.points));
  return (
    <div
      ref={root}
      className="flex h-28 items-end gap-1.5 border-b border-line"
      role="img"
      aria-label={weeks.map((w) => `Week ${w.week}: ${w.points.toFixed(1)} points`).join(", ")}
    >
      {weeks.map((w) => (
        <div key={w.week} className="relative flex h-full flex-1 flex-col items-center justify-end">
          <span className="tabular mb-1 text-[11px] text-faint">{w.points.toFixed(0)}</span>
          <div
            data-bar=""
            className={`w-full max-w-7 rounded-t-[3px] ${w.points === best ? "bg-accent" : "bg-well"}`}
            style={{ height: `${Math.max(3, (Math.max(0, w.points) / max) * 76)}px` }}
          />
          <span className="absolute -bottom-5 text-[11px] text-faint">{w.week}</span>
        </div>
      ))}
    </div>
  );
}

/** A player's card for this week: points, projection, this week's plays, season by week, outlook and news. */
export function PlayerSheet({
  player,
  plays,
  teams,
  format,
  onClose,
}: {
  player: SheetPlayer | null;
  plays: FeedItem[];
  teams: Record<string, TeamLite>;
  format: ScoringFormat;
  onClose: () => void;
}) {
  const [extra, setExtra] = useState<{ id: string; data: PlayerExtra } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // Keep showing the last player while the sheet animates closed.
  const [shown, setShown] = useState<SheetPlayer | null>(player);
  if (player && player !== shown && (player.playerId !== shown?.playerId || player.live !== shown?.live)) setShown(player);
  const id = shown?.playerId;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/player/${id}?format=${format}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: PlayerExtra) => alive && setExtra({ id, data }))
      .catch(() => alive && setFailed(id));
    return () => {
      alive = false;
    };
  }, [id, format]);

  const live = shown?.live;
  const team = live?.teamId ? teams[live.teamId] : undefined;
  const info = extra && extra.id === id ? extra.data : null;
  const myPlays = plays.filter((p) => p.playerId === id);
  const summary = live ? statLineSummary(live.stats, live.position) : "";

  return (
    <Sheet open={Boolean(player)} onClose={onClose} title={shown?.name ?? "Player"} hideTitle size="md">
      {shown && (
        <div className="flex flex-col gap-6">
          <header className="flex items-center gap-4">
            <PlayerAvatar
              name={shown.name}
              headshot={live?.position === "DST" ? team?.logo : shown.headshot}
              teamColor={visibleTeamColor(team)}
              size={64}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[20px] leading-7 font-semibold" aria-hidden="true">
                {shown.name}
              </p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[13px] text-muted">
                {live?.position === "DST" ? "D/ST" : live?.position} · {team?.name ?? "Free agent"}
                <InjuryBadge status={live?.injuryStatus} long />
              </p>
              {live && (
                <p className="mt-0.5 text-[13px]">
                  <GameStatus game={live.game} onBye={live.onBye} teams={teams} />
                </p>
              )}
            </div>
          </header>

          {live?.scoringSupported !== false && (
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-inner)] bg-line">
              <div className="bg-raised p-4">
                <p className="text-[13px] text-muted">Points this week</p>
                <p className="text-[28px] leading-9 font-semibold">
                  <AnimatedNumber value={live?.points ?? 0} />
                </p>
              </div>
              <div className="bg-raised p-4">
                <p className="text-[13px] text-muted">{live?.game?.state === "in" ? "Estimated finish" : "Projected"}</p>
                <p className="tabular text-[28px] leading-9 font-semibold text-muted">
                  {(live?.game?.state === "in" ? live.liveProjection : (live?.projection ?? info?.projection))?.toFixed(1) ?? "–"}
                </p>
              </div>
            </div>
          )}

          {summary && <p className="text-[14px] leading-5 text-muted">{summary}</p>}

          {live && live.correction !== 0 && (
            <p className="rounded-xl bg-accent-soft px-4 py-3 text-[14px] leading-5 text-accent">
              Official stats include {live.correction > 0 ? "+" : "−"}
              {Math.abs(live.correction).toFixed(1)} pts that the play-by-play didn&apos;t show (a stat correction or an
              unusual play). The total uses the official number.
            </p>
          )}

          <section>
            <h3 className="mb-2 text-[15px] font-semibold">This week&apos;s plays</h3>
            {myPlays.length === 0 ? (
              <p className="text-[14px] text-muted">No point-moving plays yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-rule">
                {myPlays.map((play) => (
                  <li key={play.id} className="flex gap-3 py-3">
                    <div className="flex w-16 shrink-0 flex-col items-start gap-1">
                      {play.kind === "injury" ? <Pill tone="warning">Injury</Pill> : <PointsBadge points={play.points} size="sm" />}
                      <span className="tabular text-[12px] text-faint">
                        {periodLabel(play.period)} {play.clock}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] leading-5">{play.text}</p>
                      {play.parts.length > 0 && <p className="mt-0.5 text-[12px] text-faint">{formatBreakdown(play.parts)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-[15px] font-semibold">Season, week by week</h3>
            {info ? (
              <div className="pb-5">
                <WeekBars weeks={info.weeks} />
              </div>
            ) : failed === id ? (
              <p className="text-[14px] text-muted">Couldn&apos;t load this player&apos;s season. Try again in a minute.</p>
            ) : (
              <Skeleton className="h-28 w-full" />
            )}
          </section>

          {info?.outlook && (
            <section>
              <h3 className="mb-1.5 text-[15px] font-semibold">ESPN outlook</h3>
              <p className="text-[14px] leading-6 text-muted">{info.outlook}</p>
            </section>
          )}

          {info && info.news.length > 0 && (
            <section>
              <h3 className="mb-2 text-[15px] font-semibold">News</h3>
              <ul className="flex flex-col gap-3">
                {info.news.map((n) => (
                  <li key={n.id} className="text-[14px] leading-5">
                    <p className="font-medium">
                      {n.link ? (
                        <a href={n.link} target="_blank" rel="noreferrer" className="hover:underline">
                          {n.headline}
                        </a>
                      ) : (
                        n.headline
                      )}
                    </p>
                    {n.description && n.description !== n.headline && (
                      <p className="mt-0.5 line-clamp-3 text-[13px] text-muted">{n.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {live?.position !== "DST" && (
            <ButtonLink href={`/players/${shown.playerId}`} variant="secondary" iconRight="chevronRight" className="self-start">
              Full profile
            </ButtonLink>
          )}
        </div>
      )}
    </Sheet>
  );
}
