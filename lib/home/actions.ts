/**
 * Home's "Recommended actions": one ranked list built from what the rest of the app already
 * knows (pure; tested in actions.test.ts). Each action says what to do, why (with the numbers),
 * and links to the tool that does it:
 *
 * - lineup decisions you can still make (byes, injuries, better bench options): Start/Sit;
 * - your team's biggest weakness: Pickups / Trades;
 * - the best available pickup by how much it raises your team rating: Pickups;
 * - your players running hot or cold (last 3 games vs season, 4+ games): their profile;
 * - players being added across ESPN fastest who are likely available: their profile.
 */
import type { Pickup, Weakness } from "@/lib/analysis";
import type { RankedPlayer } from "@/lib/players/rankings";
import type { Decision } from "./decisions";

export interface Action {
  id: string;
  kind: "lineup" | "weakness" | "pickup" | "trend" | "waiver";
  tone: "urgent" | "opportunity" | "info";
  title: string;
  detail: string;
  href: string;
  cta: string;
  /** A player to open instead of following href (profile). */
  playerId?: string;
}

function short(name: string) {
  const parts = name.split(" ");
  return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : name;
}

export function recommendedActions({
  decisions,
  weaknesses,
  pickups,
  ranked,
  rosterIds,
  taken,
  isLeague,
}: {
  decisions: Decision[];
  weaknesses: Weakness[];
  pickups: Pickup[];
  ranked: RankedPlayer[] | undefined;
  rosterIds: ReadonlySet<string>;
  taken: ReadonlySet<string>;
  isLeague: boolean;
}): Action[] {
  const actions: Action[] = [];

  for (const d of decisions.slice(0, 3)) {
    actions.push({
      id: `lineup-${d.id}`,
      kind: "lineup",
      tone: d.urgency === "high" ? "urgent" : "opportunity",
      title: d.title,
      detail: isLeague ? `${d.detail} Make the change on ESPN.` : d.detail,
      href: d.compare ? `/start-sit?ids=${d.compare.join(",")}` : "/team",
      cta: d.compare ? "Compare" : "Lineup",
    });
  }

  const top = weaknesses.find((w) => w.priority === "High" || w.priority === "Medium");
  if (top) {
    actions.push({
      id: `weak-${top.area}`,
      kind: "weakness",
      tone: top.priority === "High" ? "urgent" : "opportunity",
      title: top.title,
      detail: top.fix?.text ?? top.why,
      href: top.fix?.positions.length ? `/team/pickups?pos=${top.fix.positions[0]}` : "/team",
      cta: "Fix it",
    });
  }

  const pick = pickups[0];
  if (pick) {
    actions.push({
      id: `pickup-${pick.player.id}`,
      kind: "pickup",
      tone: "opportunity",
      title: `Pick up ${short(pick.player.name)}`,
      detail: `${pick.kind === "starter" ? `He'd start at ${pick.spot === "DST" ? "D/ST" : pick.spot}` : "Useful depth"}: team rating +${pick.ratingChange.toFixed(1)}.${pick.drop ? ` You'd drop ${short(pick.drop.name)}.` : ""}`,
      href: "/team/pickups",
      cta: "See pickups",
      playerId: pick.player.id,
    });
  }

  if (ranked) {
    const mineHot = ranked
      .filter((r) => rosterIds.has(r.id) && r.trend !== null && Math.abs(r.trend) >= 3 && r.games >= 4)
      .sort((a, b) => Math.abs(b.trend!) - Math.abs(a.trend!))
      .slice(0, 2);
    for (const r of mineHot) {
      const up = r.trend! > 0;
      actions.push({
        id: `trend-${r.id}`,
        kind: "trend",
        tone: up ? "info" : "opportunity",
        title: `${short(r.name)} is trending ${up ? "up" : "down"}`,
        detail: `${r.recent!.toFixed(2)} points a game over his last 3 games vs ${r.ppg!.toFixed(2)} for the season.`,
        href: `/players/${r.id}`,
        cta: "Profile",
        playerId: r.id,
      });
    }
    const rising = ranked
      .filter(
        (r) =>
          !rosterIds.has(r.id) &&
          !taken.has(r.id) &&
          (r.percentOwnedChange ?? 0) >= 5 &&
          (r.percentOwned ?? 100) < 60 &&
          r.injuryStatus !== "OUT" &&
          r.injuryStatus !== "INJURY_RESERVE",
      )
      .sort((a, b) => (b.percentOwnedChange ?? 0) - (a.percentOwnedChange ?? 0))[0];
    if (rising) {
      actions.push({
        id: `waiver-${rising.id}`,
        kind: "waiver",
        tone: "opportunity",
        title: `${short(rising.name)} is being added fast`,
        detail: `Rostered in ${Math.round(rising.percentOwned ?? 0)}% of ESPN leagues (+${(rising.percentOwnedChange ?? 0).toFixed(1)} points recently)${
          isLeague ? " and free in yours" : ""
        }.`,
        href: `/players/${rising.id}`,
        cta: "Profile",
        playerId: rising.id,
      });
    }
  }

  const order = { urgent: 0, opportunity: 1, info: 2 } as const;
  return actions.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 6);
}
