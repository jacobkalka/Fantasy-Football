"use client";

import Link from "next/link";
import { useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { postMessage, resolveRoomId } from "@/lib/chat/api";
import { roomHref } from "@/lib/chat/rooms";
import { encodeSharedPlay, SHARE_COMMENT_MAX, sharedPlayFromFeedItem } from "@/lib/chat/shared-play";
import type { RoomRef } from "@/lib/chat/types";
import type { FeedItem } from "@/lib/live/types";
import { useAuth } from "@/lib/supabase/auth";
import { requireSupabase } from "@/lib/supabase/client";
import { friendlyDbError } from "@/lib/supabase/db-errors";
import { SharedPlayCard } from "./SharedPlayCard";
import { Sheet } from "./Sheet";

const DESTINATIONS = [
  { value: "game", label: "This game's room" },
  { value: "global", label: "Everyone" },
] as const;
type Destination = (typeof DESTINATIONS)[number]["value"];

function ShareForm({ item, userId, onClose }: { item: FeedItem; userId: string; onClose: () => void }) {
  const play = sharedPlayFromFeedItem(item);
  const [destination, setDestination] = useState<Destination>("game");
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const room: RoomRef = destination === "game" ? { type: "game", gameId: item.gameId } : { type: "global" };

  async function share(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setError(null);
    try {
      const supabase = await requireSupabase();
      const { id } = await resolveRoomId(supabase, room);
      await postMessage(supabase, {
        roomId: id,
        userId,
        body: encodeSharedPlay(play, comment),
        sharedPlayId: play.playId.slice(0, 64),
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
        <div>
          <p className="text-[12px] text-gain">✓ Shared</p>
          <h2 className="text-[20px] leading-7 font-semibold text-ink">
            {destination === "game" ? "Posted in the game room" : "Posted for everyone"}
          </h2>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="glass-chip min-h-12 flex-1 rounded-2xl text-[15px] text-ink-soft">
            Done
          </button>
          <Link
            href={roomHref(room)}
            onClick={onClose}
            className="glass-gain pressable flex min-h-12 flex-[2] items-center justify-center rounded-2xl text-[12px] font-bold text-gain"
          >
            Open the chat →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={share} className="flex flex-col gap-4">
      <h2 className="text-[20px] leading-7 font-semibold text-ink">Share this play</h2>
      <SharedPlayCard play={play} />
      <Segmented options={DESTINATIONS} value={destination} onChange={setDestination} label="Share to" />
      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between text-[12px] text-muted">
          <span>Add a comment (optional)</span>
          <span className="tabular-nums">
            {comment.length}/{SHARE_COMMENT_MAX}
          </span>
        </span>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={SHARE_COMMENT_MAX}
          placeholder="Called it."
          className="glass-chip min-h-12 w-full rounded-2xl px-4 text-[16px] text-ink outline-none placeholder:text-muted/70 focus-visible:ring-2 focus-visible:ring-gain/70"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-xl bg-alert/10 px-3 py-2 text-[13.5px] text-alert ring-1 ring-alert/30">
          ⚠ {error}
        </p>
      )}
      <button
        type="submit"
        disabled={status === "sending"}
        className="glass-gain pressable min-h-12 rounded-2xl text-[12px] font-bold text-gain disabled:opacity-50"
      >
        {status === "sending" ? "Sharing…" : "Share to chat"}
      </button>
    </form>
  );
}

/**
 * "Share to chat" on a feed card. Only there when chat is available: the
 * database is connected and you're signed in. Injury notes can't be shared.
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
        className="relative -mr-1 -mb-1 flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[12px] text-muted transition-colors after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:bg-white/5 hover:text-ink"
        aria-label={`Share ${item.playerName}'s play to chat`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 5h16v11H9l-5 4z" />
          <path d="M12 8v5M9.5 10.5 12 8l2.5 2.5" />
        </svg>
        Share to chat
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Share this play">
        {open && <ShareForm item={item} userId={auth.user.id} onClose={() => setOpen(false)} />}
      </Sheet>
    </div>
  );
}
