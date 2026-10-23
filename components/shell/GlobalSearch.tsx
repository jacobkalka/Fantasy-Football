"use client";

import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { Pill } from "@/components/ui/Card";
import { Sheet } from "@/components/ui/Sheet";
import { ErrorState, SkeletonRows } from "@/components/ui/States";
import { visibleTeamColor } from "@/lib/color";
import { searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import { useRoster } from "@/lib/roster/store";

const POSITION_LABEL: Record<string, string> = { DST: "D/ST" };

/**
 * Search any NFL player from anywhere: ⌘K / Ctrl+K or "/" on a keyboard, the magnifier
 * on a phone. Results say whether a player is already on your team; Enter opens the profile.
 */
export function GlobalSearch({ variant }: { variant: "field" | "icon" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (variant !== "field") return;
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {variant === "field" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-full bg-surface px-4 text-left text-[14px] text-faint transition-colors hover:bg-raised"
        >
          <Icon name="search" size={18} />
          <span className="flex-1">Search any player</span>
          <kbd className="rounded-md bg-well px-1.5 py-0.5 font-sans text-[12px] text-muted">⌘K</kbd>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search players"
          className="pressable grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
        >
          <Icon name="search" />
        </button>
      )}
      <Sheet open={open} onClose={close} title="Search players" hideTitle size="md">
        {open && <SearchBody onDone={close} />}
      </Sheet>
    </>
  );
}

function SearchBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { players, error, retry } = usePlayers();
  const teams = useTeams();
  const { roster } = useRoster();
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);

  const mine = useMemo(() => new Set(roster.players.map((p) => p.playerId)), [roster.players]);
  const results = useMemo(
    () => (players ? searchPlayers(players, deferred, (id) => (id ? (teams[id]?.abbr ?? null) : null), 30) : []),
    [players, deferred, teams],
  );

  useEffect(() => {
    // The native dialog focuses its first control (the close button); search is what people want.
    input.current?.focus();
  }, []);

  const go = (id: string) => {
    onDone();
    router.push(`/players/${encodeURIComponent(id)}`);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-1">
        <label className="flex h-11 items-center gap-2.5 rounded-full bg-raised px-4 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" size={18} className="text-faint" />
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (event.key === "Enter" && results[cursor]) {
                event.preventDefault();
                go(results[cursor].id);
              }
            }}
            placeholder="Name or team (e.g. Chase, KC)"
            aria-label="Search players"
            aria-controls={listId}
            aria-activedescendant={results[cursor] ? `${listId}-${results[cursor].id}` : undefined}
            role="combobox"
            aria-expanded="true"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-full flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-faint"
          />
          {query && (
            <button type="button" aria-label="Clear" onClick={() => setQuery("")} className="text-faint hover:text-ink">
              <Icon name="close" size={16} />
            </button>
          )}
        </label>
        <p className="mt-2 px-1 text-[12px] text-faint">
          {players ? (query ? `${results.length === 30 ? "Top 30" : results.length} matches` : "Most rostered") : " "}
        </p>
      </div>

      {error && <ErrorState what="Couldn't load the player list." onRetry={retry} />}
      {!players && !error && <SkeletonRows rows={6} />}
      {players && results.length === 0 && (
        <p className="px-1 py-6 text-[14px] text-muted">No player matches “{query}”. Try a last name or a team like “BUF”.</p>
      )}
      {players && results.length > 0 && (
        <ul id={listId} role="listbox" aria-label="Players" className="-mx-2 flex flex-col">
          {results.map((p, i) => {
            const team = p.teamId ? teams[p.teamId] : undefined;
            return (
              <li key={p.id} id={`${listId}-${p.id}`} role="option" aria-selected={i === cursor}>
                <button
                  type="button"
                  onClick={() => go(p.id)}
                  onMouseMove={() => setCursor(i)}
                  className={`flex h-14 w-full items-center gap-3 rounded-xl px-2 text-left ${i === cursor ? "bg-raised" : ""}`}
                >
                  <PlayerAvatar
                    name={p.name}
                    headshot={p.headshot}
                    teamColor={team ? visibleTeamColor(team) : undefined}
                    size={36}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] leading-5 font-medium">{p.name}</span>
                    <span className="block text-[13px] leading-5 text-muted">
                      {POSITION_LABEL[p.position] ?? p.position}
                      {team ? ` · ${team.abbr}` : " · Free agent"}
                      {p.percentOwned != null && ` · ${Math.round(p.percentOwned)}% rostered`}
                    </span>
                  </span>
                  {mine.has(p.id) && <Pill tone="accent">On your team</Pill>}
                  <Icon name="chevronRight" size={16} className="text-faint" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
