/**
 * "Is this production sustainable?" Rules-based observations, each tied to his
 * own numbers: touchdown dependence, efficiency vs his career before this season,
 * volume trends, how often he beat ESPN's projection, injuries and missed games.
 */
import type { InjuryStatus } from "@/lib/providers/types";
import { fixed, percent, shortDate } from "./math";
import { FORMAT_LABEL, SAMPLE, TD_SHARE, VS_CAREER } from "./rules";
import type { PlayerAnalysis, PlayerProfile, Signal } from "./types";
import type { SeasonNumbers } from "./usage";
import type { StatKey } from "@/lib/stats";

type Draft = Omit<PlayerAnalysis, "summary" | "signals" | "labels">;

const STATUS_PHRASE: Partial<Record<InjuryStatus, string>> = {
  QUESTIONABLE: "lists him as questionable",
  DOUBTFUL: "lists him as doubtful",
  OUT: "lists him as out",
  INJURY_RESERVE: "has him on injured reserve",
  SUSPENSION: "lists him as suspended",
  DAY_TO_DAY: "lists him as day-to-day",
};

/** "ESPN has him on injured reserve (hamstring); its estimated return date is Nov 25." */
export function injuryText(profile: PlayerProfile): string | null {
  const status = profile.fantasy.injuryStatus;
  const phrase = status ? STATUS_PHRASE[status] : undefined;
  if (!phrase) return null;
  const injury = profile.bio?.injuries[0];
  const part = injury?.type ? ` (${injury.type.toLowerCase()})` : "";
  const back = (status === "INJURY_RESERVE" || status === "OUT") && injury?.returnDate ? shortDate(injury.returnDate) : null;
  return `ESPN ${phrase}${part}${back ? `; its estimated return date is ${back}` : ""}.`;
}

/** His totals before this season (the baseline for "is this normal for him?"). */
export function careerBaseline(profile: PlayerProfile): ((key: StatKey) => number) | null {
  const prior = profile.career.filter((s) => s.season < profile.season);
  if (!prior.length) return null;
  return (key) => prior.reduce((total, s) => total + (s.stats[key] ?? 0), 0);
}

interface Comparison {
  id: keyof typeof VS_CAREER;
  num: StatKey;
  den: StatKey;
  asPercent: boolean;
  /** "touchdown rate per target" */
  what: string;
  /** Said when he's far above his norm / far below it. */
  hotNote: string;
  coldNote: string;
}

const REGRESSION = "rates that far above a player's norm usually come back down.";
const TD_PER_TARGET: Comparison = { id: "tdPerTarget", num: "recTd", den: "targets", asPercent: true, what: "touchdown rate per target", hotNote: REGRESSION, coldNote: "there's room for more touchdowns if his role holds." };
const YARDS_PER_TARGET: Comparison = { id: "yardsPerTarget", num: "recYds", den: "targets", asPercent: false, what: "yards per target", hotNote: "efficiency that far above his norm tends to cool off.", coldNote: "well below his norm." };
const TD_PER_CARRY: Comparison = { id: "tdPerCarry", num: "rushTd", den: "rushAtt", asPercent: true, what: "touchdown rate per carry", hotNote: REGRESSION, coldNote: "there's room for more touchdowns if his role holds." };
const YARDS_PER_CARRY: Comparison = { id: "yardsPerCarry", num: "rushYds", den: "rushAtt", asPercent: false, what: "yards per carry", hotNote: "efficiency that far above his norm tends to cool off.", coldNote: "well below his norm." };
const TD_PER_ATTEMPT: Comparison = { id: "tdPerAttempt", num: "passTd", den: "passAtt", asPercent: true, what: "touchdown rate per pass", hotNote: REGRESSION, coldNote: "there's room for more touchdowns." };
const YARDS_PER_ATTEMPT: Comparison = { id: "yardsPerAttempt", num: "passYds", den: "passAtt", asPercent: false, what: "yards per pass", hotNote: "efficiency that far above his norm tends to cool off.", coldNote: "well below his norm." };
const FG_PCT: Comparison = { id: "fgPct", num: "fgMade", den: "fgAtt", asPercent: true, what: "field-goal rate", hotNote: "hard to keep up.", coldNote: "well below his norm." };
const COMPARISONS: Record<string, Comparison[]> = {
  WR: [TD_PER_TARGET, YARDS_PER_TARGET],
  TE: [TD_PER_TARGET, YARDS_PER_TARGET],
  RB: [TD_PER_CARRY, YARDS_PER_CARRY, TD_PER_TARGET],
  QB: [TD_PER_ATTEMPT, YARDS_PER_ATTEMPT],
  K: [FG_PCT],
};

/**
 * This season vs his career before it (VS_CAREER in rules.ts): far above ("hot",
 * caution: likely to come down), far below ("cold"), somewhat above/below, or in line.
 */
