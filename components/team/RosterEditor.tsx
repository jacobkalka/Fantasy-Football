"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Segmented } from "@/components/ui/Segmented";
import { SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { useTeams } from "@/lib/hooks/useTeams";
import { canFill, MAX_ROSTER, sortLineup, type Slot } from "@/lib/roster/lineup";
import { teamLink } from "@/lib/roster/share";
import { rosterActions, useRoster } from "@/lib/roster/store";
import type { ScoringFormat } from "@/lib/scoring";

const FORMATS = [
  { value: "standard", label: "Standard" },
  { value: "half", label: "Half PPR" },
  { value: "ppr", label: "PPR" },
] as const satisfies readonly { value: ScoringFormat; label: string }[];

const SLOT_LABEL: Record<Slot, string> = {
  QB: "QB",
  RB: "RB",
  WR: "WR",
  TE: "TE",
  FLEX: "FLEX",
  K: "K",
  DST: "D/ST",
  BENCH: "Bench",
};

const ALL_SLOTS: Slot[] = ["QB", "RB", "WR", "TE", "FLEX", "K", "DST", "BENCH"];

export function RosterEditor() {
  const { roster, ready } = useRoster();
  const teams = useTeams();
  const players = sortLineup(roster.players);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);

  const copyLink = async () => {
    const url = teamLink(roster, window.location.origin);
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: `${roster.name || "My Team"} on FantasyLab`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
    window.setTimeout(() => setCopied(null), 2500);
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Your roster">
      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Team name</span>
          <input
            // Saved as you type, so nothing is lost if you leave mid-edit.
            value={ready ? roster.name : ""}
            onChange={(e) => rosterActions.rename(e.target.value)}
            placeholder="My Team"
            maxLength={40}
            disabled={!ready}
            className="h-11 rounded-xl bg-raised px-3.5 text-[16px] text-ink placeholder:text-faint focus:ring-2 focus:ring-accent focus:outline-none"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">League scoring</span>
          <Segmented options={FORMATS} value={roster.format} onChange={rosterActions.setFormat} label="Scoring format" />
        </div>
      </Card>

      <Card>
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-[16px] leading-6 font-semibold">Roster</h2>
          <span className="tabular text-[13px] text-muted">
            {roster.players.length} of {MAX_ROSTER}
          </span>
        </div>
        {!ready ? (
          <SkeletonRows rows={5} height={56} />
        ) : players.length === 0 ? (
          <p className="rounded-xl bg-raised px-4 py-5 text-[14px] text-muted">
            No players yet. Search below and tap + to add them.
          </p>
        ) : (
          <ul className="-mx-2 flex flex-col divide-y divide-rule">
            {players.map((player) => {
              const team = player.teamId ? teams[player.teamId] : undefined;
              const starter = player.slot !== "BENCH";
              return (
                <li key={player.playerId} className="flex min-h-14 items-center gap-3 px-2 py-2">
                  <label className="relative block shrink-0">
                    <span className="sr-only">Lineup spot for {player.name}</span>
                    {/*
                      The real select is invisible on top of the pill, at 16px so iPhone doesn't
                      zoom the page when it's tapped; the small pill underneath shows the spot.
                    */}
                    <select
                      value={player.slot}
                      onChange={(e) => rosterActions.move(player.playerId, e.target.value as Slot)}
                      className="peer absolute inset-0 size-full cursor-pointer appearance-none text-[16px] opacity-0"
                    >
                      {ALL_SLOTS.filter((slot) => canFill(slot, player.position)).map((slot) => (
                        <option key={slot} value={slot} className="bg-raised text-ink">
                          {SLOT_LABEL[slot]}
                        </option>
                      ))}
                    </select>
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none flex h-8 w-[72px] items-center rounded-full pr-5 pl-3 text-[12px] font-semibold peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                        starter ? "bg-ink text-black" : "bg-well text-muted"
                      }`}
                    >
                      {SLOT_LABEL[player.slot]}
                    </span>
                    <Icon
                      name="chevronDown"
                      size={14}
                      className={`pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 ${starter ? "text-black" : "text-muted"}`}
                    />
                  </label>
                  <PlayerAvatar
                    name={player.name}
                    headshot={player.position === "DST" ? team?.logo : player.headshot}
                    teamColor={visibleTeamColor(team)}
                    size={36}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-5 font-medium">{player.name}</p>
                    <p className="text-[13px] leading-5 text-muted">
                      {player.position === "DST" ? "D/ST" : player.position} · {team?.abbr ?? "Free agent"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => rosterActions.remove(player.playerId)}
                    aria-label={`Remove ${player.name}`}
                    className="pressable grid size-10 shrink-0 place-items-center rounded-full text-faint hover:bg-negative-soft hover:text-negative"
                  >
                    <Icon name="close" size={18} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {players.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-rule pt-4">
            <Button size="sm" icon="share" onClick={copyLink}>
              Team link
            </Button>
            <p className="text-[13px] text-muted" role="status">
              {copied === "copied"
                ? "Link copied. Open it on your other device to bring this team over."
                : copied === "failed"
                  ? "Couldn't copy. Try again, or sign in to keep your team in sync everywhere."
                  : "Open your team on another phone or browser."}
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}
