"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PlayerChip } from "@/components/player/PlayerChip";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/States";
import { evaluateTrade, type TradeEvaluation, type TradeSuggestion } from "@/lib/analysis";
import { signedPts } from "@/lib/format";
import { searchPlayers } from "@/lib/hooks/usePlayers";
import { useTeamAnalysis } from "@/lib/hooks/useTeamAnalysis";
import { useTeams } from "@/lib/hooks/useTeams";
import { setQueryParams } from "@/lib/nav/query";
import type { Player } from "@/lib/providers/types";

const TOOLS = [
  { value: "ideas", label: "Trade ideas" },
  { value: "calculator", label: "Calculator" },
] as const;
type Tool = (typeof TOOLS)[number]["value"];

const GRADE_TONE = (g: string) => (g.startsWith("A") || g.startsWith("B") ? "positive" : g.startsWith("C") ? "neutral" : "negative");

/** Which league team has each player (connected ESPN leagues only). */
function useOwners() {
  const { league } = useTeamAnalysis();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const t of league.data?.teams ?? []) for (const id of t.playerIds) map.set(id, t.name);
    return map;
  }, [league.data]);
}

function Idea({ s, owners }: { s: TradeSuggestion; owners: Map<string, string> }) {
  const teams = useTeams();
  const [open, setOpen] = useState(false);
  const owner = s.get.map((p) => owners.get(p.id)).find(Boolean);
  return (
    <li className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold">{s.fixes}</p>
          {owner && <p className="mt-0.5 text-[12px] text-muted">Ask {owner}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Pill tone={GRADE_TONE(s.grade)}>{s.grade}</Pill>
          <span className="tabular text-[13px] font-semibold text-positive">
            {s.ratingChange > 0 ? "+" : ""}
            {s.ratingChange.toFixed(1)} rating
          </span>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="well p-2">
          <p className="px-1 pb-1 text-[12px] font-medium text-negative">You give</p>
          {s.give.map((p) => (
            <PlayerChip key={p.id} player={p} teams={teams} figure={p.perGame} figureLabel="per game" />
          ))}
        </div>
        <div className="well p-2">
          <p className="px-1 pb-1 text-[12px] font-medium text-positive">You get</p>
          {s.get.map((p) => (
            <PlayerChip key={p.id} player={p} teams={teams} figure={p.perGame} figureLabel="per game" note={owners.get(p.id)} />
          ))}
        </div>
      </div>
      <p className="mt-3 text-[13px] text-muted">{s.balance}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="text-[13px] font-medium text-accent hover:underline" aria-expanded={open}>
          {open ? "Hide the reasons" : "Why this works"}
        </button>
        <span className="text-faint">·</span>
        <button
          type="button"
          onClick={() =>
            setQueryParams({ tool: "calculator", give: s.give.map((p) => p.id).join(","), get: s.get.map((p) => p.id).join(",") }, { push: true })
          }
          className="text-[13px] font-medium text-accent hover:underline"
        >
          Open in calculator
        </button>
      </div>
      {open && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-5 text-muted">
          {s.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Ideas() {
  const a = useTeamAnalysis({ trades: true });
  const owners = useOwners();
  if (a.team.players.length === 0) {
    return <EmptyState title="Add your team first" icon="team" action={{ label: "Connect an ESPN league", href: "/team/connect" }} />;
  }
  if (a.error && !a.universe) return <ErrorState what="Couldn't load player projections." onRetry={a.refresh} />;
  if (!a.trades) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-44 rounded-[22px]" />
        ))}
      </div>
    );
  }
  const { suggestions, targeted, note } = a.trades;
  return (
    <div className="flex flex-col gap-4">
      {targeted.length > 0 && (
        <p className="text-[14px] text-muted">
          Aimed at: <span className="text-ink">{targeted.map((t) => t.title).join(" · ")}</span>
        </p>
      )}
      {suggestions.length === 0 ? (
        <EmptyState title="No trade clearly helps right now" icon="trades">
          None of the balanced trades we tried improves your team by enough to be worth it. Your roster is in good shape, or
          the fix is a pickup.{" "}
          <a href="/team/pickups" className="text-accent underline">
            See pickups
          </a>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {suggestions.map((s) => (
            <Idea key={[...s.give, ...s.get].map((p) => p.id).join("-")} s={s} owners={owners} />
          ))}
        </ul>
      )}
      <p className="text-[12px] text-faint">{a.knownRosters ? "Targets are players on other teams in your ESPN league." : note}</p>
    </div>
  );
}

