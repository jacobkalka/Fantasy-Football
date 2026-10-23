/**
 * Role and tendency labels. A label appears only when its rule in
 * lib/players/rules.ts (LABEL_RULES) is met, and its reason quotes the numbers.
 */
import type { Position } from "@/lib/providers/types";
import { fixed, percent, ratio } from "./math";
import { LABEL_RULES, SAMPLE, TD_SHARE, VARIATION, type LabelId } from "./rules";
import type { PlayerAnalysis, PlayerProfile, RoleLabel } from "./types";
import type { SeasonNumbers } from "./usage";

type Draft = Omit<PlayerAnalysis, "summary" | "signals" | "labels">;

/** Depth-chart position that matches a fantasy position. */
const DEPTH_POSITION: Partial<Record<Position, string>> = { QB: "QB", RB: "RB", WR: "WR", TE: "TE", K: "PK" };

export function roleLabels(profile: PlayerProfile, a: Draft, n: SeasonNumbers, tdShare: number | null): RoleLabel[] {
  const out: RoleLabel[] = [];
  const add = (id: LabelId, reason: string) => out.push({ id, label: LABEL_RULES[id].label, reason: `${reason} (rule: ${LABEL_RULES[id].rule})` });
  const g = n.games;
  const pos = profile.position;
  const perGame = (value: number) => ratio(value, g) ?? 0;

  if (profile.bio?.nflSeason === 1) add("rookie", "First NFL season");
  const status = profile.fantasy.injuryStatus;
  if (status === "OUT" || status === "DOUBTFUL" || status === "INJURY_RESERVE" || status === "SUSPENSION") {
    add("injured", `ESPN fantasy status: ${status.replace("_", " ").toLowerCase()}`);
  }

  const depthPosition = pos ? DEPTH_POSITION[pos] : undefined;
  const spot = profile.depth
    .filter((s) => s.position === depthPosition)
    .sort((x, y) => x.depth - y.depth)[0];
  if (spot) {
    const formation = profile.depthFormation && spot.position !== "PK" ? ` (${profile.depthFormation})` : "";
    const where = `${spot.spot} on ESPN's depth chart${formation}`;
    if (spot.depth === 1) add("depthStarter", `First at ${where}`);
    else add("depthBackup", `No. ${spot.depth} at ${where}`);
  }

  const c = a.consistency;
  if (c && g >= SAMPLE.minGamesForConsistency && c.variation !== null && c.variation < VARIATION.steady) {
    add("steady", `Variation ${fixed(c.variation, 2)} over ${g} games`);
  }
  if (c && g >= 5 && ((c.boomGames >= 2 && c.bustGames >= 2) || (c.variation !== null && c.variation >= VARIATION.volatile))) {
    add("boomBust", `${c.boomGames} boom and ${c.bustGames} bust weeks in ${g} games, variation ${fixed(c.variation, 2)}`);
  }
  if (pos !== "K" && pos !== "DST" && g >= SAMPLE.minGames && tdShare !== null && tdShare >= TD_SHARE.dependent) {
    add("tdDependent", `${percent(tdShare)} of points from touchdowns`);
  }

  const targetsPg = perGame(n.get("targets"));
  const adv = profile.advanced;
  if (g >= 1 && (pos === "WR" || pos === "TE" || pos === "RB")) {
    const needed = pos === "WR" ? 8 : 7;
    if (targetsPg >= needed) add("targetEarner", `${fixed(targetsPg)} targets a game`);
  }
  if (pos === "WR" || pos === "TE") {
    const targets = n.get("targets");
    const rec = n.get("rec");
    if (g >= SAMPLE.minGames && targetsPg < 4) add("lowVolume", `${fixed(targetsPg)} targets a game`);
    if (adv.avgDepthOfTarget !== null && targets >= 15) {
      if (adv.avgDepthOfTarget >= 13) add("downfield", `Targeted ${fixed(adv.avgDepthOfTarget)} yards downfield on average`);
    } else if (adv.avgDepthOfTarget === null && rec >= 15 && (ratio(n.get("recYds"), rec) ?? 0) >= 15) {
      add("downfield", `${fixed(ratio(n.get("recYds"), rec))} yards a catch`);
    }
    if (adv.yardsAfterCatch !== null && rec >= 15 && (ratio(adv.yardsAfterCatch, rec) ?? 0) >= 6) {
      add("yac", `${fixed(ratio(adv.yardsAfterCatch, rec))} yards after the catch per reception`);
    }
    const catchRate = ratio(rec, targets);
    const shortRoutes = adv.avgDepthOfTarget !== null ? adv.avgDepthOfTarget < 9 : (ratio(n.get("recYds"), rec) ?? 99) < 11;
    if (targets >= 20 && catchRate !== null && catchRate >= 0.72 && shortRoutes) {
      add("possession", `Catches ${percent(catchRate)} of targets${adv.avgDepthOfTarget !== null ? `, ${fixed(adv.avgDepthOfTarget)}-yard depth of target` : ""}`);
    }
    if (adv.yardsPerRouteRun !== null && targets >= 20 && adv.yardsPerRouteRun >= 2.2) {
      add("routeEfficient", `${fixed(adv.yardsPerRouteRun, 2)} yards per route run`);
    }
    const rzCatches = profile.splits.redZone?.rec ?? 0;
    if (g >= SAMPLE.minGames && perGame(rzCatches) >= 0.8) add("redZoneTarget", `${rzCatches} red-zone catches in ${g} games`);
  }

  if (pos === "RB" && g >= 1) {
    const opportunities = perGame(n.get("rushAtt") + n.get("targets"));
    const reason = `${fixed(opportunities)} carries + targets a game`;
    if (opportunities >= 20) add("workhorse", reason);
    else if (opportunities >= 14) add("leadBack", reason);
    else if (opportunities >= 8) add("committee", reason);
    else if (g >= SAMPLE.minGames) add("limitedRole", reason);
    if (targetsPg >= 4) add("receivingBack", `${fixed(targetsPg)} targets a game`);
    const rzCarries = profile.splits.redZone?.rushAtt ?? 0;
    if (g >= SAMPLE.minGames && perGame(rzCarries) >= 2.5) add("goalLine", `${rzCarries} red-zone carries in ${g} games`);
    const carries = n.get("rushAtt");
    const ypc = ratio(n.get("rushYds"), carries);
    if (carries >= 40 && ypc !== null && ypc >= 5) add("efficientRunner", `${fixed(ypc)} yards a carry on ${carries} carries`);
    if (carries >= 40 && ypc !== null && ypc < 3.5) add("inefficientRunner", `${fixed(ypc)} yards a carry on ${carries} carries`);
  }

  if (pos === "QB" && g >= 1) {
    const rushes = perGame(n.get("rushAtt"));
    const rushYds = perGame(n.get("rushYds"));
    if (rushes >= 6 || rushYds >= 30) add("dualThreat", `${fixed(rushes)} runs for ${fixed(rushYds)} yards a game`);
    const att = n.get("passAtt");
    if (perGame(att) >= 37) add("volumePasser", `${fixed(perGame(att))} attempts a game`);
    const ypa = ratio(n.get("passYds"), att);
    if (att >= 100 && ypa !== null && ypa >= 8) add("efficientPasser", `${fixed(ypa)} yards per attempt`);
    const intRate = ratio(n.get("passInt"), att);
    if (att >= 100 && intRate !== null && intRate >= 0.03) add("turnoverProne", `Interceptions on ${percent(intRate, 1)} of attempts`);
    if (n.sacked !== null && att + n.sacked >= 100) {
      const sackRate = n.sacked / (att + n.sacked);
      if (sackRate >= 0.09) add("sackProne", `Sacked on ${percent(sackRate, 1)} of dropbacks`);
    }
  }

  if (pos === "K" && g >= 1) {
    const fifty = n.get("fgMade50_59") + n.get("fgMade60");
    if (fifty >= 3) add("bigLeg", `${fifty} field goals made from 50+`);
    const attPg = perGame(n.get("fgAtt"));
    if (attPg >= 2.5) add("busyKicker", `${fixed(attPg)} field-goal tries a game`);
    const att = n.get("fgAtt");
    const pct = ratio(n.get("fgMade"), att);
    if (att >= 10 && pct !== null && pct >= 0.9) add("accurateKicker", `${n.get("fgMade")} of ${att} (${percent(pct)})`);
    if (att >= 10 && pct !== null && pct < 0.75) add("shakyKicker", `${n.get("fgMade")} of ${att} (${percent(pct)})`);
  }

  if (pos === "DST" && g >= 1) {
    const sacks = perGame(n.get("dstSack"));
    if (sacks >= 3) add("passRush", `${fixed(sacks)} sacks a game`);
    const takeaways = perGame(n.get("dstInt") + n.get("dstFumRec"));
    if (takeaways >= 1.5) add("ballHawks", `${fixed(takeaways)} takeaways a game`);
    const pa = perGame(n.get("dstPa"));
    if (pa <= 17) add("stingy", `${fixed(pa)} points allowed a game`);
    if (pa >= 27) add("leaky", `${fixed(pa)} points allowed a game`);
  }
  return out;
}
