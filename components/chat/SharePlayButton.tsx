"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";
import { postMessage, resolveRoom } from "@/lib/chat/api";
import { roomHref } from "@/lib/chat/rooms";
import { encodeSharedPlay, SHARE_COMMENT_MAX, sharedPlayFromFeedItem } from "@/lib/chat/shared-play";
import type { RoomRef } from "@/lib/chat/types";
import type { FeedItem } from "@/lib/live/types";
import { useAuth } from "@/lib/supabase/auth";
import { requireSupabase } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/supabase/db-errors";
import { SharedPlayCard } from "./SharedPlayCard";

const DESTINATIONS = [
  { value: "game", label: "This game's room" },
  { value: "player", label: "Player's room" },
  { value: "global", label: "General" },
] as const;
type Destination = (typeof DESTINATIONS)[number]["value"];

function ShareForm({ item, userId, onClose }: { item: FeedItem; userId: string; onClose: () => void }) {
  const play = sharedPlayFromFeedItem(item);
  const [destination, setDestination] = useState<Destination>("game");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const room: RoomRef =
    destination === "game"
      ? { type: "game", gameId: item.gameId }
      : destination === "player"
        ? { type: "player", playerId: item.playerId }
        : { type: "global" };

  async function share(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const supabase = await requireSupabase();
      const { id } = await resolveRoom(supabase, room, item.playerName);
      await postMessage(supabase, {
        roomId: id,
        userId,
        message: { body: encodeSharedPlay(play, comment), sharedPlayId: play.playId.slice(0, 64) },
      });
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(friendlyDbError(err, "share"));
    }
  }

  if (status === "sent") {
    return (
      <div className="flex flex-col gap-4" role="status">
        <p className="flex items-center gap-2 text-[16px] font-semibold">
          <Icon name="check" /> Shared to {DESTINATIONS.find((d) => d.value === destination)?.label.toLowerCase()}
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Done</Button>
          <ButtonLink href={roomHref(room)} variant="primary" onClick={onClose}>
            Open the chat
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={share} className="flex flex-col gap-4">
      <SharedPlayCard play={play} />
      <Segmented options={DESTINATIONS} value={destination} onChange={setDestination} label="Share to" />
      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-[13px] text-muted">
          <span>Add a comment (optional)</span>
          <span className="tabular">
            {comment.length}/{SHARE_COMMENT_MAX}
          </span>
        </span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={SHARE_COMMENT_MAX}
          placeholder="Called it."
          className="h-11 w-full rounded-xl bg-raised px-3 text-[16px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
        />
      </label>
      {error && (
        <p role="alert" className="text-[14px] text-negative">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" disabled={status === "sending"}>
        {status === "sending" ? "Sharing…" : "Share to chat"}
      </Button>
    </form>
  );
}

/**
 * "Share to chat" on a feed card. Only there when chat is available: the database is
 * connected and you're signed in. Injury notes can't be shared.
 */
export function SharePlayButton({ item }: { item: FeedItem }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  if (auth.status !== "signed-in" || item.kind !== "points" || !item.playId) return null;
  return (
    <div className="flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="-mr-1 -mb-1 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted transition-colors hover:bg-raised hover:text-ink"
        aria-label={`Share ${item.playerName}'s play to chat`}
      >
        <Icon name="share" size={14} />
        Share to chat
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Share this play">
        {open && <ShareForm item={item} userId={auth.user.id} onClose={() => setOpen(false)} />}
      </Sheet>
    </div>
  );
}
