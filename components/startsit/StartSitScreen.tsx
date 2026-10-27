"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFlipList } from "@/components/motion/useFlipList";
import { Card } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorState, Skeleton } from "@/components/ui/States";
import { usePlayers } from "@/lib/hooks/usePlayers";
import { usePoll } from "@/lib/hooks/usePoll";
import { useTeams } from "@/lib/hooks/useTeams";
import { isStarter } from "@/lib/roster/lineup";
import { useRoster } from "@/lib/roster/store";
import { specQuery } from "@/lib/scoring/spec";
import type { ScoringFormat } from "@/lib/scoring";
import { comparable, defaultPick, idsFromUrl, MAX_PICK, togglePick } from "@/lib/startsit/pick";
import type { StartSitResult } from "@/lib/startsit/types";
import { PlayerPicker, type Pickable } from "./PlayerPicker";
import { TheMath } from "./TheMath";
import { Verdict, VerdictSkeleton } from "./Verdict";
import { VersusCard, type CardRole } from "./VersusCard";

const FORMATS = [
  { value: "standard", label: "Std" },
  { value: "half", label: "Half" },
  { value: "ppr", label: "PPR" },
] as const;

/** The optional Claude-written summary, fetched after the numbers so they never wait for it. */
function useAiSummary(query: string | null) {
  const [state, setState] = useState<{ query: string; text: string | null } | null>(null);
  useEffect(() => {
    if (!query) return;
    let alive = true;
    fetch(`/api/startsit?${query}&explain=1`)
      .then((r) => (r.ok ? (r.json() as Promise<StartSitResult>) : null))
      .then((data) => alive && setState({ query, text: data?.aiSummary ?? null }))
      .catch(() => alive && setState({ query, text: null }));
    return () => {
      alive = false;
    };
  }, [query]);
  const done = state !== null && state.query === query;
  return { text: done ? state.text : null, loading: query !== null && !done };
}

