"use client";

import Link from "next/link";
import { PlayerLink } from "@/components/player/PlayerLink";
import { Icon } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { LiveDot } from "@/components/ui/bits";
import { roomHref } from "@/lib/chat/rooms";
import type { ChatPoll, PlayerRef, TradeCard } from "@/lib/chat/types";
import { visibleTeamColor } from "@/lib/color";
import { useScoreboard } from "@/lib/fantasy/context";
import { kickoffLabel } from "@/lib/format";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useNow } from "@/lib/hooks/useNow";
import { usePlayerIndex } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";

/** "@Josh Allen" inside a message: opens the one player profile. Uses the app's own name for the id. */
export function PlayerMention({ player }: { player: PlayerRef }) {
  const index = usePlayerIndex();
  const known = index.get(player.id);
  return (
    <PlayerLink id={player.id} className="rounded-md bg-well px-1 py-px font-medium text-ink hover:underline">
      @{known?.name ?? player.name}
    </PlayerLink>
  );
}

/** One player in a card: photo, name, position · team. */
function PlayerLine({ player }: { player: PlayerRef }) {
  const index = usePlayerIndex();
  const teams = useTeams();
  const known = index.get(player.id);
  const team = known?.teamId ? teams[known.teamId] : undefined;
  return (
    <PlayerLink id={player.id} className="flex min-w-0 items-center gap-2 rounded-lg py-1 hover:underline">
      <PlayerAvatar
        name={known?.name ?? player.name}
        headshot={known?.position === "DST" ? team?.logo : (known?.headshot ?? null)}
        teamColor={visibleTeamColor(team)}
        size={28}
      />
      <span className="min-w-0">
        <span className="block text-[13px] leading-4 font-medium break-words">{known?.name ?? player.name}</span>
        {known && (
          <span className="block truncate text-[11px] text-faint">
            {known.position === "DST" ? "D/ST" : known.position} · {team?.abbr ?? "FA"}
          </span>
        )}
      </span>
    </PlayerLink>
  );
}

/** A trade someone wants a second opinion on, with a link to run it through the calculator. */
export function TradeCardView({ trade }: { trade: TradeCard }) {
  const href = `/team/trades?tool=calculator&give=${trade.give.map((p) => p.id).join(",")}&get=${trade.get.map((p) => p.id).join(",")}`;
  return (
    <div className="well flex w-full max-w-[420px] flex-col gap-2 p-3">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted">
        <Icon name="swap" size={14} /> Trade idea
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["give", "get"] as const).map((side) => (
          <div key={side} className="min-w-0">
            <p className="mb-0.5 text-[11px] text-faint">{side === "give" ? "Gives" : "Gets"}</p>
            {trade[side].map((p) => (
              <PlayerLine key={p.id} player={p} />
            ))}
          </div>
        ))}
      </div>
      <Link href={href} className="self-start text-[13px] font-medium text-ink underline-offset-4 hover:underline">
        Check it in the trade calculator
      </Link>
    </div>
  );
}

/** A game someone pointed to: the live score from ESPN (never the author's copy), with links. */
export function GameCardView({ gameId }: { gameId: string }) {
  const { data } = useScoreboard();
  const hydrated = useHydrated();
  const game = data?.games.find((g) => g.id === gameId);
  if (!game) {
    return (
      <Link href={`/games/${gameId}`} className="well flex items-center gap-2 p-3 text-[13px] hover:underline">
        <Icon name="football" size={16} /> Open the game
      </Link>
    );
  }
  const live = game.state === "in";
  return (
    <div className="well flex w-full max-w-[420px] items-center gap-3 p-3">
      <span className="flex -space-x-1.5" aria-hidden="true">
        <TeamLogo abbr={game.away.team.abbr} logo={game.away.team.logo} color={game.away.team.color} size={28} />
        <TeamLogo abbr={game.home.team.abbr} logo={game.home.team.logo} color={game.home.team.color} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="tabular block text-[14px] font-semibold">
          {game.away.team.abbr} {game.state !== "pre" ? game.away.score : ""} @ {game.home.team.abbr}{" "}
          {game.state !== "pre" ? game.home.score : ""}
        </span>
        <span className={`flex items-center gap-1.5 text-[12px] ${live ? "text-live" : "text-muted"}`}>
          {live && <LiveDot />}
          {game.state === "pre" ? (hydrated ? kickoffLabel(game.kickoff) : "Upcoming") : game.statusText}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-0.5 text-[12px]">
        <Link href={`/games/${game.id}`} className="font-medium text-ink hover:underline">
          Game center
        </Link>
        <Link href={roomHref({ type: "game", gameId: game.id })} className="text-muted hover:text-ink">
          Game chat
        </Link>
      </span>
    </div>
  );
}

