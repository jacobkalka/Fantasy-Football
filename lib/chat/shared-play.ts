/**
 * "Share this play": how a play from the feed travels inside a chat message.
 *
 * The message body starts with a marker and a small JSON summary of the play,
 * then (on the next line) whatever the person typed:
 *
 *   [play]{"v":1,"p":"4017…","g":"4017…","a":"3918298","n":"Josh Allen","t":"2","pts":9.4,"x":"J.Allen pass…","q":2,"c":"4:12","td":1}
 *   What a throw
 *
 * Everything the chat card needs is in the message, so showing it costs no extra
 * lookups. The message's shared_play_id column also holds the play id. Reading
 * it is defensive: anything malformed simply shows as ordinary text. The card
 * only ever displays these values as text (never as HTML or links).
 */
import { z } from "zod";
import type { FeedItem } from "@/lib/live/types";
import { MAX_MESSAGE_LENGTH } from "./types";

const MARKER = "[play]";

export interface SharedPlay {
  playId: string;
  gameId: string;
  playerId: string;
  playerName: string;
  teamId: string | null;
  points: number;
  text: string;
  period: number;
  clock: string;
  isTouchdown: boolean;
}

const Encoded = z.object({
  v: z.literal(1),
  p: z.string().min(1).max(64),
  g: z.string().max(64),
  a: z.string().max(32),
  n: z.string().min(1).max(60),
  t: z.string().max(10).nullable().optional(),
  pts: z.number().finite().min(-99).max(99),
  x: z.string().max(400),
  q: z.number().int().min(0).max(20),
  c: z.string().max(10),
  td: z.union([z.literal(0), z.literal(1)]).optional(),
});

/** The longest comment that fits next to a shared play. */
export const SHARE_COMMENT_MAX = 140;

export function sharedPlayFromFeedItem(item: FeedItem): SharedPlay {
  return {
    playId: item.playId,
    gameId: item.gameId,
    playerId: item.playerId,
    playerName: item.playerName,
    teamId: item.teamId,
    points: Math.round(item.points * 100) / 100,
    text: item.text,
    period: item.period,
    clock: item.clock,
    isTouchdown: item.isTouchdown,
  };
}

/** Builds the message body for a shared play, trimmed to fit the 500-character limit. */
export function encodeSharedPlay(play: SharedPlay, comment = ""): string {
  const note = comment.trim().slice(0, SHARE_COMMENT_MAX);
  const payload = {
    v: 1,
    p: play.playId.slice(0, 64),
    g: play.gameId.slice(0, 64),
    a: play.playerId.slice(0, 32),
    n: play.playerName.slice(0, 60) || "Player",
    t: play.teamId ? play.teamId.slice(0, 10) : null,
    pts: Math.max(-99, Math.min(99, Math.round(play.points * 100) / 100)),
    x: "",
    q: Math.max(0, Math.min(20, Math.trunc(play.period))),
    c: play.clock.slice(0, 10),
    td: play.isTouchdown ? 1 : 0,
  };
  const build = (text: string) => `${MARKER}${JSON.stringify({ ...payload, x: text })}${note ? `\n${note}` : ""}`;
  // Shorten the play description until the whole message fits.
  let text = play.text.trim().slice(0, 400);
  let body = build(text);
  while (body.length > MAX_MESSAGE_LENGTH && text.length > 0) {
    text = `${text.slice(0, Math.max(0, text.length - (body.length - MAX_MESSAGE_LENGTH) - 1)).trimEnd()}…`;
    if (text === "…") text = "";
    body = build(text);
  }
  return body;
}

/** Splits a message body into a shared play (if it carries one) and the visible text. */
export function decodeMessageBody(body: string): { play: SharedPlay | null; text: string } {
  if (!body.startsWith(MARKER)) return { play: null, text: body };
  const newline = body.indexOf("\n");
  const json = body.slice(MARKER.length, newline === -1 ? undefined : newline);
  const comment = newline === -1 ? "" : body.slice(newline + 1).trim();
  try {
    const parsed = Encoded.safeParse(JSON.parse(json));
    if (!parsed.success) return { play: null, text: body };
    const d = parsed.data;
    return {
      play: {
        playId: d.p,
        gameId: d.g,
        playerId: d.a,
        playerName: d.n,
        teamId: d.t ?? null,
        points: d.pts,
        text: d.x,
        period: d.q,
        clock: d.c,
        isTouchdown: d.td === 1,
      },
      text: comment,
    };
  } catch {
    return { play: null, text: body };
  }
}

/** A one-line preview ("Shared a play: Josh Allen +9.4") for places that can't show the card. */
export function sharedPlaySummary(play: SharedPlay): string {
  const sign = play.points > 0 ? "+" : play.points < 0 ? "−" : "";
  return `${play.playerName} ${sign}${Math.abs(play.points).toFixed(2)}`;
}
