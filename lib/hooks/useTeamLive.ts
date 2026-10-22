"use client";

import { useSearchParams } from "next/navigation";
import type { TeamLive } from "@/lib/live/types";
import { useRoster } from "@/lib/roster/store";
import { usePoll } from "./usePoll";

export type TeamLiveResponse = TeamLive & {
  /** The week happening now (data.week can be an earlier week you're looking back at). */
  currentWeek: number;
  /** True when one of the games couldn't be loaded this time. */
  partial?: boolean;
};

/** The week in the URL (?week=6), or undefined for the current week. Needs a <Suspense> parent. */
export function useWeekParam(): number | undefined {
  const week = Number(useSearchParams().get("week"));
  return Number.isInteger(week) && week > 0 && week <= 18 ? week : undefined;
}

/**
 * Live points and plays for your roster. Polls every 8 seconds while any of your
 * players' games are on, every minute otherwise.
 */
export function useTeamLive(week?: number) {
  const { roster, ready } = useRoster();
  const ids = roster.players
    .map((p) => p.playerId)
    .sort()
    .join(",");
  const url =
    ready && ids ? `/api/live?ids=${ids}&format=${roster.format}${week ? `&week=${week}` : ""}` : null;
  const poll = usePoll<TeamLiveResponse>(url, {
    intervalMs: (data) => (data?.anyLive ? 8_000 : 60_000),
  });
  // Ignore an answer for a different format or week while the new one loads.
  const current =
    ids !== "" &&
    poll.data !== undefined &&
    poll.data.format === roster.format &&
    (week === undefined || poll.data.week === week);
  return { roster, ready, ...poll, data: current ? poll.data : undefined };
}