function closesLabel(closesAt: string | null, now: number) {
  if (!closesAt) return null;
  const left = Date.parse(closesAt) - now;
  if (left <= 0) return "Closed";
  const minutes = Math.round(left / 60_000);
  if (minutes < 60) return `Closes in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `Closes in ${hours} h` : `Closes in ${Math.round(hours / 24)} days`;
}

/**
 * A poll: tap an option to vote, tap it again to take your vote back, tap another to change it.
 * Results show once you've voted (or it closed), as each option's share of the votes.
 */
export function PollCard({
  poll,
  me,
  onVote,
}: {
  poll: ChatPoll | undefined;
  me: string;
  onVote: (option: number | null) => void;
}) {
  const now = useNow(30_000);
  if (!poll) {
    return (
      <div className="well flex w-full max-w-[420px] flex-col gap-2 p-3" aria-label="Loading poll">
        <span className="skeleton h-4 w-2/3 rounded" />
        <span className="skeleton h-9 rounded-lg" />
        <span className="skeleton h-9 rounded-lg" />
      </div>
    );
  }
  const counts = poll.options.map((_, i) => Object.values(poll.votes).filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const mine = poll.votes[me];
  const closed = Boolean(poll.closesAt && now && Date.parse(poll.closesAt) <= now);
  const showResults = mine !== undefined || closed;
  const top = Math.max(...counts);
  const status = now ? closesLabel(poll.closesAt, now) : null;
  return (
    <fieldset className="well flex w-full max-w-[420px] flex-col gap-1.5 p-3">
      <legend className="sr-only">Poll: {poll.question}</legend>
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted" aria-hidden="true">
        <Icon name="poll" size={14} /> Poll
      </p>
      <p className="mb-1 text-[15px] leading-5 font-semibold">{poll.question}</p>
      {poll.options.map((option, i) => {
        const share = total ? counts[i] / total : 0;
        const chosen = mine === i;
        return (
          <button
            key={i}
            type="button"
            disabled={closed}
            onClick={() => onVote(chosen ? null : i)}
            aria-pressed={chosen}
            className="pressable relative flex min-h-10 items-center gap-2 overflow-hidden rounded-lg bg-raised px-3 text-left text-[14px] disabled:cursor-default"
          >
            {showResults && (
              <span
                aria-hidden="true"
                className={`absolute inset-y-0 left-0 rounded-lg ${counts[i] === top && top > 0 ? "bg-control" : "bg-well"}`}
                style={{ width: `${share * 100}%` }}
              />
            )}
            <span className="relative flex min-w-0 flex-1 items-center gap-2">
              {chosen && <Icon name="check" size={16} className="shrink-0" />}
              <span className="truncate">{option}</span>
            </span>
            {showResults && (
              <span className="tabular relative shrink-0 text-[13px] text-muted">
                {Math.round(share * 100)}%<span className="sr-only">, {counts[i]} votes</span>
              </span>
            )}
          </button>
        );
      })}
      <p className="mt-0.5 text-[12px] text-faint">
        {total} {total === 1 ? "vote" : "votes"}
        {status ? ` · ${status}` : ""}
        {!showResults && " · vote to see results"}
      </p>
    </fieldset>
  );
}
