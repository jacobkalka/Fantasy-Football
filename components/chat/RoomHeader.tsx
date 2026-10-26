"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveDot } from "@/components/ui/bits";
import { channelOf } from "@/lib/chat/rooms";
import type { RoomRef } from "@/lib/chat/types";
import { visibleTeamColor } from "@/lib/color";
import { useScoreboard } from "@/lib/fantasy/context";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import { openPlayer } from "@/lib/nav/query";
import { useTeamsState } from "@/lib/teams/store";

/**
 * A game room's title: both teams, the score and the clock from ESPN, kept current on its own
 * (the conversation under it never reloads when the score changes).
 */
function GameTitle({ gameId }: { gameId: string }) {
  const { data } = useScoreboard();
  const hydrated = useHydrated();
  const game = data?.games.find((g) => g.id === gameId);
  if (!game) {
    return (
      <div className="min-w-0">
        <h1 className="text-[17px] leading-6 font-semibold">Game chat</h1>
        <p className="text-[12px] text-muted">{data ? "This game isn't on this week's schedule" : " "}</p>
      </div>
    );
  }
  const live = game.state === "in";
  const started = game.state !== "pre";
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex -space-x-1.5" aria-hidden="true">
        <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={30} />
        <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={30} />
      </span>
      <div className="min-w-0">
        <h1 className="tabular truncate text-[17px] leading-6 font-semibold">
          {game.away.team.abbr}
          {started && <span className="ml-1.5">{game.away.score}</span>}
          <span className="mx-1.5 text-faint">@</span>
          {game.home.team.abbr}
          {started && <span className="ml-1.5">{game.home.score}</span>}
        </h1>
        <p className={`flex items-center gap-1.5 text-[12px] ${live ? "text-live" : "text-muted"}`} aria-live="polite">
          {live && <LiveDot />}
          {game.state === "pre" ? (hydrated ? `Kickoff ${kickoffLabel(game.kickoff)}` : "Pregame") : game.statusText}
          {live && game.situation?.downDistance && <span className="text-muted">· {game.situation.downDistance}</span>}
        </p>
      </div>
      <Link href={`/games/${game.id}`} className="ml-1 hidden shrink-0 text-[13px] font-medium text-muted hover:text-ink sm:inline">
        Game center
      </Link>
    </div>
  );
}

function PlayerTitle({ playerId }: { playerId: string }) {
  const players = usePlayerIndex();
  const teams = useTeams();
  const player = players.get(playerId);
  const team = player?.teamId ? teams[player.teamId] : undefined;
  return (
    <button type="button" onClick={() => openPlayer(playerId)} className="flex min-w-0 items-center gap-3 text-left">
      <PlayerAvatar
        name={player?.name ?? "Player"}
        headshot={player?.position === "DST" ? team?.logo : (player?.headshot ?? null)}
        teamColor={visibleTeamColor(team)}
        size={34}
      />
      <span className="min-w-0">
        <span className="block truncate text-[17px] leading-6 font-semibold hover:underline">{player?.name ?? "Player room"}</span>
        <span className="block truncate text-[12px] text-muted">
          {player ? `${player.position === "DST" ? "D/ST" : player.position} · ${team?.abbr ?? "FA"} · Open profile` : "Talk about one player"}
        </span>
      </span>
    </button>
  );
}

function LeagueTitle({ leagueId }: { leagueId: string }) {
  const { value } = useTeamsState();
  const name = value.teams.find((t) => t.espn?.leagueId === leagueId)?.espn?.leagueName;
  return (
    <div className="min-w-0">
      <h1 className="flex items-center gap-1.5 truncate text-[17px] leading-6 font-semibold">
        <Icon name="lock" size={15} className="shrink-0 text-muted" />
        {name ?? "League chat"}
      </h1>
      <p className="text-[12px] text-muted">Private · only verified members of this ESPN league</p>
    </div>
  );
}

/** "3 here": people with this room open right now (Realtime presence), never an estimate. */
function Presence({ here, me }: { here: string[]; me: string }) {
  const others = here.filter((id) => id !== me).length;
  if (here.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted" title="People with this room open right now">
      <Icon name="eye" size={14} />
      {others === 0 ? "Just you" : `${others + 1} here`}
    </span>
  );
}

export function RoomHeader({
  room,
  here,
  me,
  live,
  actions,
}: {
  room: RoomRef;
  here: string[];
  me: string;
  live: "connecting" | "live" | "offline";
  actions?: React.ReactNode;
}) {
  const channel = channelOf(room);
  return (
    <header className="flex min-h-14 items-center gap-3 border-b border-rule px-3 py-2 lg:px-4">
      <div className="min-w-0 flex-1">
        {channel && (
          <div className="min-w-0">
            <h1 className="flex items-center gap-1 text-[17px] leading-6 font-semibold">
              <Icon name="hash" size={17} className="text-muted" />
              {channel.title}
            </h1>
            <p className="truncate text-[12px] text-muted">{channel.description}</p>
          </div>
        )}
        {room.type === "game" && <GameTitle gameId={room.gameId} />}
        {room.type === "player" && <PlayerTitle playerId={room.playerId} />}
        {room.type === "league" && <LeagueTitle leagueId={room.leagueId} />}
      </div>
      {live === "offline" ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-warning" role="status">
          <Icon name="wifiOff" size={14} /> Reconnecting…
        </span>
      ) : (
        <Presence here={here} me={me} />
      )}
      {actions}
    </header>
  );
}
