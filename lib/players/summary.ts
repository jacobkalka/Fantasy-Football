/**
 * The Player Summary: 2-4 plain sentences, built by rules (no AI). Every number
 * in it was computed in lib/players/analysis.ts; nothing is guessed. When there
 * aren't enough games, it says so.
 */
import type { Position } from "@/lib/providers/types";
import { rulesForFormat, scoreStatLine } from "@/lib/scoring";
import { fixed, ordinal, percent, ratio } from "./math";
import { FORMAT_LABEL, SAMPLE } from "./rules";
import { injuryText } from "./signals";
import type { PlayerAnalysis, PlayerProfile } from "./types";
import type { SeasonNumbers } from "./usage";

const POSITION_WORD: Record<Position, string> = {
  QB: "quarterback",
  RB: "running back",
  WR: "wide receiver",
  TE: "tight end",
  K: "kicker",
  DST: "team defense",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function identity(profile: PlayerProfile): string {
  const bio = profile.bio;
  const pos = profile.position ? POSITION_WORD[profile.position] : bio?.sourcePosition || "player";
  const team = profile.team?.name ? `the ${profile.team.name}` : null;
  if (!bio) return team ? `${profile.name} plays ${pos} for ${team}.` : `${profile.name} is a ${pos}.`;
  const age = bio.age ? `${bio.age}-year-old ` : "";
  const where = team ? `for ${team}` : "who is currently a free agent";
  const season = bio.nflSeason === 1 ? ", a rookie" : bio.nflSeason ? `, in his ${ordinal(bio.nflSeason)} NFL season` : "";
  const d = bio.draft;
  const draft = d
    ? d.round === 1
      ? `the No. ${d.pick} overall pick in ${d.year}`
      : `a ${ordinal(d.round)}-round pick (No. ${d.pick} overall) in ${d.year}`
    : null;
  const origin = draft
    ? `; he was ${draft}${bio.college ? `, out of ${bio.college}` : ""}`
    : bio.college
      ? `; he played college football at ${bio.college}`
      : "";
  return `${profile.name} is a ${age}${pos} ${where}${season}${origin}.`;
}

function production(profile: PlayerProfile, a: Omit<PlayerAnalysis, "summary">, n: SeasonNumbers): string {
  const fmt = FORMAT_LABEL[a.format];
  const subject = profile.kind === "dst" ? `The ${profile.name}` : "He";
  if (!profile.position) {
    return `${profile.bio?.sourcePosition || "His position"} isn't a fantasy position here (only QB, RB, WR, TE, K and team D/ST score), so there are no fantasy numbers for him.`;
  }
  const played = a.games.filter((g) => g.points !== null);
  if (played.length === 0) {
    const last = profile.fantasy.seasonTotals.find((t) => t.season === profile.season - 1);
    const lastText = last
      ? ` Last season ${profile.kind === "dst" ? "it" : "he"} averaged ${fixed(scoreStatLine(last.stats, rulesForFormat(a.format)).total / last.gamesPlayed)} ${fmt} points in ${plural(last.gamesPlayed, "game")}.`
      : "";
    const missed = a.sample.gamesMissed > 0 ? `, missing all ${a.sample.gamesMissed} of his team's games so far` : "";
    return `${subject} hasn't played a game this season${missed}.${lastText}`;
  }
  if (played.length < SAMPLE.minGames) {
    const list = played.map((g) => fixed(g.points)).join(" and ");
    return `${subject} has played only ${plural(played.length, "game")} (${list} ${fmt} points), not enough games yet to judge.`;
  }
  const c = a.consistency;
  const missed = a.sample.gamesMissed > 0 ? ` (${profile.kind === "dst" ? "it" : "he"} missed ${a.sample.gamesMissed})` : "";
  const range = c ? `, ranging from ${fixed(c.floor)} to ${fixed(c.ceiling)}` : "";
  const useful =
    c && profile.position
      ? `; ${c.usefulGames} of the ${played.length} reached ${c.thresholds.useful}+ points, a useful ${profile.position === "DST" ? "D/ST" : profile.position} week`
      : "";
  const lead = profile.kind === "dst" ? `${subject} is` : "He's";
  return `${lead} averaging ${fixed(a.totals.average)} ${fmt} points over ${plural(n.games, "game")}${missed}${range}${useful}.`;
}

function role(profile: PlayerProfile, a: Omit<PlayerAnalysis, "summary">, n: SeasonNumbers): string | null {
  if (n.games === 0) return null;
  const pg = (v: number) => fixed(ratio(v, n.games));
  switch (profile.position) {
    case "QB": {
      const runs = ratio(n.get("rushAtt"), n.games) ?? 0;
      const run = runs >= 3 ? ` and runs ${fixed(runs)} times a game for ${pg(n.get("rushYds"))} yards` : "";
      return `He throws ${pg(n.get("passAtt"))} passes a game at ${fixed(ratio(n.get("passYds"), n.get("passAtt")))} yards per attempt${run}.`;
    }
    case "RB":
      return `He's getting ${pg(n.get("rushAtt"))} carries and ${pg(n.get("targets"))} targets a game, at ${fixed(ratio(n.get("rushYds"), n.get("rushAtt")))} yards per carry.`;
    case "WR":
    case "TE": {
      const targets = n.get("targets");
      if (targets === 0) return "He hasn't been targeted this season.";
      const depth = profile.advanced.avgDepthOfTarget !== null ? `, on targets an average of ${fixed(profile.advanced.avgDepthOfTarget)} yards downfield` : "";
      return `He's seeing ${pg(targets)} targets a game and catching ${percent(ratio(n.get("rec"), targets))} of them for ${fixed(ratio(n.get("recYds"), targets))} yards per target${depth}.`;
    }
    case "K": {
      const att = n.get("fgAtt");
      const fifty = n.get("fgMade50_59") + n.get("fgMade60");
      const long = fifty > 0 ? `, ${fifty} from 50+ yards` : "";
      return att === 0
        ? `He hasn't tried a field goal yet and has made ${n.get("xpMade")} of ${n.get("xpAtt")} extra points.`
        : `He has made ${n.get("fgMade")} of ${att} field goals (${percent(ratio(n.get("fgMade"), att))})${long}, and ${n.get("xpMade")} of ${n.get("xpAtt")} extra points.`;
    }
    case "DST":
      return `It's averaging ${pg(n.get("dstSack"))} sacks and ${pg(n.get("dstInt") + n.get("dstFumRec"))} takeaways a game while allowing ${pg(n.get("dstPa"))} points a game (ESPN's fantasy count).`;
    default:
      return null;
  }
}

/** Signal ids in the order they're worth a sentence. */
const RATES = ["tdPerTarget", "tdPerCarry", "tdPerAttempt", "yardsPerTarget", "yardsPerCarry", "yardsPerAttempt", "fgPct"];
const SIGNAL_PRIORITY = [
  "tdPerTarget-hot",
  "tdPerCarry-hot",
  "tdPerAttempt-hot",
  "td-dependent",
  "points-without-volume",
  "volume-without-points",
  "yardsPerTarget-hot",
  "yardsPerCarry-hot",
  "yardsPerAttempt-hot",
  "fgPct-hot",
  "volume-up",
  "volume-down",
  ...RATES.map((r) => `${r}-cold`),
  ...RATES.map((r) => `${r}-above`),
  ...RATES.map((r) => `${r}-below`),
  "volume-driven",
  "vs-projection",
  ...RATES.map((r) => `${r}-normal`),
  "no-track-record",
];

function outlook(profile: PlayerProfile, a: Omit<PlayerAnalysis, "summary">): string | null {
  const injury = injuryText(profile);
  if (a.sample.gamesPlayed < SAMPLE.minGames) return injury;
  for (const id of SIGNAL_PRIORITY) {
    const signal = a.signals.find((s) => s.id === id);
    if (signal) return signal.text;
  }
  return injury;
}

export function playerSummary(profile: PlayerProfile, a: Omit<PlayerAnalysis, "summary">, n: SeasonNumbers): string {
  const sentences = [
    profile.kind === "dst" ? null : identity(profile),
    production(profile, a, n),
    role(profile, a, n),
    outlook(profile, a),
  ].filter((s): s is string => Boolean(s));
  // An injured starter's status matters more than a trend: make sure it's in, within 4 sentences.
  const injury = injuryText(profile);
  if (injury && !sentences.includes(injury)) {
    if (sentences.length >= 4) sentences[3] = injury;
    else sentences.push(injury);
  }
  return sentences.slice(0, 4).join(" ");
}
