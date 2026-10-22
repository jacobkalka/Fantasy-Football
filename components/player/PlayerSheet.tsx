"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useEffect, useState } from "react";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { InjuryBadge } from "@/components/player/InjuryBadge";
import { GameStatus } from "@/components/team/GameStatus";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { SectionLabel } from "@/components/ui/bits";
import { periodLabel } from "@/lib/format";
import { statLineSummary } from "@/lib/live/statline";
import type { FeedItem, PlayerLive, TeamLite } from "@/lib/live/types";
import type { NewsItem } from "@/lib/providers/types";
import { formatBreakdown, type ScoringFormat } from "@/lib/scoring";
import { visibleTeamColor } from "@/lib/color";

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

function WeekBars({ weeks, current }: { weeks: { week: number; points: number }[]; current?: number }) {
  if (weeks.length === 0) return <p className="text-sm text-muted">No games played yet this season.</p>;
  const max = Math.max(10, ...weeks.map((w) => w.points));
  return (
    <div className="flex h-24 items-end gap-1.5" role="img" aria-label={weeks.map((w) => `Week ${w.week}: ${w.points.toFixed(1)}`).join(", ")}>
      {weeks.map((w, i) => (
        <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
          <motion.div
            className={`w-full rounded-t-md ${w.week === current ? "bg-gain" : "bg-gradient-to-t from-gain/25 to-gain/70"}`}
            initial={{ height: 0 }}
            animate={{ height: `${Math.max(4, (Math.max(0, w.points) / max) * 72)}px` }}
            transition={{ type: "spring", stiffness: 140, damping: 18, delay: i * 0.04 }}
          />
          <span className="font-mono text-[9px] text-muted">{w.week}</span>
        </div>
      ))}
    </div>
  );
}

/** A glass card that slides up from the bottom. Drag it down (or tap outside) to close. */
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
  const drag = useDragControls();
  const [extra, setExtra] = useState<{ id: string; data: PlayerExtra } | null>(null);
  const id = player?.playerId;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetch(`/api/player/${id}?format=${format}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: PlayerExtra | null) => alive && data && setExtra({ id, data }))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id, format]);

  useEffect(() => {
    if (!player) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, onClose]);

  const live = player?.live;
  const team = live?.teamId ? teams[live.teamId] : undefined;
  const info = extra && extra.id === id ? extra.data : null;
  const myPlays = plays.filter((p) => p.playerId === id);

  return (
    <AnimatePresence>
      {player && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center" initial="closed" animate="open" exit="closed">
          <motion.button
            type="button"
            aria-label="Close player card"
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            variants={{ open: { opacity: 1 }, closed: { opacity: 0 } }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={player.name}
            className="glass relative max-h-[88dvh] w-full max-w-xl overflow-y-auto rounded-b-none pb-[max(env(safe-area-inset-bottom),1rem)]"
            style={{ "--glow": team ? `${team.color}aa` : "transparent" } as React.CSSProperties}
            variants={{ open: { y: 0 }, closed: { y: "100%" } }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            drag="y"
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => (info.offset.y > 120 || info.velocity.y > 600) && onClose()}
          >
            <div
              className="sticky top-0 z-10 flex cursor-grab touch-none justify-center pt-3 pb-2"
              onPointerDown={(e) => drag.start(e)}
            >
              <span className="h-1.5 w-12 rounded-full bg-white/25" />
            </div>

            <div className="flex flex-col gap-5 px-5 pb-4">
              <header className="flex items-center gap-4">
                <PlayerAvatar
                  name={player.name}
                  headshot={live?.position === "DST" ? team?.logo : player.headshot}
                  teamColor={visibleTeamColor(team)}
                  size={72}
                />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-3xl leading-none font-bold tracking-wide uppercase">{player.name}</h2>
                  <p className="mt-1 flex items-center gap-2 font-mono text-[11px] text-muted">
                    {live?.position === "DST" ? "D/ST" : live?.position} · {team?.name ?? "Free agent"}
                    <InjuryBadge status={live?.injuryStatus} long />
                  </p>
                  {live && (
                    <p className="mt-1 font-mono text-[11px]">
                      <GameStatus game={live.game} onBye={live.onBye} teams={teams} />
                    </p>
                  )}
                </div>
              </header>

              {live?.scoringSupported !== false && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="glass-chip rounded-2xl p-3">
                    <p className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">Points</p>
                    <p className="font-display text-5xl leading-none font-bold text-ink-strong">
                      <AnimatedNumber value={live?.points ?? 0} />
                    </p>
                  </div>
                  <div className="glass-chip rounded-2xl p-3">
                    <p className="font-mono text-[10px] tracking-[0.1em] text-muted uppercase">
                      {live?.game?.state === "in" ? "Estimated finish" : "Projected"}
                    </p>
                    <p className="font-display text-5xl leading-none font-bold text-ink-soft">
                      {(live?.liveProjection ?? live?.projection ?? info?.projection)?.toFixed(1) ?? "–"}
                    </p>
                  </div>
                </div>
              )}

              {live && statLineSummary(live.stats, live.position) && (
                <p className="font-mono text-[12px] leading-relaxed text-ink-soft">{statLineSummary(live.stats, live.position)}</p>
              )}

              {live && live.correction !== 0 && (
                <p className="rounded-xl bg-sky/10 px-3 py-2 text-[13px] text-sky ring-1 ring-sky/30">
                  Official stats include {live.correction > 0 ? "+" : "−"}
                  {Math.abs(live.correction).toFixed(1)} pts that the play-by-play didn&apos;t show (a stat correction or an
                  unusual play). The total uses the official number.
                </p>
              )}

              <section>
                <SectionLabel>This week&apos;s plays</SectionLabel>
                {myPlays.length === 0 ? (
                  <p className="text-sm text-muted">No point-moving plays yet.</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {myPlays.map((play) => (
                      <li key={play.id} className="glass-chip flex gap-3 rounded-2xl p-3">
                        <div className="flex flex-col items-start gap-1">
                          {play.kind === "injury" ? (
                            <span className="rounded-md bg-alert/15 px-1.5 font-mono text-[10px] font-bold text-alert ring-1 ring-alert/40">INJ</span>
                          ) : (
                            <PointsBadge points={play.points} size="sm" />
                          )}
                          <span className="font-mono text-[10px] text-muted">
                            {periodLabel(play.period)} {play.clock}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug text-ink-soft">{play.text}</p>
                          {play.parts.length > 0 && (
                            <p className="mt-1 font-mono text-[10px] text-muted">{formatBreakdown(play.parts)}</p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {info && info.weeks.length > 0 && (
                <section>
                  <SectionLabel>Season, week by week</SectionLabel>
                  <WeekBars weeks={info.weeks} current={undefined} />
                </section>
              )}

              {info?.outlook && (
                <section>
                  <SectionLabel>ESPN outlook</SectionLabel>
                  <p className="text-[14px] leading-relaxed text-ink-soft">{info.outlook}</p>
                </section>
              )}

              {info && info.news.length > 0 && (
                <section>
                  <SectionLabel>News</SectionLabel>
                  <ul className="flex flex-col gap-3">
                    {info.news.map((n) => (
                      <li key={n.id} className="text-[14px] leading-snug">
                        <p className="font-semibold text-ink-strong">
                          {n.link ? (
                            <a href={n.link} target="_blank" rel="noreferrer" className="hover:text-gain">
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
