/**
 * Message attachments come from other people's apps, so they're checked here before anything
 * shows them: known keys only, sane sizes, ids in the shapes ESPN uses. Anything malformed is
 * dropped (the message text still shows). Names are only ever displayed as text, and the app
 * prefers its own player data over the name the author sent.
 */
import type { MessageAttachments, PlayerRef, TradeCard } from "./types";

const PLAYER_ID = /^-?[0-9]{1,12}$/;
const GAME_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_MENTIONS = 8;
export const MAX_TRADE_SIDE = 5;

function player(value: unknown): PlayerRef | null {
  if (!value || typeof value !== "object") return null;
  const { id, name } = value as { id?: unknown; name?: unknown };
  if (typeof id !== "string" || !PLAYER_ID.test(id)) return null;
  if (typeof name !== "string") return null;
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60);
  return clean ? { id, name: clean } : null;
}

function players(value: unknown, max: number): PlayerRef[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: PlayerRef[] = [];
  for (const item of value.slice(0, max * 2)) {
    const p = player(item);
    if (p && !seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function parseAttachments(raw: unknown): MessageAttachments | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const out: MessageAttachments = {};
  const mentioned = players(value.players, MAX_MENTIONS);
  if (mentioned.length) out.players = mentioned;
  const game = value.game as { id?: unknown } | undefined;
  if (game && typeof game.id === "string" && GAME_ID.test(game.id)) out.game = { id: game.id };
  const trade = value.trade as { give?: unknown; get?: unknown } | undefined;
  if (trade && typeof trade === "object") {
    const card: TradeCard = { give: players(trade.give, MAX_TRADE_SIDE), get: players(trade.get, MAX_TRADE_SIDE) };
    if (card.give.length && card.get.length) out.trade = card;
  }
  if (value.poll === true) out.poll = true;
  return Object.keys(out).length ? out : null;
}

/** What gets saved: only the parts that are there. */
export function cleanAttachments(value: MessageAttachments | null | undefined): MessageAttachments | null {
  return parseAttachments(value ?? null);
}

/** One piece of a message's text: plain words, or a player it names (from `@Name`). */
export type BodyPart = { kind: "text"; text: string } | { kind: "player"; player: PlayerRef; text: string };

/**
 * Splits a message into text and player mentions. A mention is "@" + exactly the player's name
 * as attached; text that merely looks like a mention stays text.
 */
export function splitMentions(body: string, mentioned: PlayerRef[] | undefined): BodyPart[] {
  if (!mentioned?.length || !body.includes("@")) return body ? [{ kind: "text", text: body }] : [];
  const byLength = [...mentioned].sort((a, b) => b.name.length - a.name.length);
  const parts: BodyPart[] = [];
  let buffer = "";
  let i = 0;
  while (i < body.length) {
    if (body[i] === "@") {
      const rest = body.slice(i + 1);
      const hit = byLength.find((p) => rest.startsWith(p.name) && !/[\p{L}\p{N}]/u.test(rest[p.name.length] ?? ""));
      if (hit) {
        if (buffer) parts.push({ kind: "text", text: buffer });
        buffer = "";
        parts.push({ kind: "player", player: hit, text: `@${hit.name}` });
        i += hit.name.length + 1;
        continue;
      }
    }
    buffer += body[i];
    i += 1;
  }
  if (buffer) parts.push({ kind: "text", text: buffer });
  return parts;
}
