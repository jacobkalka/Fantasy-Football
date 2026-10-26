/**
 * Reading a matchup (pure; tested in matchup-analysis.test.ts). Inputs are the two lineups with
 * their canonical live points; nothing is invented:
 *
 * - Slot pairs: your starter against theirs, spot by spot in lineup order, with each side's
 *   projected finish (app estimate from ESPN's pregame projection and the time left).
 * - Advantages / disadvantages: the pairs with the biggest projected gap either way.
 * - Driving the matchup: the starters with the most points so far, on both sides.
 * - Under projection: starters whose games are over or under way and who are furthest below the
 *   share of their projection they should have by now.
 * - Still to play: starters whose games haven't started, by projection: what can still swing it.
 * - Score progression: both teams' running totals rebuilt from the real scoring plays, in the
 *   order they happened (play times from ESPN).
 */
import type { FeedItem, PlayerLive } from "@/lib/live/types";
import type { LeagueRosterEntry, LeagueSlot } from "@/lib/providers/types";
import { projectPlayer } from "./projection";

export interface Side {
  starters: { entry: LeagueRosterEntry; live: PlayerLive | undefined }[];
}

export interface SlotPair {
  slot: LeagueSlot;
  mine: { entry: LeagueRosterEntry; live: PlayerLive | undefined } | null;
  theirs: { entry: LeagueRosterEntry; live: PlayerLive | undefined } | null;
  /** Projected finish difference (yours − theirs). */
  edge: number;
}

const ORDER: LeagueSlot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST"];

function projected(x: { live: PlayerLive | undefined; entry: LeagueRosterEntry } | null): number {
  if (!x) return 0;
  if (x.live) return projectPlayer(x.live).projected;
  return x.entry.points ?? x.entry.projected ?? 0;
}

export function slotPairs(me: Side, them: Side): SlotPair[] {
  const pairs: SlotPair[] = [];
  for (const slot of ORDER) {
    const a = me.starters.filter((s) => s.entry.slot === slot);
    const b = them.starters.filter((s) => s.entry.slot === slot);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const mine = a[i] ?? null;
      const theirs = b[i] ?? null;
      pairs.push({ slot, mine, theirs, edge: Math.round((projected(mine) - projected(theirs)) * 100) / 100 });
    }
  }
  return pairs;
}

export interface MatchupReading {
  pairs: SlotPair[];
  advantages: SlotPair[];
  disadvantages: SlotPair[];
  drivers: { side: "me" | "them"; live: PlayerLive }[];
  under: { side: "me" | "them"; live: PlayerLive; expected: number }[];
  toPlay: { side: "me" | "them"; live: PlayerLive }[];
}

export function readMatchup(me: Side, them: Side): MatchupReading {
  const pairs = slotPairs(me, them);
  const lives = (side: Side, who: "me" | "them") =>
    side.starters.map((s) => s.live).filter((l): l is PlayerLive => Boolean(l)).map((live) => ({ side: who, live }));
  const all = [...lives(me, "me"), ...lives(them, "them")];

  const drivers = all
    .filter((x) => x.live.points > 0)
    .sort((a, b) => b.live.points - a.live.points)
    .slice(0, 4);
  const under = all
    .filter((x) => x.live.projection && x.live.game && x.live.game.state !== "pre")
    .map((x) => {
      const p = projectPlayer(x.live);
      const expected = (x.live.projection ?? 0) * (1 - p.remaining);
      return { ...x, expected: Math.round(expected * 100) / 100, gap: x.live.points - expected };
    })
    .filter((x) => x.gap < -3)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 4)
    .map(({ side, live, expected }) => ({ side, live, expected }));
  const toPlay = all
    .filter((x) => x.live.game?.state === "pre" && (x.live.projection ?? 0) > 0)
    .sort((a, b) => (b.live.projection ?? 0) - (a.live.projection ?? 0))
    .slice(0, 6);

  return {
    pairs,
    advantages: pairs.filter((p) => p.edge >= 2).sort((a, b) => b.edge - a.edge).slice(0, 3),
    disadvantages: pairs.filter((p) => p.edge <= -2).sort((a, b) => a.edge - b.edge).slice(0, 3),
    drivers,
    under,
    toPlay,
  };
}

export interface ProgressPoint {
  /** Device-independent time of the play (ms). */
  at: number;
  me: number;
  them: number;
}

/**
 * Both teams' running totals after each scoring play, oldest first. Plays without a time are
 * left out (their order is unknown). Official stat corrections that never appeared as a play
 * aren't in the curve; the screen's headline totals are the official ones.
 */
export function scoreProgression(feed: FeedItem[], mine: ReadonlySet<string>, theirs: ReadonlySet<string>): ProgressPoint[] {
  const plays = feed
    .filter((f) => f.kind === "points" && f.wallclock && (mine.has(f.playerId) || theirs.has(f.playerId)))
    .map((f) => ({ at: Date.parse(f.wallclock!), f }))
    .filter((x) => Number.isFinite(x.at))
    .sort((a, b) => a.at - b.at || a.f.sequence - b.f.sequence);
  const points: ProgressPoint[] = [];
  let me = 0;
  let them = 0;
  for (const { at, f } of plays) {
    if (mine.has(f.playerId)) me += f.points;
    else them += f.points;
    points.push({ at, me: Math.round(me * 100) / 100, them: Math.round(them * 100) / 100 });
  }
  return points;
}
