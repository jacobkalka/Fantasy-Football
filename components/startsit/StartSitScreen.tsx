"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { TiltCard } from "@/components/motion/TiltCard";
import { Notice, SectionLabel, Skeleton } from "@/components/ui/bits";
import { Segmented } from "@/components/ui/Segmented";
import { usePoll } from "@/lib/hooks/usePoll";
import { useTeams } from "@/lib/hooks/useTeams";
import { useRoster } from "@/lib/roster/store";
import type { ScoringFormat } from "@/lib/scoring";
import { comparable, defaultPick, pickFromUrl, togglePick } from "@/lib/startsit/pick";
import type { StartSitResult } from "@/lib/startsit/types";
import { PlayerPicker } from "./PlayerPicker";
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

function EmptyInvite() {
  return (
    <TiltCard className="glass flex flex-col items-center gap-4 px-6 py-10 text-center">
      <motion.div
        className="font-display text-7xl leading-none font-bold text-gain [text-shadow:0_0_40px_var(--color-gain)]"
        animate={{ rotateY: [0, 18, 0, -18, 0] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        aria-hidden="true"
      >
        VS
      </motion.div>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-3xl font-bold tracking-wide uppercase">Add your team first</h2>
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Start/Sit compares players on your roster. Add your players and we&apos;ll tell you who to start, how sure we
          are, and why.
        </p>
      </div>
      <Link
        href="/team/edit"
        transitionTypes={["nav-forward"]}
        className="glass-gain pressable rounded-2xl px-6 py-3 font-mono text-[12px] font-bold tracking-[0.12em] text-gain uppercase"
      >
        Add players
      </Link>
    </TiltCard>
  );
}

export function StartSitScreen() {
  const { roster, ready } = useRoster();
  const teams = useTeams();
  const params = useSearchParams();
  // Null until you tap a player: until then the URL (or a sensible default) decides.
  const [picked, setPicked] = useState<string[] | null>(null);
  const [formatChoice, setFormatChoice] = useState<ScoringFormat | null>(null);

  const players = comparable(roster.players);
  const fromUrl = pickFromUrl(params.get("ids"), roster.players);
  const selection = picked ?? (fromUrl.length >= 2 ? fromUrl : defaultPick(roster.players));
  const format = formatChoice ?? roster.format;

  // Sorted ids: A-vs-B and B-vs-A share one cached answer.
  const query = selection.length >= 2 ? `ids=${[...selection].sort().join(",")}&format=${format}` : null;
  const { data, error, refresh } = usePoll<StartSitResult>(query ? `/api/startsit?${query}` : null, {
    intervalMs: 5 * 60_000,
  });
  const sameFormat = data?.format === format ? data : undefined;
  const fresh =
    sameFormat && sameSet(sameFormat.players.map((p) => p.playerId), selection) ? sameFormat : undefined;
  const ai = useAiSummary(fresh?.aiAvailable && fresh.recommendation ? query : null);

  function choose(next: string[]) {
    setPicked(next);
    const url = next.length ? `${window.location.pathname}?ids=${next.join(",")}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }

  if (!ready) return <Skeleton className="h-96 rounded-3xl" />;
  if (roster.players.length === 0) return <EmptyInvite />;
  if (players.length < 2) {
    return (
      <Notice title="Not enough players yet">
        Start/Sit compares quarterbacks, running backs, receivers and tight ends. Add at least two of them on{" "}
        <Link href="/team/edit" className="text-gain underline underline-offset-2">
          Edit team
        </Link>
        .
      </Notice>
    );
  }

  const chosen = selection.map((id) => players.find((p) => p.playerId === id)).filter((p) => p !== undefined);
  const rec = fresh?.recommendation;
  const roleOf = (id: string): CardRole => (!rec ? null : id === rec.startId ? "start" : "sit");
  const verdictOf = (id: string) => sameFormat?.players.find((p) => p.playerId === id);
  // One scale for every card's floor/ceiling bar.
  const scaleMax = Math.max(10, ...chosen.map((p) => verdictOf(p.playerId)?.ceiling ?? 0)) * 1.05;
  const compact = chosen.length > 2;

  return (
    <div className="flex flex-col gap-5">
      <PlayerPicker players={players} picked={selection} teams={teams} onToggle={(id) => choose(togglePick(selection, id))} />

      <div className="flex items-center justify-between gap-3">
        <SectionLabel className="pb-0">Head to head</SectionLabel>
        <Segmented options={FORMATS} value={format} onChange={setFormatChoice} label="Scoring format" className="w-44" />
      </div>

      {chosen.length < 2 ? (
        <Notice title="Pick one more">Tap another player above to compare.</Notice>
      ) : (
        <div className={`relative grid items-stretch ${compact ? "grid-cols-3 gap-2" : "grid-cols-2 gap-3"}`}>
          {chosen.map((p) => (
            <motion.div key={p.playerId} layout transition={{ type: "spring", stiffness: 300, damping: 30 }}>
              <VersusCard
                player={p}
                verdict={verdictOf(p.playerId)}
                team={p.teamId ? teams[p.teamId] : undefined}
                role={roleOf(p.playerId)}
                scaleMax={scaleMax}
                compact={compact}
              />
            </motion.div>
          ))}
          {!compact && (
            <motion.div
              key={selection.join(",")}
              className="glass-chip pointer-events-none absolute top-[34%] left-1/2 z-10 grid size-12 -translate-x-1/2 place-items-center rounded-full font-display text-xl font-bold tracking-wide text-ink-strong"
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.1 }}
              aria-hidden="true"
            >
              VS
            </motion.div>
          )}
        </div>
      )}

      {chosen.length >= 2 &&
        (sameFormat ? (
          <Verdict result={fresh ?? sameFormat} updating={!fresh} aiSummary={ai.text} aiLoading={ai.loading} />
        ) : error ? (
          <Notice title="Couldn't work it out" tone="warn">
            {error}{" "}
            <button type="button" onClick={refresh} className="text-gain underline underline-offset-2">
              Try again
            </button>
          </Notice>
        ) : (
          <VerdictSkeleton />
        ))}

      {fresh && <TheMath players={fresh.players} />}

      <p className="px-1 text-center font-mono text-[10px] tracking-[0.06em] text-muted uppercase">
        Projections are estimates, not guarantees.
      </p>
    </div>
  );
}
