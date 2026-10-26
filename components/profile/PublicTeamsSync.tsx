"use client";

import { useEffect } from "react";
import { useMatchup } from "@/lib/fantasy/context";
import { myProfile, useMyProfile } from "@/lib/profiles/my-profile";
import { choicesOf, snapshotChanged, snapshotTeam, type PublicMatchup, type ShareChoices } from "@/lib/profiles/public-teams";
import { nflSeason } from "@/lib/roster/sync";
import { useAuth, useProfile } from "@/lib/supabase/auth";
import type { FantasyTeam } from "@/lib/teams/types";
import { useActiveTeam } from "@/lib/teams/store";
import type { MatchupView } from "@/lib/fantasy/context";

/**
 * This week's matchup as a published team shows it. The opponent's team name comes from a
 * league; for a private league it's only named when you also chose to show the league.
 */
export function publicMatchup(team: FantasyTeam, view: MatchupView | null, share: ShareChoices): PublicMatchup | null {
  if (!view || !team.espn) return null;
  const named = !team.espn.private || share.league;
  return {
    week: view.period,
    opponent: view.opponentTeam && named ? view.opponentTeam.name.slice(0, 60) : view.opponent ? "their opponent" : "bye week",
    points: Math.round(view.me.points * 100) / 100,
    opponentPoints: Math.round((view.opponent?.points ?? 0) * 100) / 100,
  };
}

/**
 * Keeps the teams you made public current: when one changes on this device (a lineup move, a
 * new record from ESPN), its published copy is refreshed a few seconds later, sharing exactly the
 * details you chose. Teams published from another device are left as they are.
 */
export function PublicTeamsSync() {
  const auth = useAuth();
  const { profile } = useProfile();
  const userId = auth.status === "signed-in" ? auth.user.id : null;
  const mine = useMyProfile(userId, profile?.username ?? null);
  const { team: active, teams } = useActiveTeam();
  const { matchup } = useMatchup();

  useEffect(() => {
    if (mine.status !== "ready" || mine.teams.length === 0) return;
    const timer = setTimeout(() => {
      void (async () => {
        for (const published of mine.teams) {
          const local = teams.find((t) => t.id === published.localId);
          if (!local) continue;
          const share = choicesOf(published);
          const week = local.id === active.id ? publicMatchup(local, matchup, share) : published.matchup;
          const next = { ...snapshotTeam(local, share, { season: nflSeason(new Date()), matchup: week }), isVisible: published.isVisible };
          if (snapshotChanged(published, next)) await myProfile.publish(next);
        }
      })();
    }, 3000);
    return () => clearTimeout(timer);
  }, [mine, teams, active.id, matchup]);

  return null;
}