function PlayerPick({
  label,
  options,
  selected,
  onToggle,
  searchable,
}: {
  label: string;
  options: Player[];
  selected: string[];
  onToggle: (id: string) => void;
  searchable?: boolean;
}) {
  const teams = useTeams();
  const [q, setQ] = useState("");
  const list = searchable
    ? q.trim()
      ? searchPlayers(options, q, (id) => (id ? (teams[id]?.abbr ?? null) : null), 8)
      : []
    : options;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      {searchable && (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search any player"
          className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 text-[16px] outline-none placeholder:text-faint focus:border-accent"
        />
      )}
      <ul className="flex flex-col gap-1">
        {list.map((p) => {
          const on = selected.includes(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onToggle(p.id)}
                aria-pressed={on}
                className={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[14px] ${on ? "bg-well text-ink" : "hover:bg-raised"}`}
              >
                <Icon name={on ? "check" : "plus"} size={16} className={on ? "text-accent" : "text-faint"} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="text-[12px] text-faint">
                  {p.position === "DST" ? "D/ST" : p.position} · {p.teamId ? teams[p.teamId]?.abbr : "FA"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Verdict({ e }: { e: TradeEvaluation }) {
  const teams = useTeams();
  const tone = e.verdict === "improves" ? "text-positive" : e.verdict === "weakens" ? "text-negative" : "text-muted";
  return (
    <section className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={`text-[13px] font-semibold ${tone}`}>
            {e.verdict === "improves" ? "Improves your team" : e.verdict === "weakens" ? "Weakens your team" : "About even"}
          </p>
          <p className="mt-1 text-[15px] text-ink">{e.summary}</p>
        </div>
        <span className="text-accent text-[44px] leading-none font-semibold">{e.grade}</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="well p-3">
          <p className="text-[12px] text-muted">Team rating</p>
          <p className="tabular text-[16px] font-semibold">
            {e.before.overall.toFixed(1)} → {e.after.overall.toFixed(1)}
          </p>
        </div>
        <div className="well p-3">
          <p className="text-[12px] text-muted">This week</p>
          <p className={`tabular text-[16px] font-semibold ${e.points.thisWeek.change >= 0 ? "text-positive" : "text-negative"}`}>
            {signedPts(e.points.thisWeek.change)}
          </p>
        </div>
        <div className="well p-3">
          <p className="text-[12px] text-muted">Per game, rest of season</p>
          <p className={`tabular text-[16px] font-semibold ${e.points.restOfSeason.change >= 0 ? "text-positive" : "text-negative"}`}>
            {signedPts(e.points.restOfSeason.change)}
          </p>
        </div>
        <div className="well p-3">
          <p className="text-[12px] text-muted">Risk</p>
          <p className="text-[16px] font-semibold capitalize">{e.risk.level}</p>
        </div>
      </div>
      {e.positions.some((p) => p.perGameChange !== 0) && (
        <div className="mt-4 flex flex-col gap-1.5">
          <p className="text-[12px] text-muted">By lineup spot (points per game over a waiver player)</p>
          {e.positions
            .filter((p) => p.perGameChange !== 0)
            .map((p) => (
              <div key={p.slot} className="flex items-center gap-3 text-[12px]">
                <span className="w-11 font-semibold text-muted">{p.slot === "DST" ? "D/ST" : p.slot}</span>
                <span className="relative h-2 flex-1 rounded-full bg-well">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-white/25" />
                  <span
                    className={`absolute inset-y-0 rounded-full ${p.perGameChange > 0 ? "left-1/2 bg-positive" : "right-1/2 bg-negative"}`}
                    style={{ width: `${Math.min(50, Math.abs(p.perGameChange) * 8)}%` }}
                  />
                </span>
                <span className="tabular w-14 text-right">{signedPts(p.perGameChange)}</span>
              </div>
            ))}
        </div>
      )}
      <ul className="mt-4 list-disc space-y-1 pl-5 text-[13px] leading-5 text-muted">
        {e.why.slice(0, 5).map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
      {e.dropped.length > 0 && (
        <div className="mt-3">
          <p className="text-[12px] text-muted">To stay under the roster limit you&apos;d drop:</p>
          {e.dropped.map((p) => (
            <PlayerChip key={p.id} player={p} teams={teams} />
          ))}
        </div>
      )}
      <p className="mt-3 text-[12px] text-faint">{e.market.note}</p>
    </section>
  );
}

function Calculator() {
  const params = useSearchParams();
  const a = useTeamAnalysis();
  const [give, setGive] = useState<string[]>(() => (params.get("give") ?? "").split(",").filter(Boolean));
  const [get, setGet] = useState<string[]>(() => (params.get("get") ?? "").split(",").filter(Boolean));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id].slice(0, 4));

  const roster: Player[] = a.team.players.map((p) => ({ id: p.playerId, name: p.name, position: p.position, teamId: p.teamId, headshot: p.headshot }));
  const pool: Player[] = useMemo(
    () =>
      (a.universe?.players ?? [])
        .filter((p) => !a.team.players.some((r) => r.playerId === p.id))
        .map((p) => ({ id: p.id, name: p.name, position: p.position, teamId: p.teamId, headshot: p.headshot, percentOwned: p.percentOwned ?? 0 })),
    [a.universe, a.team.players],
  );
  const chosenGet = get.map((id) => pool.find((p) => p.id === id)).filter((p): p is Player => Boolean(p));
  const evaluation = useMemo(
    () => (a.universe && give.length && get.length ? evaluateTrade(a.team.players, give, get, a.universe, a.settings) : null),
    [a.universe, a.team.players, a.settings, give, get],
  );

  if (a.team.players.length === 0) {
    return <EmptyState title="Add your team first" icon="team" action={{ label: "Connect an ESPN league", href: "/team/connect" }} />;
  }
  if (a.error && !a.universe) return <ErrorState what="Couldn't load player projections." onRetry={a.refresh} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:items-start">
      <section className="card flex flex-col gap-5 p-5">
        <PlayerPick label="You give (from your roster)" options={roster} selected={give} onToggle={(id) => setGive((g) => toggle(g, id))} />
        <div className="flex flex-col gap-2">
          <PlayerPick label="You get" options={pool} selected={get} onToggle={(id) => setGet((g) => toggle(g, id))} searchable />
          {chosenGet.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chosenGet.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setGet((g) => g.filter((x) => x !== p.id))}
                  className="glass-chip inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px]"
                  aria-label={`Remove ${p.name}`}
                >
                  {p.name} <Icon name="close" size={12} />
                </button>
              ))}
            </div>
          )}
        </div>
        {(give.length > 0 || get.length > 0) && (
          <Button size="sm" variant="quiet" icon="refresh" className="self-start" onClick={() => {
              setGive([]);
              setGet([]);
            }}>
            Start over
          </Button>
        )}
      </section>
      <div>
        {!a.universe ? (
          <Skeleton className="h-72 rounded-[22px]" />
        ) : evaluation ? (
          evaluation.ok ? (
            <Verdict e={evaluation} />
          ) : (
            <ErrorState what={evaluation.error ?? "Couldn't evaluate that trade."} />
          )
        ) : (
          <EmptyState title="Pick both sides" icon="calculator">
            Choose who you&apos;d give and who you&apos;d get. The verdict shows what it does to your team rating, this week&apos;s
            points and your points per game the rest of the season, spot by spot.
          </EmptyState>
        )}
        <p className="mt-3 text-[12px] text-faint">
          Judged with {a.team.leagueSize}-team league settings and your team&apos;s scoring. Values: ESPN rest-of-season projections.
        </p>
      </div>
    </div>
  );
}

/** Trades, inside Team: personalized trade ideas and a calculator, for the active team. */
export function TradesScreen() {
  const params = useSearchParams();
  const tool: Tool = params.get("tool") === "calculator" || params.get("get") || params.get("give") ? "calculator" : "ideas";
  return (
    <div className="flex flex-col gap-4">
      <Segmented options={TOOLS} value={tool} onChange={(v) => setQueryParams({ tool: v === "ideas" ? null : v })} label="Trade tool" className="self-start" />
      {tool === "ideas" ? <Ideas /> : <Calculator key={`${params.get("give")}|${params.get("get")}`} />}
    </div>
  );
}
