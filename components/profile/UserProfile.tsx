"use client";

import { useEffect, useState } from "react";
import { SetupNeeded } from "@/components/auth/SetupNeeded";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { fetchPublicProfile, fetchPublicTeams, type PublicProfile } from "@/lib/profiles/api";
import type { PublicTeam } from "@/lib/profiles/public-teams";
import { useAuth } from "@/lib/supabase/auth";
import { requireSupabase } from "@/lib/supabase/client";
import { PublicTeamCard } from "./PublicTeamCard";

type Loaded = { status: "ready"; profile: PublicProfile | null; teams: PublicTeam[] } | { status: "loading" } | { status: "error" };

export const EMPTY_TEAMS = "This user hasn't made a fantasy team public yet.";

function memberSince(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

/**
 * Someone's fantasy identity: their name, bio and the teams they chose to make public, with
 * their primary team first. Never their email, ESPN login or anything they didn't switch on.
 */
export function UserProfile({ username }: { username: string }) {
  const auth = useAuth();
  const signedIn = auth.status === "signed-in";
  const [loaded, setLoaded] = useState<Loaded & { key: string }>({ status: "loading", key: "" });
  const [tick, setTick] = useState(0);
  const key = `${username}:${tick}`;

  useEffect(() => {
    if (!signedIn) return;
    let alive = true;
    (async () => {
      try {
        const supabase = await requireSupabase();
        const profile = await fetchPublicProfile(supabase, username);
        const teams = profile ? await fetchPublicTeams(supabase, profile.id) : [];
        if (alive) setLoaded({ status: "ready", profile, teams, key });
      } catch {
        if (alive) setLoaded({ status: "error", key });
      }
    })();
    return () => {
      alive = false;
    };
  }, [signedIn, username, key]);

  if (auth.status === "disabled") return <SetupNeeded feature="accounts" />;
  if (auth.status === "loading") return <Skeleton className="h-48 rounded-[20px]" />;
  if (!signedIn) {
    return (
      <div className="card flex flex-col items-start gap-3 p-5">
        <p className="text-[15px]">Sign in to see Xpert profiles.</p>
        <ButtonLink href={`/auth/sign-in?next=${encodeURIComponent(`/u/${username}`)}`} variant="primary">
          Sign in
        </ButtonLink>
      </div>
    );
  }
  const state: Loaded = loaded.key === key ? loaded : { status: "loading" };
  if (state.status === "loading") {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-16 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-48 rounded-[20px]" />
      </div>
    );
  }
  if (state.status === "error") return <ErrorState what="Couldn't load this profile." onRetry={() => setTick((t) => t + 1)} />;
  const { profile, teams } = state;
  if (!profile) return <p className="text-[15px] text-muted">No one on Xpert goes by @{username}.</p>;

  const mine = profile.id === auth.user.id;
  const shown = mine ? teams : profile.isPublic ? teams.filter((t) => t.isVisible) : [];
  const primary = shown.find((t) => t.id === profile.primaryTeamId);
  const ordered = primary ? [primary, ...shown.filter((t) => t !== primary)] : shown;
  const since = memberSince(profile.createdAt);

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start gap-4">
        <UserAvatar username={profile.username} avatarUrl={profile.avatarUrl} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-[22px] leading-7 font-semibold tracking-[-0.01em]">
            <span className="truncate">{profile.displayName ?? profile.username}</span>
            {profile.isAdmin && <span className="rounded bg-well px-1.5 text-[12px] font-medium text-muted">Moderator</span>}
          </h1>
          <p className="text-[14px] text-muted">
            @{profile.username}
            {since && <span className="text-faint"> · Member since {since}</span>}
          </p>
          {profile.bio && (profile.isPublic || mine) && <p className="mt-2 text-[15px] leading-6">{profile.bio}</p>}
          {mine && !profile.isPublic && (
            <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
              <Icon name="lock" size={14} /> Your profile is private: others see only your username and picture.
            </p>
          )}
        </div>
        {mine && (
          <ButtonLink href="/account#profile" size="sm" icon="edit">
            Edit
          </ButtonLink>
        )}
      </header>

      {ordered.length === 0 ? (
        <div className="card p-5 text-[15px] text-muted">{EMPTY_TEAMS}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {ordered.map((team) => (
            <PublicTeamCard key={team.id} team={team} primary={team === primary} hiddenNote={mine} />
          ))}
        </div>
      )}
    </div>
  );
}
