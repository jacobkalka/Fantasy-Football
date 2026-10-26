"use client";

import { useState } from "react";
import { EspnLogin } from "@/components/teams/EspnLogin";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { unreadStore } from "@/lib/chat/unread";
import { nflSeason } from "@/lib/roster/sync";
import { useTeamsState } from "@/lib/teams/store";

/**
 * A league room you aren't verified for yet. Membership is checked by the server: it reads the
 * league from ESPN with YOUR ESPN login and looks for your account among the team owners. Saying
 * which league you're in isn't enough, so nobody can read a league's chat by guessing its id.
 */
export function LeagueAccess({ leagueId, onVerified }: { leagueId: string; onVerified: () => void }) {
  const { value } = useTeamsState();
  const team = value.teams.find((t) => t.espn?.leagueId === leagueId);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ text: string; login: boolean } | null>(null);

  async function verify() {
    setBusy(true);
    setProblem(null);
    try {
      const response = await fetch("/api/espn/verify-league", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leagueId,
          season: team?.espn?.season ?? nflSeason(new Date()),
          name: (team?.espn?.leagueName ?? "League").slice(0, 60),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
      if (response.ok) {
        void unreadStore.refresh();
        onVerified();
        return;
      }
      setProblem({ text: body.error ?? "Couldn't check with ESPN right now.", login: body.code === "connect" || body.code === "expired" });
    } catch {
      setProblem({ text: "You seem to be offline. Check your connection and try again.", login: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-10">
      <Icon name="lock" className="text-muted" />
      <div>
        <h2 className="text-[18px] leading-6 font-semibold">Members only</h2>
        <p className="mt-1 text-[14px] leading-5 text-muted">
          {team?.espn?.leagueName ?? "This league"}&apos;s room is just for its managers. FantasyLab confirms with ESPN, using your ESPN
          login, that your account owns a team in it. Your league, roster and login are never shown in chat.
        </p>
      </div>
      {problem && (
        <p role="alert" className="text-[14px] text-negative">
          {problem.text}
        </p>
      )}
      {problem?.login ? (
        <EspnLogin onConnected={() => void verify()} />
      ) : (
        <Button variant="primary" size="lg" className="self-start" disabled={busy} onClick={() => void verify()}>
          {busy ? "Checking with ESPN…" : "Confirm I'm in this league"}
        </Button>
      )}
    </div>
  );
}
