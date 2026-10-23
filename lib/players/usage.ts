/**
 * Usage and efficiency by position, from the season's played games. Every metric
 * says what it was computed from; a metric with no volume behind it is "—".
 */
import type { PlayerAdvancedStats, PlayerGame, PlayerSplits, Position } from "@/lib/providers/types";
import type { StatKey, StatLine } from "@/lib/stats";
import { fixed, metric, percent, ratio, sum } from "./math";
import type { Metric } from "./types";

/** Adds up the stat lines of the games he played. */
export function seasonLine(games: PlayerGame[]): StatLine {
  const line: StatLine = {};
  for (const g of games) {
    if (!g.played) continue;
    for (const [key, value] of Object.entries(g.stats) as [StatKey, number][]) {
      line[key] = (line[key] ?? 0) + value;
    }
  }
  return line;
}

/** The season numbers usage is built from, so labels, trends and the summary reuse them. */
export interface SeasonNumbers {
  games: number;
  line: StatLine;
  get: (key: StatKey) => number;
  perGame: (key: StatKey) => number | null;
  /** Times sacked: tracking total, else the game logs, else unknown. */
  sacked: number | null;
  /** Longest made field goal this season. */
  longFg: number | null;
}

export function seasonNumbers(games: PlayerGame[], advanced: PlayerAdvancedStats): SeasonNumbers {
  const played = games.filter((g) => g.played);
  const line = seasonLine(played);
  const get = (key: StatKey) => line[key] ?? 0;
  const sackedInLogs = played.map((g) => g.extras.sacked).filter((n): n is number => n !== undefined);
  const longs = played.map((g) => g.extras.longFg).filter((n): n is number => n !== undefined);
  return {
    games: played.length,
    line,
    get,
    perGame: (key) => ratio(get(key), played.length),
    sacked: advanced.sacked ?? (sackedInLogs.length ? sum(sackedInLogs) : null),
    longFg: longs.length ? Math.max(...longs) : null,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function receiving(n: SeasonNumbers, out: Metric[]) {
  const targets = n.get("targets");
  const rec = n.get("rec");
  const yds = n.get("recYds");
  const games = plural(n.games, "game");
  out.push(
    metric("targetsPerGame", "Targets a game", n.perGame("targets"), fixed(n.perGame("targets")), `${targets} targets in ${games}`),
    metric("receptionsPerGame", "Catches a game", n.perGame("rec"), fixed(n.perGame("rec")), `${rec} catches`),
    metric("catchRate", "Catch rate", ratio(rec, targets), percent(ratio(rec, targets)), `${rec} of ${targets} targets`),
    metric("yardsPerTarget", "Yards per target", ratio(yds, targets), fixed(ratio(yds, targets)), `${yds} yards on ${targets} targets`),
    metric("yardsPerReception", "Yards per catch", ratio(yds, rec), fixed(ratio(yds, rec)), `${yds} yards on ${rec} catches`),
    metric("receivingYardsPerGame", "Receiving yards a game", n.perGame("recYds"), fixed(n.perGame("recYds"))),
    metric("receivingTd", "Receiving TDs", n.get("recTd"), String(n.get("recTd"))),
    metric("tdPerTarget", "TD rate (per target)", ratio(n.get("recTd"), targets), percent(ratio(n.get("recTd"), targets), 1), `${n.get("recTd")} TDs on ${targets} targets`),
  );
}

function rushing(n: SeasonNumbers, out: Metric[]) {
  const carries = n.get("rushAtt");
  const yds = n.get("rushYds");
  out.push(
    metric("carriesPerGame", "Carries a game", n.perGame("rushAtt"), fixed(n.perGame("rushAtt")), `${carries} carries in ${plural(n.games, "game")}`),
    metric("yardsPerCarry", "Yards per carry", ratio(yds, carries), fixed(ratio(yds, carries)), `${yds} yards on ${carries} carries`),
    metric("rushingYardsPerGame", "Rushing yards a game", n.perGame("rushYds"), fixed(n.perGame("rushYds"))),
    metric("rushingTd", "Rushing TDs", n.get("rushTd"), String(n.get("rushTd"))),
  );
}

/** Usage and efficiency, by position. Empty when he hasn't played. */
export function usageMetrics(position: Position | null, n: SeasonNumbers): Metric[] {
  if (n.games === 0) return [];
  const out: Metric[] = [];
  switch (position) {
    case "QB": {
      const att = n.get("passAtt");
      const cmp = n.get("passCmp");
      const dropbacks = n.sacked === null ? null : att + n.sacked;
      out.push(
        metric("passAttemptsPerGame", "Pass attempts a game", n.perGame("passAtt"), fixed(n.perGame("passAtt")), `${att} attempts in ${plural(n.games, "game")}`),
        metric("completionPct", "Completion rate", ratio(cmp, att), percent(ratio(cmp, att)), `${cmp} of ${att}`),
        metric("yardsPerAttempt", "Yards per attempt", ratio(n.get("passYds"), att), fixed(ratio(n.get("passYds"), att)), `${n.get("passYds")} yards`),
        metric("passingYardsPerGame", "Passing yards a game", n.perGame("passYds"), fixed(n.perGame("passYds"))),
        metric("passTdRate", "TD rate (per attempt)", ratio(n.get("passTd"), att), percent(ratio(n.get("passTd"), att), 1), `${n.get("passTd")} TD passes`),
        metric("intRate", "Interception rate", ratio(n.get("passInt"), att), percent(ratio(n.get("passInt"), att), 1), `${n.get("passInt")} interceptions`),
        metric(
          "sackRate",
          "Sack rate",
          dropbacks === null ? null : ratio(n.sacked ?? 0, dropbacks),
          dropbacks === null ? "—" : percent(ratio(n.sacked ?? 0, dropbacks), 1),
          n.sacked === null ? undefined : `${n.sacked} sacks on ${dropbacks} dropbacks`,
        ),
        metric("rushesPerGame", "Runs a game", n.perGame("rushAtt"), fixed(n.perGame("rushAtt"))),
        metric("rushingYardsPerGame", "Rushing yards a game", n.perGame("rushYds"), fixed(n.perGame("rushYds"))),
        metric("rushingTd", "Rushing TDs", n.get("rushTd"), String(n.get("rushTd"))),
      );
      break;
    }
    case "RB": {
      const opportunities = n.get("rushAtt") + n.get("targets");
      const touches = n.get("rushAtt") + n.get("rec");
      out.push(
        metric("opportunitiesPerGame", "Carries + targets a game", ratio(opportunities, n.games), fixed(ratio(opportunities, n.games)), `${opportunities} in ${plural(n.games, "game")}`),
        metric("touchesPerGame", "Touches a game", ratio(touches, n.games), fixed(ratio(touches, n.games)), "carries + catches"),
      );
      rushing(n, out);
      receiving(n, out);
      break;
    }
    case "WR":
    case "TE":
      receiving(n, out);
      if (n.get("rushAtt") > 0) {
        out.push(metric("carries", "Carries", n.get("rushAtt"), String(n.get("rushAtt")), `${n.get("rushYds")} rushing yards`));
      }
      break;
    case "K": {
      const made = n.get("fgMade");
      const att = n.get("fgAtt");
      const band = (id: string, label: string, madeKey: StatKey, missKey: StatKey) => {
        const m = n.get(madeKey);
        const a = m + n.get(missKey);
        return metric(id, label, ratio(m, a), a ? `${m}/${a}` : "0/0");
      };
      out.push(
        metric("fgAttemptsPerGame", "Field-goal tries a game", n.perGame("fgAtt"), fixed(n.perGame("fgAtt")), `${att} in ${plural(n.games, "game")}`),
        metric("fgPct", "Field goals made", ratio(made, att), att ? `${made}/${att} (${percent(ratio(made, att))})` : "0/0"),
        band("fg0_39", "Under 40 yards", "fgMade0_39", "fgMiss0_39"),
        band("fg40_49", "40-49 yards", "fgMade40_49", "fgMiss40_49"),
        band("fg50_59", "50-59 yards", "fgMade50_59", "fgMiss50_59"),
        band("fg60", "60+ yards", "fgMade60", "fgMiss60"),
        metric("xp", "Extra points", ratio(n.get("xpMade"), n.get("xpAtt")), `${n.get("xpMade")}/${n.get("xpAtt")}`),
        metric("longFg", "Longest field goal", n.longFg, n.longFg === null ? "—" : `${n.longFg} yds`),
      );
      break;
    }
    case "DST": {
      const takeaways = n.get("dstInt") + n.get("dstFumRec");
      const tds = n.get("dstIntTd") + n.get("dstFumTd") + n.get("dstBlkTd") + n.get("retTd");
      out.push(
        metric("sacksPerGame", "Sacks a game", n.perGame("dstSack"), fixed(n.perGame("dstSack")), `${n.get("dstSack")} sacks`),
        metric("takeawaysPerGame", "Takeaways a game", ratio(takeaways, n.games), fixed(ratio(takeaways, n.games)), `${n.get("dstInt")} INT + ${n.get("dstFumRec")} fumbles recovered`),
        metric("pointsAllowedPerGame", "Points allowed a game", n.perGame("dstPa"), fixed(n.perGame("dstPa")), "ESPN fantasy points-allowed"),
        metric("yardsAllowedPerGame", "Yards allowed a game", n.perGame("dstYa"), fixed(n.perGame("dstYa"), 0)),
        metric("defensiveTd", "Defense/return TDs", tds, String(tds)),
        metric("blockedKicks", "Blocked kicks", n.get("dstBlk"), String(n.get("dstBlk"))),
        metric("safeties", "Safeties", n.get("dstSafety"), String(n.get("dstSafety"))),
      );
      break;
    }
  }
  return out;
}

/** ESPN tracking numbers (season-long), only those published for him. */
export function advancedMetrics(position: Position | null, n: SeasonNumbers, a: PlayerAdvancedStats): Metric[] {
  const out: Metric[] = [];
  const rec = n.get("rec");
  if (a.avgDepthOfTarget !== null) {
    out.push(metric("avgDepthOfTarget", "Average depth of target", a.avgDepthOfTarget, `${fixed(a.avgDepthOfTarget)} yds`, "how far past the line he's targeted, on average"));
  }
  if (a.yardsPerRouteRun !== null) {
    out.push(metric("yardsPerRouteRun", "Yards per route run", a.yardsPerRouteRun, fixed(a.yardsPerRouteRun, 2)));
  }
  if (a.yardsAfterCatch !== null && rec > 0) {
    const total = a.yardsAfterCatch + (a.yardsAtCatch ?? 0);
    out.push(metric("yacPerReception", "Yards after catch per catch", ratio(a.yardsAfterCatch, rec), fixed(ratio(a.yardsAfterCatch, rec)), `${a.yardsAfterCatch} yards after the catch`));
    // Only meaningful when catches happen downfield (a back's negative yards-at-catch would push this past 100%).
    if (a.yardsAtCatch !== null && a.yardsAtCatch >= 0 && total > 0) {
      out.push(metric("yacShare", "Share of yards after the catch", ratio(a.yardsAfterCatch, total), percent(ratio(a.yardsAfterCatch, total)), `${a.yardsAfterCatch} of ${total} receiving yards`));
    }
  }
  if (a.receivingFirstDowns !== null && rec > 0) {
    out.push(metric("firstDownsPerCatch", "Catches that moved the chains", ratio(a.receivingFirstDowns, rec), percent(ratio(a.receivingFirstDowns, rec)), `${a.receivingFirstDowns} first downs`));
  }
  const carries = n.get("rushAtt");
  if (position === "RB" && a.stuffs !== null && carries > 0) {
    out.push(metric("stuffRate", "Runs stopped at or behind the line", ratio(a.stuffs, carries), percent(ratio(a.stuffs, carries)), `${a.stuffs} of ${carries} carries`));
  }
  if (position === "RB" && a.rushingFirstDowns !== null && carries > 0) {
    out.push(metric("rushFirstDownRate", "Carries that moved the chains", ratio(a.rushingFirstDowns, carries), percent(ratio(a.rushingFirstDowns, carries)), `${a.rushingFirstDowns} first downs`));
  }
  if (position === "QB" && a.passingYardsAfterCatch !== null && n.get("passYds") > 0) {
    out.push(metric("passYacShare", "Passing yards gained after the catch", ratio(a.passingYardsAfterCatch, n.get("passYds")), percent(ratio(a.passingYardsAfterCatch, n.get("passYds"))), "high = short, catch-and-run passing"));
  }
  if (position === "QB" && a.passerRating !== null) {
    out.push(metric("passerRating", "Passer rating", a.passerRating, fixed(a.passerRating)));
  }
  return out;
}

/** Red-zone numbers (ESPN's split: opponent's 19-yard line to the goal line). */
export function redZoneMetrics(position: Position | null, n: SeasonNumbers, splits: PlayerSplits): Metric[] {
  const rz = splits.redZone;
  if (!rz || n.games === 0 || position === "K" || position === "DST") return [];
  const get = (key: StatKey) => rz[key] ?? 0;
  const out: Metric[] = [];
  if (position === "QB") {
    out.push(
      metric("rzPassAttempts", "Red-zone pass attempts", get("passAtt"), String(get("passAtt")), `${get("passCmp")} completed`),
      metric("rzPassTd", "Red-zone TD passes", get("passTd"), String(get("passTd")), `of ${n.get("passTd")} TD passes`),
    );
  }
  if (position === "RB" || position === "QB") {
    out.push(
      metric("rzCarriesPerGame", "Red-zone carries a game", ratio(get("rushAtt"), n.games), fixed(ratio(get("rushAtt"), n.games)), `${get("rushAtt")} red-zone carries`),
      metric("rzRushTd", "Red-zone rushing TDs", get("rushTd"), String(get("rushTd")), `of ${n.get("rushTd")} rushing TDs`),
    );
  }
  if (position === "RB" || position === "WR" || position === "TE") {
    out.push(
      metric("rzReceptionsPerGame", "Red-zone catches a game", ratio(get("rec"), n.games), fixed(ratio(get("rec"), n.games)), `${get("rec")} red-zone catches`),
      metric("rzRecTd", "Red-zone receiving TDs", get("recTd"), String(get("recTd")), `of ${n.get("recTd")} receiving TDs`),
    );
  }
  return out;
}