export function careerComparisons(profile: PlayerProfile, n: SeasonNumbers): Signal[] {
  const base = careerBaseline(profile);
  if (!base || !profile.position) return [];
  const out: Signal[] = [];
  for (const c of COMPARISONS[profile.position] ?? []) {
    const rule = VS_CAREER[c.id];
    const seasonDen = n.get(c.den);
    const careerDen = base(c.den);
    if (seasonDen < rule.season || careerDen < rule.career) continue;
    const now = n.get(c.num) / seasonDen;
    const before = base(c.num) / careerDen;
    const show = (v: number) => (c.asPercent ? percent(v, 1) : fixed(v));
    const vs = `His ${c.what} is ${show(now)} this season vs ${show(before)} over his career before this season`;
    const r = before > 0 ? now / before : now > 0 ? Infinity : 1;
    if (r >= rule.hot) out.push({ id: `${c.id}-hot`, tone: "caution", text: `${vs}: ${c.hotNote}` });
    else if (r <= rule.cold) out.push({ id: `${c.id}-cold`, tone: "neutral", text: `${vs}: ${c.coldNote}` });
    else if (Math.abs(r - 1) <= rule.near) {
      out.push({ id: `${c.id}-normal`, tone: "positive", text: `His ${c.what} (${show(now)}) is in line with his career before this season (${show(before)}).` });
    } else out.push({ id: `${c.id}-${r > 1 ? "above" : "below"}`, tone: "neutral", text: `${vs}, somewhat ${r > 1 ? "above" : "below"} his norm.` });
  }
  return out;
}

export function sustainabilitySignals(profile: PlayerProfile, a: Draft, n: SeasonNumbers, tdShare: number | null): Signal[] {
  const out: Signal[] = [];
  const dst = profile.kind === "dst";
  const he = dst ? "It" : "He";
  const his = dst ? "its" : "his";
  const games = n.games;

  const injury = injuryText(profile);
  if (injury) out.push({ id: "injury", tone: "caution", text: injury });

  if (games === 0) {
    out.push({ id: "no-games", tone: "neutral", text: `${he} hasn't played this season, so there's nothing to judge yet.` });
    return out;
  }
  if (games < SAMPLE.minGames) {
    out.push({ id: "tiny-sample", tone: "neutral", text: `Only ${games} game${games === 1 ? "" : "s"} played: too early to tell whether this will last.` });
  }
  if (a.sample.gamesMissed > 0) {
    const teamGames = games + a.sample.gamesMissed;
    out.push({ id: "missed", tone: "neutral", text: `${he} has missed ${a.sample.gamesMissed} of ${his} team's ${teamGames} games this season.` });
  }

  if (!dst && profile.position !== "K" && games >= SAMPLE.minGames && tdShare !== null) {
    if (tdShare >= TD_SHARE.dependent) {
      out.push({ id: "td-dependent", tone: "caution", text: `${percent(tdShare)} of his ${FORMAT_LABEL[a.format]} points came from touchdowns, which swing far more from week to week than yards and catches.` });
    } else if (tdShare <= TD_SHARE.volume) {
      out.push({ id: "volume-driven", tone: "positive", text: `Only ${percent(tdShare)} of his ${FORMAT_LABEL[a.format]} points came from touchdowns; yards and catches carry his scoring, which tends to hold up.` });
    }
  }

  if (!dst && games >= SAMPLE.minGames) {
    if (careerBaseline(profile)) out.push(...careerComparisons(profile, n));
    // Only a true rookie lacks a track record; an empty career table otherwise means it didn't load.
    else if (profile.bio?.nflSeason === 1) {
      out.push({ id: "no-track-record", tone: "neutral", text: "He has no NFL seasons before this one to compare with, so there's no track record to show whether this pace is normal for him." });
    }
  }

  const points = a.trends.find((t) => t.id === "points");
  const volume = a.trends.find((t) => t.id !== "points");
  if (points && volume) {
    if (points.direction === "up" && volume.direction !== "up") {
      out.push({ id: "points-without-volume", tone: "caution", text: `${his[0].toUpperCase()}${his.slice(1)} scoring is up over the last 3 games (${fixed(points.last3)} vs ${fixed(points.season)}) without more ${volume.label} (${fixed(volume.last3)} vs ${fixed(volume.season)}), so efficiency or touchdowns are doing the work.` });
    } else if (points.direction === "down" && volume.direction === "up") {
      out.push({ id: "volume-without-points", tone: "positive", text: `${his[0].toUpperCase()}${his.slice(1)} points are down over the last 3 games but ${his} ${volume.label} are up (${fixed(volume.last3)} a game vs ${fixed(volume.season)}), a sign the production can come back.` });
    } else if (volume.direction === "up") {
      out.push({ id: "volume-up", tone: "positive", text: `${his[0].toUpperCase()}${his.slice(1)} ${volume.label} are rising: ${fixed(volume.last3)} a game over the last 3 vs ${fixed(volume.season)} for the season.` });
    } else if (volume.direction === "down") {
      out.push({ id: "volume-down", tone: "caution", text: `${his[0].toUpperCase()}${his.slice(1)} ${volume.label} are falling: ${fixed(volume.last3)} a game over the last 3 vs ${fixed(volume.season)} for the season.` });
    }
  }

  const beat = a.consistency?.beatProjection;
  if (beat) {
    const share = beat.beat / beat.games;
    out.push({
      id: "vs-projection",
      tone: share >= 0.6 ? "positive" : share <= 0.4 ? "caution" : "neutral",
      text:
        share <= 0.4
          ? `${he} fell short of ESPN's pregame projection in ${beat.games - beat.beat} of ${beat.games} games.`
          : `${he} beat ESPN's pregame projection in ${beat.beat} of ${beat.games} games.`,
    });
  }
  return out;
}
