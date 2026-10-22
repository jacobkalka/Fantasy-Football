import type { Position } from "@/lib/providers/types";
import type { StatLine } from "@/lib/stats";

/** A short, readable stat line: "24/34 · 312 yds · 3 TD · 1 INT · 5 rush yds". */
export function statLineSummary(stats: StatLine, position: Position): string {
  const parts: string[] = [];
  const n = (k: keyof StatLine) => stats[k] ?? 0;

  if (position === "K") {
    if (n("fgAtt")) parts.push(`${n("fgMade")}/${n("fgAtt")} FG`);
    if (n("fgMade50_59") + n("fgMade60")) parts.push(`${n("fgMade50_59") + n("fgMade60")} from 50+`);
    if (n("xpAtt")) parts.push(`${n("xpMade")}/${n("xpAtt")} XP`);
    return parts.join(" · ");
  }
  if (position === "DST") {
    parts.push(`${n("dstPa")} pts allowed`, `${n("dstYa")} yds allowed`);
    if (n("dstSack")) parts.push(`${n("dstSack")} sack${n("dstSack") === 1 ? "" : "s"}`);
    if (n("dstInt")) parts.push(`${n("dstInt")} INT`);
    if (n("dstFumRec")) parts.push(`${n("dstFumRec")} fum rec`);
    const tds = n("dstIntTd") + n("dstFumTd") + n("dstBlkTd") + n("retTd");
    if (tds) parts.push(`${tds} TD`);
    if (n("dstSafety")) parts.push(`${n("dstSafety")} safety`);
    if (n("dstBlk")) parts.push(`${n("dstBlk")} blocked kick${n("dstBlk") === 1 ? "" : "s"}`);
    return parts.join(" · ");
  }
  const passing = n("passAtt") > 0 || n("passYds") !== 0;
  const rushing = n("rushAtt") > 0 || n("rushYds") !== 0;
  const receiving = n("targets") > 0 || n("rec") > 0;

  const pass = () => {
    if (!passing) return;
    parts.push(`${n("passCmp")}/${n("passAtt")}`, `${n("passYds")} yds`);
    if (n("passTd")) parts.push(`${n("passTd")} TD`);
    if (n("passInt")) parts.push(`${n("passInt")} INT`);
  };
  const rush = (label: boolean) => {
    if (!rushing) return;
    parts.push(`${n("rushAtt")} car`, `${n("rushYds")} ${label ? "rush " : ""}yds`);
    if (n("rushTd")) parts.push(`${n("rushTd")} rush TD`);
  };
  const rec = (label: boolean) => {
    if (!receiving) return;
    parts.push(`${n("rec")}/${n("targets")} rec`, `${n("recYds")} ${label ? "rec " : ""}yds`);
    if (n("recTd")) parts.push(`${n("recTd")} rec TD`);
  };

  if (position === "QB") {
    pass();
    rush(true);
    rec(true);
  } else if (position === "RB") {
    rush(false);
    rec(true);
    pass();
  } else {
    rec(false);
    rush(true);
    pass();
  }
  if (n("retTd")) parts.push(`${n("retTd")} return TD`);
  const twoPt = n("pass2pt") + n("rush2pt") + n("rec2pt");
  if (twoPt) parts.push(`${twoPt} 2-pt`);
  if (n("fumLost")) parts.push(`${n("fumLost")} fum lost`);
  return parts.join(" · ");
}

export const INJURY_LABEL: Record<string, { short: string; long: string; tone: "warn" | "bad" }> = {
  QUESTIONABLE: { short: "Q", long: "Questionable", tone: "warn" },
  DOUBTFUL: { short: "D", long: "Doubtful", tone: "bad" },
  OUT: { short: "O", long: "Out", tone: "bad" },
  INJURY_RESERVE: { short: "IR", long: "Injured reserve", tone: "bad" },
  SUSPENSION: { short: "SSPD", long: "Suspended", tone: "bad" },
  DAY_TO_DAY: { short: "DTD", long: "Day-to-day", tone: "warn" },
};
