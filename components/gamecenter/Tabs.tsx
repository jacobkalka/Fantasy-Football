"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { TouchdownBurst } from "@/components/motion/TouchdownBurst";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { PointsBadge } from "@/components/ui/PointsBadge";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { visibleTeamColor } from "@/lib/color";
import { periodLabel } from "@/lib/format";
import type { GamePlayer, LeaderView, PlayView } from "@/lib/live/game-view";
import type { Drive, Team, TeamStat } from "@/lib/providers/types";
import { formatPoints } from "@/lib/scoring";
import { PlayerLink } from "@/components/player/PlayerLink";

function shortName(name: string) {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

function scoringLabel(play: PlayView) {
  if (play.isTouchdown) return "Touchdown";
  if (play.scoreValue === 3) return "Field goal";
  if (play.scoreValue === 2) return "Safety";
  return "Score";
}

function PlayRow({
  play,
  team,
  players,
  isNew,
}: {
  play: PlayView;
  team?: Team;
  players: Record<string, GamePlayer>;
  isNew: boolean;
}) {
  const color = visibleTeamColor(team, "#4c8dff");
  return (
    <div
      className={`relative overflow-hidden ${play.scoring ? "glass p-3.5" : "px-1 py-3"} [contain-intrinsic-size:auto_80px] [content-visibility:auto]`}
      style={play.scoring ? ({ "--glow": `${color}cc` } as React.CSSProperties) : undefined}
    >
      {isNew && <span className="arrival-flash" style={{ "--flash": `${color}55` } as React.CSSProperties} />}
      {isNew && play.isTouchdown && <TouchdownBurst color={color} />}
      <div className="flex gap-3">
        <div className="flex w-11 shrink-0 flex-col items-center gap-1 pt-0.5">
          {team && <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={22} />}
          <span className="text-[12px] text-muted">{play.clock}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {play.scoring && (
            <span className="text-[12px] font-bold text-gain">
              {scoringLabel(play)} · {play.awayScore}–{play.homeScore}
            </span>
          )}
          {play.isTurnover && !play.scoring && (
            <span className="text-[12px] font-bold text-loss">Turnover</span>
          )}
          <p className={`text-[14px] leading-snug ${play.scoring ? "text-ink" : "text-ink-soft"}`}>{play.text}</p>
          {play.fantasy.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {play.fantasy.slice(0, 3).map((f) => (
                <span
                  key={f.playerId}
                  className={`rounded-md px-1.5 py-0.5 text-[12px] ring-1 ${ f.points > 0 ? "bg-gain/10 text-gain ring-gain/30" : "bg-loss/10 text-loss ring-loss/30" }`}
                >
                  {shortName(players[f.playerId]?.name ?? "Player")} {formatPoints(f.points)}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Every play, newest first, grouped by quarter. Long games show the latest 60 until you ask for more. */
export function PlaysList({
  plays,
  teams,
  players,
  newIds,
}: {
  plays: PlayView[];
  teams: Record<string, Team>;
  players: Record<string, GamePlayer>;
  newIds: Set<string>;
}) {
  const [all, setAll] = useState(false);
  const newestFirst = [...plays].reverse();
  const visible = all ? newestFirst : newestFirst.slice(0, 60);
  if (plays.length === 0) {
    return <p className="glass px-4 py-6 text-center text-sm text-muted">No plays yet. They appear here seconds after they happen.</p>;
  }
  const groups: { period: number; plays: PlayView[] }[] = [];
  for (const play of visible) {
    const last = groups[groups.length - 1];
    if (last && last.period === play.period) last.plays.push(play);
    else groups.push({ period: play.period, plays: [play] });
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <section key={`${group.period}-${group.plays[0].id}`} className="flex flex-col gap-1">
          <h3 className="px-1 pb-1 text-[12px] text-muted">
            {group.period <= 4 ? `Quarter ${group.period}` : periodLabel(group.period)}
          </h3>
          <ul className="glass divide-y divide-line-soft overflow-hidden px-3">
            <AnimatePresence initial={false}>
              {group.plays.map((play) => (
                <motion.li
                  key={play.id}
                  layout="position"
                  initial={{ opacity: 0, y: -16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 320, damping: 30 }}
                  className={play.scoring ? "py-2" : ""}
                >
                  <PlayRow play={play} team={play.teamId ? teams[play.teamId] : undefined} players={players} isNew={newIds.has(play.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ))}
      {!all && newestFirst.length > 60 && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="glass-chip pressable self-center rounded-xl px-4 py-2 text-[12px] text-ink"
        >
          Show all {newestFirst.length} plays
        </button>
      )}
    </div>
  );
}

function resultTone(result: string) {
  const r = result.toLowerCase();
  if (r.includes("touchdown") || r === "td") return "glass-gain text-gain";
  if (r.includes("field goal") && !r.includes("missed")) return "bg-sky/15 text-sky ring-1 ring-sky/40";
  if (/(interception|fumble|downs|safety|blocked|missed)/.test(r)) return "bg-loss/10 text-loss ring-1 ring-loss/40";
  return "glass-chip text-muted";
}

/** Drive by drive, newest first. Tap one to see its plays. */
export function DrivesList({
  drives,
  plays,
  teams,
}: {
  drives: Drive[];
  plays: PlayView[];
  teams: Record<string, Team>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const byId = new Map(plays.map((p) => [p.id, p]));
  if (drives.length === 0) return <p className="glass px-4 py-6 text-center text-sm text-muted">No drives yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {[...drives].reverse().map((drive) => {
        const team = teams[drive.teamId];
        const isOpen = open === drive.id;
        const drivePlays = drive.playIds.map((id) => byId.get(id)).filter((p): p is PlayView => Boolean(p));
        return (
          <li key={drive.id} className="glass overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : drive.id)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              {team && <TeamLogo abbr={team.abbr} logo={team.logo} color={team.color} size={28} />}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-ink">{drive.description || "Drive"}</p>
                <p className="text-[12px] text-muted">
                  {periodLabel(drive.startPeriod)} {drive.startClock}
                </p>
              </div>
              <span className={`rounded-lg px-2 py-1 text-[12px] font-bold ${resultTone(drive.result)}`}>
                {drive.result}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="divide-y divide-line-soft border-t border-line-soft px-4"
                >
                  {drivePlays.map((play) => (
                    <li key={play.id} className="py-2 text-[13px] leading-snug text-ink-soft">
                      <span className="mr-2 text-[12px] text-muted">{play.clock}</span>
                      {play.text}
                    </li>
                  ))}
                  {drivePlays.length === 0 && <li className="py-2 text-[13px] text-muted">No play details.</li>}
                </motion.ul>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}

function numeric(value: string) {
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return /^[\d.]+$/.test(value.trim()) && Number.isFinite(n) ? n : null;
}

/** Team stats side by side, with a bar showing who had more. */
export function TeamStatsTable({ stats, away, home }: { stats: TeamStat[]; away: Team; home: Team }) {
  if (stats.length === 0) return <p className="glass px-4 py-6 text-center text-sm text-muted">Team stats appear once the game starts.</p>;
  return (
    <div className="glass flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <TeamLogo abbr={away.abbr} logo={away.logo} color={away.color} size={26} />
        <span className="text-[12px] text-muted">Team stats</span>
        <TeamLogo abbr={home.abbr} logo={home.logo} color={home.color} size={26} />
      </div>
      {stats.map((s) => {
        const a = numeric(s.away);
        const h = numeric(s.home);
        const share = a !== null && h !== null && a + h > 0 ? a / (a + h) : null;
        return (
          <div key={s.name + s.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xl font-bold">{s.away}</span>
              <span className="text-center text-[12px] text-muted">{s.label}</span>
              <span className="text-xl font-bold">{s.home}</span>
            </div>
            {share !== null && (
              <div className="flex h-1 gap-0.5 overflow-hidden rounded-full">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: visibleTeamColor(away) }}
                  initial={{ width: "50%" }}
                  animate={{ width: `${share * 100}%` }}
                  transition={{ type: "spring", stiffness: 100, damping: 20 }}
                />
                <div className="h-full flex-1 rounded-full" style={{ background: visibleTeamColor(home) }} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Who's scoring the most fantasy points in this game. */
export function FantasyLeaders({
  leaders,
  players,
  teams,
}: {
  leaders: LeaderView[];
  players: Record<string, GamePlayer>;
  teams: Record<string, Team>;
}) {
  if (leaders.length === 0) return <p className="glass px-4 py-6 text-center text-sm text-muted">No fantasy points yet.</p>;
  return (
    <ul className="glass divide-y divide-line-soft overflow-hidden">
      {leaders.map((leader, index) => {
        const player = players[leader.playerId];
        const team = player ? teams[player.teamId] : undefined;
        return (
          <motion.li
            key={leader.playerId}
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.03 }}
            className="flex items-center gap-3 px-4 py-3"
          >
            <span className="w-5 text-[12px] text-muted">{index + 1}</span>
            <PlayerAvatar name={player?.name ?? "Player"} headshot={player?.headshot} teamColor={visibleTeamColor(team)} size={42} />
            <div className="min-w-0 flex-1">
              <PlayerLink id={leader.playerId} className="block truncate text-[15px] font-semibold text-ink hover:underline">
                {player?.name ?? "Player"}
              </PlayerLink>
              <p className="truncate text-[12px] text-muted">{leader.summary}</p>
            </div>
            <PointsBadge points={leader.points} />
          </motion.li>
        );
      })}
    </ul>
  );
}
