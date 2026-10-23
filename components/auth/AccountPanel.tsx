"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { TiltCard } from "@/components/motion/TiltCard";
import { Notice, SectionLabel, Skeleton } from "@/components/ui/bits";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { useTeams } from "@/lib/hooks/useTeams";
import { useRoster } from "@/lib/roster/store";
import { reloadProfile, signOut, updateProfile, useAuth, useProfile, type Profile } from "@/lib/supabase/auth";
import { rosterSync, useRosterSync, type RosterSyncState } from "@/lib/supabase/roster-sync";
import { normalizeUsername, USERNAME_MAX, usernameProblem } from "@/lib/supabase/username";
import { SetupNeeded } from "./SetupNeeded";
import { UserAvatar } from "./UserAvatar";

const LABEL = "font-mono text-[11px] tracking-[0.1em] text-muted uppercase";
const INPUT =
  "glass-chip min-h-12 w-full rounded-2xl px-4 text-[16px] text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-gain/70";

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
    <form onSubmit={onSave} className="glass flex flex-col gap-4 p-5">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Username (what others see in chat)</span>
        <span className="relative">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 font-mono text-muted" aria-hidden="true">
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
            className={`${INPUT} pl-9 font-mono`}
          />
        </span>
        <span id="username-help" className={`text-[12.5px] ${problem ? "text-alert" : "text-muted"}`}>
          {problem ? `⚠ ${problem}` : "3 to 24 characters: letters, numbers and _ . Capitals become lowercase."}
        </span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Favorite team</span>
        <span className="flex items-center gap-3">
          {picked ? (
            <TeamLogo abbr={picked.abbr} logo={picked.logo} color={picked.color} size={40} />
          ) : (
            <span className="glass-chip flex size-10 shrink-0 items-center justify-center rounded-full font-mono text-[11px] text-muted" aria-hidden="true">
              NFL
            </span>
          )}
          <select
            value={team}
            onChange={(e) => {
              setTeam(e.target.value);
              setResult(null);
            }}
            className={`${INPUT} appearance-none bg-transparent`}
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
        <p
          role={result.ok ? "status" : "alert"}
          className={`rounded-xl px-3 py-2 text-[13.5px] ring-1 ${result.ok ? "bg-gain/10 text-gain ring-gain/30" : "bg-alert/10 text-alert ring-alert/30"}`}
        >
          {result.ok ? "✓ " : "⚠ "}
          {result.text}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !changed || Boolean(problem)}
        className="glass-gain pressable min-h-12 rounded-2xl px-4 font-mono text-[12px] font-bold tracking-[0.12em] text-gain uppercase disabled:opacity-40 disabled:hover:translate-y-0"
      >
        {busy ? "Saving…" : "Save changes"}
      </button>
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
  const dot = { ok: "bg-gain", busy: "bg-sky live-dot text-sky", warn: "bg-alert" }[status.tone];
  return (
    <div className="glass flex flex-col gap-3 p-5" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <span className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <p className="font-semibold text-ink-strong">
            {roster.name} · {roster.players.length} {roster.players.length === 1 ? "player" : "players"}
          </p>
          <p className="text-[14px] leading-relaxed text-ink-soft">{status.text}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link
          href="/team/edit"
          className="glass-chip pressable flex min-h-11 items-center rounded-xl px-4 font-mono text-[11px] font-bold tracking-[0.1em] text-ink-strong uppercase"
        >
          Edit team
        </Link>
        {status.tone === "warn" && (
          <button
            type="button"
            onClick={() => rosterSync.retry()}
            className="glass-chip pressable min-h-11 rounded-xl px-4 font-mono text-[11px] font-bold tracking-[0.1em] text-alert uppercase"
          >
            Try again
          </button>
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
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const result = await signOut();
          setBusy(false);
          if (result.error) return setError(result.error);
          // The header shows what happened to the team.
          router.push("/");
        }}
        className="min-h-12 rounded-2xl border border-loss-line/50 bg-loss/10 px-4 font-mono text-[12px] font-bold tracking-[0.12em] text-loss uppercase transition-colors hover:bg-loss/15 disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
      <p className="px-1 text-[12.5px] leading-relaxed text-muted">
        Signing out clears your team from this device. It stays saved in your account; sign back in to get it.
      </p>
      {error && (
        <p role="alert" className="rounded-xl bg-alert/10 px-3 py-2 text-[13.5px] text-alert ring-1 ring-alert/30">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}

/** The account screen: who you are, your team's save status, and signing out. */
export function AccountPanel() {
  const auth = useAuth();
  const { profile, status } = useProfile();

  if (auth.status === "disabled") return <SetupNeeded feature="accounts" />;
  if (auth.status === "loading") return <Skeleton className="h-72 rounded-3xl" />;
  if (auth.status === "signed-out") {
    return (
      <Notice title="You're signed out">
        <Link href="/auth/sign-in?next=/account" className="text-gain underline underline-offset-4">
          Sign in
        </Link>{" "}
        to save your team to an account and join the chat.
      </Notice>
    );
  }

  const name = profile?.username ?? "…";
  return (
    <div className="flex flex-col gap-5">
      <TiltCard className="glass flex items-center gap-4 p-5" max={6}>
        <span style={{ transform: "translateZ(30px)" }}>
          <UserAvatar username={profile?.username ?? auth.user.email ?? "?"} avatarUrl={profile?.avatarUrl} size={64} />
        </span>
        <div className="min-w-0" style={{ transform: "translateZ(18px)" }}>
          <p className="truncate font-display text-3xl leading-none font-bold tracking-wide text-ink-strong">@{name}</p>
          {auth.user.email && <p className="mt-1 truncate font-mono text-[11px] text-muted">{auth.user.email}</p>}
          {profile?.isAdmin && (
            <p className="mt-1 font-mono text-[10px] font-bold tracking-[0.12em] text-sky uppercase">Moderator</p>
          )}
        </div>
      </TiltCard>

      <section>
        <SectionLabel>Your team</SectionLabel>
        <SyncCard />
      </section>

      <section>
        <SectionLabel>Profile</SectionLabel>
        {profile ? (
          <ProfileForm key={profile.id} profile={profile} />
        ) : status === "error" ? (
          <Notice title="Couldn't load your profile" tone="warn">
            <button type="button" onClick={reloadProfile} className="min-h-11 text-gain underline underline-offset-4">
              Try again
            </button>
          </Notice>
        ) : (
          <Skeleton className="h-56 rounded-3xl" />
        )}
      </section>

      <SignOutButton />
    </div>
  );
}
