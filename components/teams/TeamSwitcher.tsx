"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { agoLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { teamsActions, useActiveTeam } from "@/lib/teams/store";
import type { FantasyTeam } from "@/lib/teams/types";
import { specLabel } from "@/lib/scoring/spec";
import { TeamBadge } from "./TeamBadge";

function sourceLine(team: FantasyTeam) {
  if (team.espn) return `${team.espn.leagueName}${team.espn.record ? ` · ${team.espn.record}` : ""}`;
  return `Hand-built · ${specLabel({ format: team.format, rules: team.rules })}`;
}

/**
 * The team/league selector (DECISIONS.md, "Teams"). The trigger shows the active team; the sheet
 * lists every team, grouped by ESPN league, and is where you add a team or connect a league.
 * Switching changes the whole app's context at once (lib/teams/store.ts).
 */
export function TeamSwitcher({ variant = "chip" }: { variant?: "hero" | "chip" }) {
  const { team, teams, ready } = useActiveTeam();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const router = useRouter();
  const now = useNow(30_000);

  const leagues = new Map<string, FantasyTeam[]>();
  for (const t of teams) {
    const key = t.espn ? `${t.espn.leagueId}:${t.espn.season}` : "manual";
    leagues.set(key, [...(leagues.get(key) ?? []), t]);
  }

  const trigger =
    variant === "hero" ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable group flex min-w-0 items-center gap-3 rounded-2xl py-1 pr-2 text-left"
        aria-haspopup="dialog"
        aria-label={`Team: ${team.name}. Switch team`}
      >
        <TeamBadge name={team.name} logo={team.espn?.logo} size={48} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[24px] leading-8 font-semibold tracking-[-0.02em] lg:text-[28px] lg:leading-9">
              {ready ? team.name : " "}
            </span>
            <Icon name="chevronDown" size={20} className="shrink-0 text-muted transition-transform group-hover:translate-y-0.5" />
          </span>
          <span className="block truncate text-[13px] text-muted">{ready ? sourceLine(team) : " "}</span>
        </span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pressable flex h-9 max-w-[200px] min-w-0 items-center gap-2 rounded-full bg-raised py-1 pr-2.5 pl-1"
        aria-haspopup="dialog"
        aria-label={`Team: ${team.name}. Switch team`}
      >
        <TeamBadge name={team.name} logo={team.espn?.logo} size={26} className="rounded-full" />
        <span className="truncate text-[13px] font-medium">{ready ? team.name : ""}</span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-muted" />
      </button>
    );

  return (
    <>
      {trigger}
      <Sheet open={open} onClose={() => setOpen(false)} title="Your teams" description="The selected team sets what every screen shows.">
        <div className="flex flex-col gap-5">
          {[...leagues.entries()].map(([key, group]) => (
            <section key={key}>
              <h3 className="mb-2 flex items-center gap-2 text-[12px] font-semibold tracking-wide text-faint uppercase">
                {group[0].espn ? (
                  <>
                    <Icon name="globe" size={14} /> {group[0].espn.leagueName} · ESPN {group[0].espn.season}
                    {group[0].espn.private && <Icon name="lock" size={12} />}
                  </>
                ) : (
                  <>
                    <Icon name="edit" size={14} /> Hand-built teams
                  </>
                )}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.map((t) => {
                  const active = t.id === team.id;
                  return (
                    <li key={t.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          teamsActions.select(t.id);
                          setOpen(false);
                        }}
                        aria-current={active ? "true" : undefined}
                        className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left transition-colors ${
                          active ? "bg-well" : "tile"
                        }`}
                      >
                        <TeamBadge name={t.name} logo={t.espn?.logo} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium">{t.name}</span>
                          <span className="block truncate text-[12px] text-muted">
                            {t.players.length} players · {specLabel({ format: t.format, rules: t.rules })}
                            {t.espn?.syncedAt && now ? ` · synced ${agoLabel(now - Date.parse(t.espn.syncedAt))}` : ""}
                          </span>
                        </span>
                        {active && <Icon name="check" className="text-accent" />}
                      </button>
                      {editing && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Remove ${t.name} from Xpert on this device?`)) teamsActions.remove(t.id);
                          }}
                          className="pressable grid size-10 shrink-0 place-items-center rounded-full text-negative hover:bg-negative-soft"
                          aria-label={`Remove ${t.name}`}
                        >
                          <Icon name="trash" size={18} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="grid gap-2 sm:grid-cols-2">
            <ButtonLink href="/team/connect" variant="primary" icon="link" size="lg" className="w-full">
              Connect an ESPN league
            </ButtonLink>
            <Button
              size="lg"
              icon="plus"
              className="w-full"
              onClick={() => {
                const id = teamsActions.add({ name: `Team ${teams.length + 1}` });
                setOpen(false);
                if (id) router.push("/team/edit");
              }}
            >
              Build a team by hand
            </Button>
          </div>
          <div className="flex items-center justify-between text-[13px]">
            <Link href="/settings#espn" className="text-muted hover:text-ink" onClick={() => setOpen(false)}>
              ESPN connection status
            </Link>
            {teams.length > 1 && (
              <button type="button" onClick={() => setEditing((e) => !e)} className="text-muted hover:text-ink">
                {editing ? "Done" : "Remove teams"}
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
