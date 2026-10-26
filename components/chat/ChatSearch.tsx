"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserAvatar } from "@/components/auth/UserAvatar";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { searchMessages, searchProfiles, type MessageHit } from "@/lib/chat/api";
import { maskProfanity } from "@/lib/chat/profanity";
import { CHANNELS, roomHref } from "@/lib/chat/rooms";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { sinceLabel } from "@/lib/chat/time";
import type { ChannelSlug, ChatProfile, ChatRoomInfo, RoomRef } from "@/lib/chat/types";
import { visibleTeamColor } from "@/lib/color";
import { normalizeName, searchPlayers, usePlayers } from "@/lib/hooks/usePlayers";
import { useNow } from "@/lib/hooks/useNow";
import { useTeams } from "@/lib/hooks/useTeams";
import { openUser } from "@/lib/nav/query";
import { requireSupabase } from "@/lib/supabase/client";

function roomOf(info: ChatRoomInfo | null): RoomRef | null {
  if (!info) return null;
  if (info.type === "global") return { type: "global" };
  if (info.type === "channel" && info.slug) return { type: "channel", slug: info.slug as ChannelSlug };
  if (info.type === "game" && info.refId) return { type: "game", gameId: info.refId };
  if (info.type === "player" && info.refId) return { type: "player", playerId: info.refId };
  if (info.type === "league" && info.refId) return { type: "league", leagueId: info.refId };
  return null;
}

function roomName(info: ChatRoomInfo | null, playerName: (id: string) => string | undefined) {
  if (!info) return "a room";
  if (info.type === "global") return "General";
  if (info.type === "channel") return CHANNELS.find((c) => c.key === info.slug)?.title ?? info.title ?? "Channel";
  if (info.type === "player") return (info.refId && playerName(info.refId)) ?? info.title ?? "Player room";
  if (info.type === "game") return info.title ?? "Game room";
  return info.title ?? "League chat";
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="flex h-8 items-center px-2.5 text-[12px] font-medium text-faint">{title}</h3>
      <ul className="flex flex-col gap-0.5">{children}</ul>
    </section>
  );
}

/**
 * Search across chat: channels and players straight away (from what the app already has),
 * then people and messages from the server (only rooms you can see, minus people you blocked).
 */
export function ChatSearch({ query, me, onPick }: { query: string; me: string; onPick: () => void }) {
  const { players } = usePlayers();
  const teams = useTeams();
  const now = useNow(60_000);
  const [remote, setRemote] = useState<{ q: string; people: ChatProfile[]; messages: MessageHit[]; failed: boolean } | null>(null);
  const q = query.trim();
  const words = normalizeName(q);

  useEffect(() => {
    if (q.length < 2) return;
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const supabase = await requireSupabase();
        const [people, messages] = await Promise.all([searchProfiles(supabase, q), searchMessages(supabase, q)]);
        if (alive) setRemote({ q, people: people.filter((p) => p.id !== me), messages, failed: false });
      } catch {
        if (alive) setRemote({ q, people: [], messages: [], failed: true });
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, me]);

  const channels = CHANNELS.filter((c) => normalizeName(`${c.title} ${c.description}`).includes(words));
  const abbr = (id: string | null) => (id ? (teams[id]?.abbr ?? null) : null);
  const matches = players ? searchPlayers(players, q, abbr, 5) : [];
  const playerName = (id: string) => players?.find((p) => p.id === id)?.name;
  const loading = q.length >= 2 && remote?.q !== q;
  const people = remote?.q === q ? remote.people : [];
  const messages = remote?.q === q ? remote.messages : [];
  const nothing = !loading && channels.length === 0 && matches.length === 0 && people.length === 0 && messages.length === 0;

  return (
    <div className="flex flex-col gap-3" aria-live="polite">
      {channels.length > 0 && (
        <Group title="Channels">
          {channels.map((c) => (
            <li key={c.key}>
              <Link href={`/chat/${c.key}`} onClick={onPick} className="flex min-h-11 items-center gap-3 rounded-xl px-2.5 hover:bg-raised">
                <Icon name="hash" size={18} className="text-muted" />
                <span className="text-[14px] font-medium">{c.title}</span>
              </Link>
            </li>
          ))}
        </Group>
      )}
      {matches.length > 0 && (
        <Group title="Player rooms">
          {matches.map((p) => {
            const team = p.teamId ? teams[p.teamId] : undefined;
            return (
              <li key={p.id}>
                <Link
                  href={roomHref({ type: "player", playerId: p.id })}
                  onClick={onPick}
                  className="flex min-h-12 items-center gap-3 rounded-xl px-2.5 hover:bg-raised"
                >
                  <PlayerAvatar
                    name={p.name}
                    headshot={p.position === "DST" ? team?.logo : p.headshot}
                    teamColor={visibleTeamColor(team)}
                    size={30}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.name}</span>
                  <span className="shrink-0 text-[12px] text-faint">
                    {p.position === "DST" ? "D/ST" : p.position} · {team?.abbr ?? "FA"}
                  </span>
                </Link>
              </li>
            );
          })}
        </Group>
      )}
      {people.length > 0 && (
        <Group title="People">
          {people.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => openUser(p.username)}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 text-left hover:bg-raised"
              >
                <UserAvatar username={p.username} avatarUrl={p.avatarUrl} size={30} />
                <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{p.displayName ?? p.username}</span>
                <span className="shrink-0 text-[12px] text-faint">@{p.username}</span>
              </button>
            </li>
          ))}
        </Group>
      )}
      {messages.length > 0 && (
        <Group title="Messages">
          {messages.map((hit) => {
            const room = roomOf(hit.room);
            const text = maskProfanity(decodeMessageBody(hit.message.body).text);
            const body = (
              <>
                <span className="flex items-baseline gap-2 text-[12px] text-faint">
                  <span className="truncate font-medium text-muted">@{hit.author?.username ?? "someone"}</span>
                  <span className="truncate">in {roomName(hit.room, playerName)}</span>
                  <span className="ml-auto shrink-0">{sinceLabel(hit.message.createdAt, now)}</span>
                </span>
                <span className="line-clamp-2 text-[14px] leading-5">{text}</span>
              </>
            );
            return (
              <li key={hit.message.id}>
                {room ? (
                  <Link
                    href={`${roomHref(room)}${hit.message.threadId ? `?thread=${hit.message.threadId}` : ""}`}
                    onClick={onPick}
                    className="flex flex-col gap-0.5 rounded-xl px-2.5 py-2 hover:bg-raised"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="flex flex-col gap-0.5 px-2.5 py-2">{body}</div>
                )}
              </li>
            );
          })}
        </Group>
      )}
      {loading && (
        <p className="flex items-center gap-2 px-2.5 text-[13px] text-muted" role="status">
          <span className="skeleton size-3 rounded-full" /> Searching messages and people…
        </p>
      )}
      {remote?.q === q && remote.failed && <p className="px-2.5 text-[13px] text-muted">Message search isn&apos;t available right now.</p>}
      {nothing && q.length >= 2 && <p className="px-2.5 py-3 text-[14px] text-muted">Nothing matches “{q}”.</p>}
      {q.length < 2 && channels.length === 0 && matches.length === 0 && (
        <p className="px-2.5 py-3 text-[14px] text-muted">Keep typing to search messages and people.</p>
      )}
    </div>
  );
}
