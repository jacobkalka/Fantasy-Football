"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { useMatchup } from "@/lib/fantasy/context";
import type { PublicProfile } from "@/lib/profiles/api";
import { myProfile, useMyProfile } from "@/lib/profiles/my-profile";
import { choicesOf, DEFAULT_SHARE, snapshotTeam, type PublicTeam, type ShareChoices } from "@/lib/profiles/public-teams";
import { nflSeason } from "@/lib/roster/sync";
import { specLabel } from "@/lib/scoring/spec";
import { useActiveTeam } from "@/lib/teams/store";
import type { FantasyTeam } from "@/lib/teams/types";
import { TeamBadge } from "@/components/teams/TeamBadge";
import { publicMatchup } from "./PublicTeamsSync";

const INPUT = "w-full rounded-xl bg-raised px-3 text-[16px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[14px]">{label}</span>
        {hint && <span className="block text-[12px] text-muted">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-full bg-control transition-colors peer-checked:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-ink after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-black"
      />
    </label>
  );
}

/** Display name, bio and whether your profile is public. */
function DetailsForm({ profile }: { profile: PublicProfile }) {
  const [displayName, setDisplayName] = useState(profile.displayName ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [isPublic, setPublic] = useState(profile.isPublic);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = (displayName.trim() || null) !== profile.displayName || (bio.trim() || null) !== profile.bio || isPublic !== profile.isPublic;

  return (
    <form
      className="card flex flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const { error } = await myProfile.saveDetails({ displayName, bio, isPublic, primaryTeamId: profile.primaryTeamId });
        setBusy(false);
        setResult(error ? { ok: false, text: error } : { ok: true, text: "Saved." });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">Display name (optional, shown beside @{profile.username})</span>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} className={`${INPUT} h-11`} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-[13px] text-muted">
          <span>Bio</span>
          <span className="tabular">{bio.length}/160</span>
        </span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={160}
          rows={2}
          placeholder="WR truther. 3x league champ."
          className={`${INPUT} py-2.5`}
        />
      </label>
      <Toggle
        checked={isPublic}
        onChange={setPublic}
        label="Public profile"
        hint={isPublic ? "Signed-in people can see your bio and the teams you choose below." : "Others see only your username and picture."}
      />
      {result && (
        <p role={result.ok ? "status" : "alert"} className={`text-[14px] ${result.ok ? "text-muted" : "text-negative"}`}>
          {result.text}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || !changed} className="self-start">
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

/** One of your teams: show it or not, which details, and whether it's your primary team. */
function TeamShare({ team, published, primaryId, profile }: { team: FantasyTeam; published: PublicTeam | undefined; primaryId: string | null; profile: PublicProfile }) {
  const [share, setShare] = useState<ShareChoices>(published ? choicesOf(published) : DEFAULT_SHARE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { team: active } = useActiveTeam();
  const { matchup } = useMatchup();

  async function save(next: ShareChoices, show: boolean) {
    setBusy(true);
    setError(null);
    const week = team.id === active.id ? publicMatchup(team, matchup, next) : null;
    const result = show
      ? await myProfile.publish(snapshotTeam(team, next, { season: nflSeason(new Date()), matchup: week }))
      : await myProfile.unpublish(team.id);
    setBusy(false);
    if (result.error) setError(result.error);
  }

  const update = (key: keyof ShareChoices) => (value: boolean) => {
    const next = { ...share, [key]: value };
    setShare(next);
    if (published) void save(next, true);
  };

  return (
    <li className="flex flex-col gap-2 rounded-xl bg-raised p-3">
      <div className="flex items-center gap-3">
        <TeamBadge name={team.name} logo={team.espn?.logo} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium">{team.name}</p>
          <p className="truncate text-[12px] text-muted">
            {team.espn ? `ESPN${team.espn.private ? " · private league" : ""}` : "Hand-built"} · {specLabel({ format: team.format, rules: team.rules })}
          </p>
        </div>
        <Button size="sm" variant={published ? "secondary" : "primary"} disabled={busy} onClick={() => void save(share, !published)}>
          {published ? "Hide" : "Show on profile"}
        </Button>
      </div>
      {published && (
        <div className="flex flex-col pl-12">
          <Toggle checked={share.roster} onChange={update("roster")} label="Roster and lineup" />
          {team.espn?.record && <Toggle checked={share.record} onChange={update("record")} label="Record" hint={team.espn.record} />}
          {team.espn && (
            <Toggle
              checked={share.league}
              onChange={update("league")}
              label="League name"
              hint={team.espn.private ? "Your league is private: its name stays hidden unless you switch this on." : undefined}
            />
          )}
          {team.espn && <Toggle checked={share.matchup} onChange={update("matchup")} label="This week's matchup" hint="Score so far, updated while this device is open." />}
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <span className="flex-1 text-[14px]">Primary team</span>
            <input
              type="radio"
              name="primary-team"
              checked={primaryId === published.id}
              onChange={() =>
                void myProfile.saveDetails({ displayName: profile.displayName, bio: profile.bio, isPublic: profile.isPublic, primaryTeamId: published.id })
              }
              className="size-4 accent-white"
            />
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-negative">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * The account screen's public profile section: who you are to other people, and which of your
 * teams they can see. Nothing is shared until you choose it here.
 */
export function ProfileSettings({ userId, username }: { userId: string; username: string }) {
  const mine = useMyProfile(userId, username);
  const { teams } = useActiveTeam();
  if (mine.status === "error") return <ErrorState what="Couldn't load your public profile." onRetry={myProfile.reload} />;
  if (mine.status !== "ready" || !mine.profile) return <SkeletonRows rows={3} height={64} />;
  const profile = mine.profile;
  return (
    <div className="flex flex-col gap-4">
      <DetailsForm key={profile.id} profile={profile} />
      <section className="card flex flex-col gap-3 p-5" aria-labelledby="public-teams">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="public-teams" className="text-[16px] font-semibold">
              Teams on your profile
            </h3>
            <p className="text-[13px] text-muted">Your ESPN login, email and private league details are never shown.</p>
          </div>
          <ButtonLink href={`/u/${username}`} size="sm" iconRight="external">
            View
          </ButtonLink>
        </div>
        {!profile.isPublic && (
          <p className="flex items-center gap-1.5 text-[13px] text-muted">
            <Icon name="lock" size={14} /> Your profile is private, so these stay hidden until you make it public.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {teams.map((team) => (
            <TeamShare
              key={team.id}
              team={team}
              published={mine.teams.find((t) => t.localId === team.id)}
              primaryId={profile.primaryTeamId}
              profile={profile}
            />
          ))}
        </ul>
      </section>
    </div>
  );
}