function sameSet(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

export function StartSitScreen() {
  const { roster, ready, team } = useRoster();
  const teams = useTeams();
  const params = useSearchParams();
  // Null until you tap a player: until then the URL (or a sensible default) decides.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [formatChoice, setFormatChoice] = useState<ScoringFormat | null>(null);
  // Outside players you've added this visit (kept as chips so you can toggle them back on).
  const [added, setAdded] = useState<Pickable[]>([]);
  const cards = useRef<HTMLDivElement>(null);
  const captureFlip = useFlipList(cards);

  const mine: Pickable[] = useMemo(
    () =>
      comparable(roster.players).map((p) => ({
        playerId: p.playerId,
        name: p.name,
        position: p.position,
        teamId: p.teamId,
        headshot: p.headshot,
        onRoster: true,
        starter: isStarter(p),
      })),
    [roster.players],
  );
  const mineIds = useMemo(() => new Set(mine.map((p) => p.playerId)), [mine]);

  const fromUrl = idsFromUrl(params.get("ids"));
  const selection = picked ?? (fromUrl.length >= 2 ? fromUrl : defaultPick(roster.players));
  // The selected team's scoring: its league's exact rules unless you pick a format to compare in.
  const format = formatChoice ?? team.format;
  const rules = formatChoice === null || formatChoice === team.format ? team.rules : null;

  // Outside players named in the URL need their details from the full player list.
  const needsLookup = selection.some((id) => !mineIds.has(id) && !added.some((p) => p.playerId === id));
  const { players: everyone } = usePlayers(needsLookup);
  const outsideAll: Pickable[] = useMemo(() => {
    const list = [...added];
    for (const id of selection) {
      if (mineIds.has(id) || list.some((p) => p.playerId === id)) continue;
      const p = everyone?.find((x) => x.id === id);
      if (p) list.push({ playerId: p.id, name: p.name, position: p.position, teamId: p.teamId, headshot: p.headshot, onRoster: false });
    }
    return list.filter((p) => !mineIds.has(p.playerId));
  }, [added, selection, mineIds, everyone]);

  const byId = new Map([...mine, ...outsideAll].map((p) => [p.playerId, p]));
  const chosen = selection.map((id) => byId.get(id)).filter((p): p is Pickable => Boolean(p));
  const outsideIds = chosen.filter((p) => !p.onRoster).map((p) => p.playerId);

  // Sorted ids: A-vs-B and B-vs-A share one cached answer.
  const query = selection.length >= 2 ? `ids=${[...selection].sort().join(",")}&${specQuery({ format, rules })}` : null;
  const { data, error, refresh } = usePoll<StartSitResult>(query ? `/api/startsit?${query}` : null, {
    intervalMs: 5 * 60_000,
  });
  const sameFormat = data?.format === format ? data : undefined;
  const fresh =
    sameFormat && sameSet(sameFormat.players.map((p) => p.playerId), selection) ? sameFormat : undefined;
  const ai = useAiSummary(fresh?.aiAvailable && fresh.recommendation ? query : null);

  function choose(next: string[]) {
    captureFlip();
    setPicked(next);
    const url = next.length ? `${window.location.pathname}?ids=${next.join(",")}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  if (!ready) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-28 rounded-[20px]" />
        <Skeleton className="h-72 rounded-[20px]" />
      </div>
    );
  }

  const rec = fresh?.recommendation;
  const roleOf = (id: string): CardRole => (!rec ? null : id === rec.startId ? "start" : "sit");
  const verdictOf = (id: string) => sameFormat?.players.find((p) => p.playerId === id);
  // One scale for every card's floor/ceiling bar.
  const scaleMax = Math.max(10, ...chosen.map((p) => verdictOf(p.playerId)?.ceiling ?? 0)) * 1.05;
  const compact = chosen.length > 2;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        {mine.length < 2 && (
          <p className="mb-3 text-[14px] text-muted">
            {roster.players.length === 0
              ? "Your team is empty, so compare any players you like. Add your team on Roster to get your own players here."
              : "Add more quarterbacks, running backs, receivers or tight ends on Roster, or compare anyone."}
          </p>
        )}
        <PlayerPicker
          mine={mine}
          picked={selection}
          outside={outsideAll}
          teams={teams}
          onToggle={(id) => choose(togglePick(selection, id))}
          onAddOutside={(p) => {
            if (!p.onRoster) setAdded((list) => (list.some((x) => x.playerId === p.playerId) ? list : [...list, p]));
            if (!selection.includes(p.playerId) && selection.length < MAX_PICK) choose([...selection, p.playerId]);
          }}
        />
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[16px] leading-6 font-semibold">Head to head</h2>
          {rules && <p className="text-[12px] text-muted">Your league&apos;s exact scoring</p>}
        </div>
        <Segmented options={FORMATS} value={format} onChange={setFormatChoice} label="Scoring format" size="sm" />
      </div>

      {chosen.length < 2 ? (
        <Card>
          <p className="text-[15px] font-medium">Pick {chosen.length === 0 ? "two players" : "one more player"}</p>
          <p className="mt-1 text-[14px] text-muted">Tap a player above, or use Compare anyone to add someone who isn&apos;t on your team.</p>
        </Card>
      ) : (
        <div ref={cards} className={`grid items-stretch gap-2.5 ${compact ? "grid-cols-3" : "grid-cols-2"}`}>
          {chosen.map((p) => (
            <div key={p.playerId} data-flip-id={p.playerId}>
              <VersusCard
                player={p}
                verdict={verdictOf(p.playerId)}
                team={p.teamId ? teams[p.teamId] : undefined}
                role={roleOf(p.playerId)}
                scaleMax={scaleMax}
                compact={compact}
              />
            </div>
          ))}
        </div>
      )}

      {chosen.length >= 2 &&
        (sameFormat ? (
          <Verdict
            result={fresh ?? sameFormat}
            updating={!fresh}
            aiSummary={ai.text}
            aiLoading={ai.loading}
            outsideIds={outsideIds}
          />
        ) : error ? (
          <ErrorState what={`Couldn't work it out: ${error}`} onRetry={refresh} />
        ) : (
          <VerdictSkeleton />
        ))}

      {fresh && <TheMath players={fresh.players} />}
    </div>
  );
}
