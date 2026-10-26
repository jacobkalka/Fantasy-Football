"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ErrorState } from "@/components/ui/States";
import type { LeagueError, LeagueResponse } from "@/lib/fantasy/context";
import { nflSeason } from "@/lib/roster/sync";
import { useAuth } from "@/lib/supabase/auth";
import { teamFromLeague } from "@/lib/teams/from-league";
import { parseLeagueInput } from "@/lib/teams/league-helpers";
import { teamsActions } from "@/lib/teams/store";
import { TeamBadge } from "./TeamBadge";
import { EspnLogin } from "./EspnLogin";

type Step =
  | { kind: "enter" }
  | { kind: "loading" }
  | { kind: "pick"; league: LeagueResponse; suggested?: number }
  | { kind: "private"; leagueId: string; season: number; code: LeagueError["code"]; message: string }
  | { kind: "error"; message: string };

/**
 * Connect an ESPN league in two steps: paste the league link (or id), then pick your team.
 * Public leagues work for anyone. Private ones need your ESPN login, saved encrypted on the
 * server (never on this device) and only with an account (components/teams/EspnLogin.tsx).
 */
export function ConnectLeague() {
  const params = useSearchParams();
  const router = useRouter();
  const auth = useAuth();
  const [input, setInput] = useState(params.get("league") ?? "");
  const [season, setSeason] = useState(() => nflSeason(new Date()));
  const [step, setStep] = useState<Step>({ kind: "enter" });

  async function lookUp(leagueId: string, forSeason: number, suggested?: number) {
    setStep({ kind: "loading" });
    try {
      const res = await fetch(`/api/league?id=${leagueId}&season=${forSeason}`, { cache: "no-store" });
      const body = (await res.json()) as LeagueResponse | LeagueError;
      if (res.ok && "teams" in body) return setStep({ kind: "pick", league: body, suggested });
      const err = body as LeagueError;
      if (err.code === "private" || err.code === "expired") {
        return setStep({ kind: "private", leagueId, season: forSeason, code: err.code, message: err.error });
      }
      setStep({ kind: "error", message: err.error ?? "Couldn't load that league." });
    } catch {
      setStep({ kind: "error", message: "Couldn't reach FantasyLab. Check your connection and try again." });
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseLeagueInput(input);
    if (!parsed) return setStep({ kind: "error", message: "Paste your league's web address from ESPN, or just its league id (a number)." });
    const s = parsed.season ?? season;
    setSeason(s);
    void lookUp(parsed.leagueId, s, parsed.teamId);
  }

  function choose(league: LeagueResponse, espnTeamId: number) {
    const team = teamFromLeague(league, espnTeamId, { isPrivate: league.private, syncedAt: league.fetchedAt });
    if (!team) return;
    teamsActions.upsertEspn(team);
    router.push("/team/matchup");
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="card flex flex-col gap-4 p-5">
        <div>
          <label htmlFor="league" className="text-[15px] font-semibold">
            Your league&apos;s link or id
          </label>
          <p className="mt-1 text-[13px] text-muted">
            On ESPN, open your league and copy the address from the browser. It looks like{" "}
            <span className="text-ink">fantasy.espn.com/football/league?leagueId=123456</span>.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="league"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="url"
            autoComplete="off"
            placeholder="Paste link or league id"
            className="h-12 min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-[16px] outline-none placeholder:text-faint focus:border-accent"
          />
          <label className="flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-3 text-[14px] text-muted">
            Season
            <select
              value={season}
              onChange={(e) => setSeason(Number(e.target.value))}
              className="bg-transparent text-[16px] text-ink outline-none"
            >
              {[0, 1, 2].map((n) => {
                const s = nflSeason(new Date()) - n;
                return (
                  <option key={s} value={s} className="bg-surface">
                    {s}
                  </option>
                );
              })}
            </select>
          </label>
          <Button type="submit" variant="primary" size="lg" disabled={!input.trim() || step.kind === "loading"}>
            {step.kind === "loading" ? "Looking it up…" : "Find league"}
          </Button>
        </div>
      </form>

      {step.kind === "error" && <ErrorState what={step.message} onRetry={() => setStep({ kind: "enter" })} />}

      {step.kind === "pick" && (
        <section className="card p-5">
          <h2 className="text-[16px] font-semibold">{step.league.name}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {step.league.size} teams · week {step.league.scoringPeriod} · {step.league.private ? "private league" : "public league"}
            {step.league.scoring.unsupported.length > 0 &&
              ` · ${step.league.scoring.unsupported.length} custom scoring rules come from ESPN's totals`}
          </p>
          <p className="mt-4 mb-2 text-[14px] font-medium">Which team is yours?</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {step.league.teams.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => choose(step.league, t.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left ${
                    t.id === step.suggested ? "bg-well" : "tile"
                  }`}
                >
                  <TeamBadge name={t.name} logo={t.logo} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{t.name}</span>
                    <span className="tabular block text-[12px] text-muted">
                      {t.wins}-{t.losses}
                      {t.ties ? `-${t.ties}` : ""} · {t.pointsFor.toFixed(2)} pts
                    </span>
                  </span>
                  {t.id === step.suggested && <span className="text-[12px] text-accent">From your link</span>}
                  <Icon name="chevronRight" size={18} className="text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {step.kind === "private" && (
        <section className="card flex flex-col gap-4 p-5">
          <div className="flex items-start gap-3">
            <Icon name="lock" className="mt-0.5 text-warning" />
            <div>
              <h2 className="text-[16px] font-semibold">
                {step.code === "expired" ? "Your ESPN login needs refreshing" : "This league is private"}
              </h2>
              <p className="mt-1 text-[14px] text-muted">{step.message}</p>
            </div>
          </div>
          {auth.status === "signed-in" ? (
            <EspnLogin onConnected={() => void lookUp(step.leagueId, step.season)} />
          ) : auth.status === "disabled" ? (
            <p className="text-[14px] text-muted">
              Private leagues need accounts, which aren&apos;t set up on this copy of FantasyLab yet. Public leagues work now.
            </p>
          ) : (
            <ButtonLink href={`/auth/sign-in?next=${encodeURIComponent(`/team/connect?league=${step.leagueId}`)}`} variant="primary" icon="user">
              Sign in to connect ESPN
            </ButtonLink>
          )}
        </section>
      )}

      <section className="card p-5 text-[14px] leading-6 text-muted">
        <h2 className="mb-1 text-[15px] font-semibold text-ink">What connecting does</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Your roster, lineup and the league&apos;s exact scoring come from ESPN and refresh by themselves.</li>
          <li>Your matchup shows your opponent, both lineups, ESPN&apos;s live projection and win probability.</li>
          <li>Pickups only suggest players nobody in your league has.</li>
          <li>You can connect several leagues and switch between them at the top of Home.</li>
        </ul>
      </section>
    </div>
  );
}
