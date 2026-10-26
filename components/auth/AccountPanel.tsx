"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ProfileSettings } from "@/components/profile/ProfileSettings";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice, SectionLabel, Skeleton } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { useTeams } from "@/lib/hooks/useTeams";
import { useRoster } from "@/lib/roster/store";
import { reloadProfile, signOut, updateProfile, useAuth, useProfile, type Profile } from "@/lib/supabase/auth";
import { rosterSync, useRosterSync, type RosterSyncState } from "@/lib/supabase/roster-sync";
import { normalizeUsername, USERNAME_MAX, usernameProblem } from "@/lib/supabase/username";
import { SetupNeeded } from "./SetupNeeded";
import { UserAvatar } from "./UserAvatar";

const LABEL = "text-[13px] text-muted";
const INPUT = "h-11 w-full rounded-xl bg-raised px-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent";

function timeLabel(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Username and favorite team. Keyed by profile id, so it starts from the saved values. */
function ProfileForm({ profile }: { profile: Profile }) {
  const teams = useTeams();
  const [username, setUsername] = useState(profile.username);
  const [team, setTeam] = useState(profile.favoriteTeam ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const problem = usernameProblem(username);
  const changed = normalizeUsername(username) !== profile.username || (team || null) !== profile.favoriteTeam;
  const teamList = Object.values(teams).sort((a, b) => a.name.localeCompare(b.name));
  const picked = team ? teams[team] : undefined;

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setResult(null);
    const { error } = await updateProfile({ username, favoriteTeam: team || null });
    setBusy(false);
    setResult(error ? { ok: false, text: error } : { ok: true, text: "Saved." });
    if (!error) setUsername(normalizeUsername(username));
  }

  return (
    <form onSubmit={onSave} className="card flex flex-col gap-4 p-5">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Username (what others see in chat)</span>
        <span className="relative">
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" aria-hidden="true">
            @
          </span>
          <input
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setResult(null);
            }}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={USERNAME_MAX + 4}
            aria-invalid={problem ? true : undefined}
            aria-describedby="username-help"
            className={`${INPUT} pl-8`}
          />
        </span>
        <span id="username-help" className={`text-[13px] ${problem ? "text-warning" : "text-muted"}`}>
          {problem ?? "3 to 24 characters: letters, numbers and _ . Capitals become lowercase."}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Favorite team</span>
        <span className="flex items-center gap-3">
          {picked ? (
            <TeamLogo abbr={picked.abbr} logo={picked.logo} color={picked.color} size={40} />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-well text-[12px] text-muted" aria-hidden="true">
              NFL
            </span>
          )}
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setResult(null);
            }}
            className={`${INPUT} appearance-none`}
          >
            <option value="">No favorite</option>
            {teamList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            {team && !teams[team] && <option value={team}>Team {team}</option>}
          </select>
        </span>
      </label>

      {result && (
        <p role={result.ok ? "status" : "alert"} className={`text-[14px] ${result.ok ? "text-muted" : "text-negative"}`}>
          {result.text}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy || !changed || Boolean(problem)} className="self-start">
        {busy ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}

function syncText(sync: RosterSyncState, players: number): { tone: "ok" | "busy" | "warn"; text: string } {
  switch (sync.phase) {
    case "checking":
      return { tone: "busy", text: "Checking the team saved in your account…" };
    case "waiting":
    case "saving":
      return { tone: "busy", text: "Saving your latest changes…" };
    case "offline":
    case "error":
      return { tone: "warn", text: sync.problem ?? "Not saved yet. Your team is safe on this device." };
    case "synced":
      return {
        tone: "ok",
        text:
          players === 0
            ? "Your account has no team yet. Add players and they'll be saved automatically."
            : `Saved to your account${sync.lastSyncedAt ? ` at ${timeLabel(sync.lastSyncedAt)}` : ""}. It follows you to any device you sign in on.`,
      };
    default:
      return { tone: "busy", text: "Getting ready…" };
  }
}

function SyncCard() {
  const sync = useRosterSync();
  const { roster } = useRoster();
  const status = syncText(sync, roster.players.length);
  const dot = { ok: "bg-accent", busy: "bg-muted live-dot text-muted", warn: "bg-warning" }[status.tone];
  return (
    <div className="card flex flex-col gap-3 p-5" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold">
            {roster.name} · {roster.players.length} {roster.players.length === 1 ? "player" : "players"}
          </p>
          <p className="text-[14px] leading-relaxed text-muted">{status.text}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/team/edit" size="sm" icon="edit">
          Edit team
        </ButtonLink>
        {status.tone === "warn" && (
          <Button size="sm" icon="refresh" onClick={() => rosterSync.retry()}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}

function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="danger"
        disabled={busy}
        className="self-start"
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await signOut();
          setBusy(false);
          if (result.error) return setError(result.error);
          // The header shows what happened to the team.
          router.push("/");
        }}
      >
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      <p className="text-[13px] leading-relaxed text-muted">
        Signing out clears your team from this device. It stays saved in your account; sign back in to get it.
      </p>
      {error && (
        <p role="alert" className="text-[14px] text-negative">
          {error}
        </p>
      )}
    </div>
  );
}

/** The account screen: who you are, your public profile, your team's save status, and signing out. */
export function AccountPanel() {
  const auth = useAuth();
  const { profile, status } = useProfile();

  if (auth.status === "disabled") return <SetupNeeded feature="accounts" />;
  if (auth.status === "loading") return <Skeleton className="h-72 rounded-[20px]" />;
  if (auth.status === "signed-out") {
    return (
      <Notice title="You're signed out">
        <Link href="/auth/sign-in?next=/account" className="font-medium text-ink underline underline-offset-4">
          Sign in
        </Link>{" "}
        to save your team to an account and join the chat.
      </Notice>
    );
  }

  const name = profile?.username ?? "…";
  return (
    <div className="flex flex-col gap-5">
      <div className="card flex items-center gap-4 p-5">
        <UserAvatar username={profile?.username ?? auth.user.email ?? "?"} avatarUrl={profile?.avatarUrl} size={64} />
        <div className="min-w-0">
          <p className="truncate text-[22px] leading-8 font-semibold">@{name}</p>
          {auth.user.email && <p className="mt-0.5 truncate text-[13px] text-muted">{auth.user.email} · only you see this</p>}
          {profile?.isAdmin && <p className="mt-1 text-[13px] font-medium text-muted">Moderator</p>}
        </div>
      </div>

      <section>
        <SectionLabel>Your team</SectionLabel>
        <SyncCard />
      </section>

      <section id="profile" className="scroll-mt-20">
        <SectionLabel>Public profile</SectionLabel>
        {profile ? <ProfileSettings userId={auth.user.id} username={profile.username} /> : <Skeleton className="h-56 rounded-[20px]" />}
      </section>

      <section>
        <SectionLabel>Account</SectionLabel>
        {profile ? (
          <ProfileForm key={profile.id} profile={profile} />
        ) : status === "error" ? (
          <Notice title="Couldn't load your profile" tone="warn">
            <Button size="sm" onClick={reloadProfile}>
              Try again
            </Button>
          </Notice>
        ) : (
          <Skeleton className="h-56 rounded-[20px]" />
        )}
      </section>

      <SignOutButton />
    </div>
  );
}
