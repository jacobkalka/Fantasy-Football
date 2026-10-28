"use client";

import Link from "next/link";
import { WinMeter } from "@/components/charts/WinMeter";
import { AnimatedNumber } from "@/components/motion/AnimatedNumber";
import { TeamBadge } from "@/components/teams/TeamBadge";
import { Icon } from "@/components/ui/Icon";
import { pts } from "@/lib/format";
import type { MatchupLive } from "@/lib/fantasy/useMatchupLive";

/**
 * The matchup at a glance: both teams, live score (to the hundredth), projected finals and win
 * probability, with whose numbers they are. Links to the full Matchup screen.
 */
export function MatchupStrip({ view, href = "/team/matchup" }: { view: MatchupLive; href?: string }) {
  const { me, opponent, win, projected } = view;
  if (!opponent) {
    return (
      <Link href={href} className="tile flex items-center gap-3 p-4">
        <Icon name="info" className="text-muted" />
        <span className="flex-1 text-[14px]">No opponent this week (bye in your league).</span>
        <Icon name="chevronRight" size={18} className="text-faint" />
      </Link>
    );
  }
  const myPts = me.projection.points;
  const oppPts = opponent.projection.points;
  return (
    <Link href={href} className="group block">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamBadge name={me.name} logo={me.logo} size={40} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{me.name}</p>
            <p className="text-[11px] text-faint">{me.record}</p>
          </div>
        </div>
        <span className="text-[11px] font-semibold tracking-widest text-faint">VS</span>
        <div className="flex min-w-0 items-center justify-end gap-2.5 text-right">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{opponent.name}</p>
            <p className="text-[11px] text-faint">{opponent.record}</p>
          </div>
          <TeamBadge name={opponent.name} logo={opponent.logo} size={40} />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className={`text-[32px] leading-9 font-semibold tracking-[-0.02em] ${myPts >= oppPts ? "text-accent" : "text-ink"}`}>
            <AnimatedNumber value={myPts} />
          </p>
          <p className="tabular text-[12px] text-muted">Proj {pts(projected.me)}</p>
        </div>
        <div className="text-right">
          <p className="text-[32px] leading-9 font-semibold tracking-[-0.02em] text-ink">
            <AnimatedNumber value={oppPts} />
          </p>
          <p className="tabular text-[12px] text-muted">Proj {pts(projected.opponent)}</p>
        </div>
      </div>
      {win && (
        <div className="mt-3">
          <WinMeter probability={win.probability} source={win.source} meLabel="You" themLabel={opponent.abbrev || "Them"} size="sm" />
        </div>
      )}
      <p className="mt-2 text-[11px] text-faint">
        Projections: {projected.source === "espn" ? "ESPN live" : "Xpert estimate"} · <span className="group-hover:text-accent">Open matchup →</span>
      </p>
    </Link>
  );
}
