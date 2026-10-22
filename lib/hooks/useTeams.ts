"use client";

import { useEffect, useState } from "react";
import type { TeamLite } from "@/lib/live/types";

let cache: Record<string, TeamLite> | null = null;
let pending: Promise<Record<string, TeamLite>> | null = null;

function load() {
  pending ??= fetch("/api/teams")
    .then((r) => (r.ok ? r.json() : { teams: {} }))
    .then((body: { teams: Record<string, TeamLite> }) => (cache = body.teams))
    .catch(() => ({}));
  return pending;
}

/** All 32 teams (colors, logos), fetched once per visit. */
export function useTeams(): Record<string, TeamLite> {
  const [teams, setTeams] = useState<Record<string, TeamLite>>(cache ?? {});
  useEffect(() => {
    if (cache) return;
    let alive = true;
    void load().then((t) => alive && setTeams(t));
    return () => {
      alive = false;
    };
  }, []);
  return teams;
}
