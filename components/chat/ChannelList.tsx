"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveDot } from "@/components/ui/bits";
import { maskProfanity } from "@/lib/chat/profanity";
import { CHANNELS, roomHref } from "@/lib/chat/rooms";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { shortSince } from "@/lib/chat/time";
import type { ChatRoomInfo } from "@/lib/chat/types";
import { unreadStore, useUnread } from "@/lib/chat/unread";
import { visibleTeamColor } from "@/lib/color";
import { useScoreboard } from "@/lib/fantasy/context";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useNow } from "@/lib/hooks/useNow";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { Game } from "@/lib/providers/types";
import { useTeamsState } from "@/lib/teams/store";
import { ChatSearch } from "./ChatSearch";

const ORDER = { in: 0, pre: 1, post: 2 } as const;
const GAMES_SHOWN = 6;

function UnreadCount({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="tabular grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1.5 text-[11px] font-semibold text-black">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}

/** One row: what it is (line 1, bold when unread) and the latest or what it's for (line 2). */
function Row({
  href,
  active,
  lead,
  title,
  sub,
  time,
  unread,
  live,
}: {
  href: string;
  active: boolean;
  lead: React.ReactNode;
  title: React.ReactNode;
  sub: React.ReactNode;
  time?: string;
  unread: number;
  live?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={`flex min-h-[58px] items-center gap-3 rounded-xl px-2.5 py-2 transition-colors ${active ? "bg-well" : "hover:bg-raised"}`}
      >
        <span className="grid size-9 shrink-0 place-items-center">{lead}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className={`min-w-0 flex-1 truncate text-[14px] ${unread ? "font-semibold" : "font-medium"}`}>{title}</span>
            {time && <span className="shrink-0 text-[11px] text-faint">{time}</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={`flex min-w-0 flex-1 items-center gap-1.5 truncate text-[13px] ${live ? "text-live" : unread ? "text-ink" : "text-muted"}`}>
              {live && <LiveDot />}
              <span className="truncate">{sub}</span>
            </span>
            <UnreadCount count={unread} />
          </span>
        </span>
      </Link>
    </li>
  );
}

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col">
      <h2 className="flex h-8 items-center justify-between px-2.5 text-[12px] font-medium text-faint">
        {title}
        {action}
      </h2>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

function preview(latest: { body: string } | undefined) {
  if (!latest) return null;
  const { play, text } = decodeMessageBody(latest.body);
  return maskProfanity(text) || (play ? `Shared a play: ${play.playerName}` : null);
}

function gameLine(game: Game, hydrated: boolean) {
  if (game.state === "pre") return hydrated ? kickoffLabel(game.kickoff) : "Upcoming";
  return `${game.away.score}–${game.home.score} · ${game.statusText}`;
}

/**
 * The chat's channel list: General and the topic channels, a room for each game this week
 * (live ones first, with the score), your private league rooms, and player rooms people are
 * talking in. Unread counts come from the server, so they match on every device.
 */
export function ChannelList({ me, active }: { me: string; active: string | null }) {
  const unread = useUnread(me);
  const { data: board } = useScoreboard();
  const { value: teamsState } = useTeamsState();
  const players = usePlayerIndex();
  const nflTeams = useTeams();
  const hydrated = useHydrated();
  const now = useNow(60_000);
  const [query, setQuery] = useState("");
  const [allGames, setAllGames] = useState(false);

  const byKey = (find: (r: ChatRoomInfo) => boolean) => unread.rooms.find(find);
  const countOf = (room: ChatRoomInfo | undefined) => (room ? (unread.counts[room.id] ?? 0) : 0);

  const games = [...(board?.games ?? [])].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.kickoff.localeCompare(b.kickoff));
  const shownGames = allGames ? games : games.filter((g, i) => g.state === "in" || i < GAMES_SHOWN);

  const leagues = new Map<string, { id: string; name: string; logo: string | null }>();
  for (const t of teamsState.teams) {
    if (t.espn && !leagues.has(t.espn.leagueId)) leagues.set(t.espn.leagueId, { id: t.espn.leagueId, name: t.espn.leagueName, logo: t.espn.logo });
  }
  for (const r of unread.rooms) {
    if (r.type === "league" && r.refId && !leagues.has(r.refId)) leagues.set(r.refId, { id: r.refId, name: r.title ?? "League chat", logo: null });
  }

  const playerRooms = unread.rooms
    .filter((r) => r.type === "player" && r.refId)
    .sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    .slice(0, 12);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-1 pb-2">
        <label className="flex h-10 items-center gap-2 rounded-full bg-raised px-3.5 focus-within:ring-2 focus-within:ring-accent">
          <Icon name="search" size={17} className="text-faint" />
          <span className="sr-only">Search chat</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages, people, players"
            className="min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint lg:text-[14px]"
            type="search"
            autoComplete="off"
          />
        </label>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
        {query.trim() ? (
          <ChatSearch query={query} me={me} onPick={() => setQuery("")} />
        ) : (
          <div className="flex flex-col gap-4">
            <Section title="Channels">
              {CHANNELS.map((channel) => {
                const room = byKey((r) => r.slug === channel.key);
                const latest = room ? unread.latest[room.id] : undefined;
                return (
                  <Row
                    key={channel.key}
                    href={`/chat/${channel.key}`}
                    active={active === channel.key || (channel.key === "general" && active === "global")}
                    lead={<Icon name="hash" size={20} className="text-muted" />}
                    title={channel.title}
                    sub={preview(latest) ?? channel.description}
                    time={shortSince(room?.lastMessageAt ?? null, now)}
                    unread={countOf(room)}
                  />
                );
              })}
            </Section>

            <Section
              title={board ? `Games · Week ${board.week}` : "Games"}
              action={
                games.length > shownGames.length || allGames ? (
                  <button type="button" onClick={() => setAllGames((v) => !v)} className="text-[12px] text-muted hover:text-ink">
                    {allGames ? "Fewer" : `All ${games.length}`}
                  </button>
                ) : null
              }
            >
              {!board &&
                [0, 1, 2].map((i) => (
                  <li key={i} className="flex h-[58px] items-center gap-3 px-2.5" aria-hidden="true">
                    <span className="skeleton size-9 rounded-full" />
                    <span className="flex flex-1 flex-col gap-1.5">
                      <span className="skeleton h-3.5 w-24 rounded" />
                      <span className="skeleton h-3 w-32 rounded" />
                    </span>
                  </li>
                ))}
              {board && games.length === 0 && <li className="px-2.5 py-2 text-[13px] text-muted">No games this week.</li>}
              {shownGames.map((game) => {
                const key = `game-${game.id}`;
                const room = byKey((r) => r.type === "game" && r.refId === game.id);
                return (
                  <Row
                    key={game.id}
                    href={roomHref({ type: "game", gameId: game.id })}
                    active={active === key}
                    lead={
                      <span className="relative block size-9" aria-hidden="true">
                        <span className="absolute top-0 left-0">
                          <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={24} />
                        </span>
                        <span className="absolute right-0 bottom-0">
                          <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={24} />
                        </span>
                      </span>
                    }
                    title={`${game.away.team.abbr} @ ${game.home.team.abbr}`}
                    sub={gameLine(game, hydrated)}
                    live={game.state === "in"}
                    time={shortSince(room?.lastMessageAt ?? null, now)}
                    unread={countOf(room)}
                  />
                );
              })}
            </Section>

            <Section title="Your leagues">
              {leagues.size === 0 && (
                <li className="px-2.5 py-1 text-[13px] leading-5 text-muted">
                  <Link href="/team/connect" className="font-medium text-ink hover:underline">
                    Connect an ESPN league
                  </Link>{" "}
                  for a private room with just your league.
                </li>
              )}
              {[...leagues.values()].map((league) => {
                const room = byKey((r) => r.type === "league" && r.refId === league.id);
                return (
                  <Row
                    key={league.id}
                    href={roomHref({ type: "league", leagueId: league.id })}
                    active={active === `league-${league.id}`}
                    lead={<Icon name="lock" size={18} className="text-muted" />}
                    title={league.name}
                    sub={room ? (preview(unread.latest[room.id]) ?? "Private · members only") : "Private · confirm you're in it to join"}
                    time={shortSince(room?.lastMessageAt ?? null, now)}
                    unread={countOf(room)}
                  />
                );
              })}
            </Section>

            {playerRooms.length > 0 && (
              <Section title="Player rooms">
                {playerRooms.map((room) => {
                  const player = players.get(room.refId!);
                  const team = player?.teamId ? nflTeams[player.teamId] : undefined;
                  return (
                    <Row
                      key={room.id}
                      href={roomHref({ type: "player", playerId: room.refId! })}
                      active={active === `player-${room.refId}`}
                      lead={
                        <PlayerAvatar
                          name={player?.name ?? room.title ?? "Player"}
                          headshot={player?.position === "DST" ? team?.logo : (player?.headshot ?? null)}
                          teamColor={visibleTeamColor(team)}
                          size={34}
                        />
                      }
                      title={player?.name ?? room.title ?? "Player room"}
                      sub={preview(unread.latest[room.id]) ?? (player ? `${player.position} · ${team?.abbr ?? "FA"}` : "Player room")}
                      time={shortSince(room.lastMessageAt, now)}
                      unread={countOf(room)}
                    />
                  );
                })}
              </Section>
            )}
            {unread.status === "error" && (
              <p className="px-2.5 text-[13px] text-muted">
                Unread counts aren&apos;t available right now.{" "}
                <button type="button" onClick={() => void unreadStore.refresh()} className="font-medium text-ink underline">
                  Try again
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
