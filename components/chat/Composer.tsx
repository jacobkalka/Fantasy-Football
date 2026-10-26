"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PlayerAvatar } from "@/components/ui/PlayerAvatar";
import { MAX_MENTIONS } from "@/lib/chat/attachments";
import { decodeMessageBody } from "@/lib/chat/shared-play";
import { MAX_MESSAGE_LENGTH, type ChatMessage, type ChatProfile, type MessageAttachments, type OutgoingMessage, type PlayerRef, type TradeCard } from "@/lib/chat/types";
import { visibleTeamColor } from "@/lib/color";
import { usePlayers, searchPlayers } from "@/lib/hooks/usePlayers";
import { useTeams } from "@/lib/hooks/useTeams";
import type { Player } from "@/lib/providers/types";
import { GamePicker } from "./GamePicker";
import { PollComposer } from "./PollComposer";
import { TradeComposer } from "./TradeComposer";

const MENU: { key: "poll" | "trade" | "game"; label: string; icon: IconName }[] = [
  { key: "poll", label: "Poll", icon: "poll" },
  { key: "trade", label: "Trade to judge", icon: "swap" },
  { key: "game", label: "Game", icon: "football" },
];

/** Pause after each send. The database allows 1 message per second; this avoids hitting it. */
const COOLDOWN_MS = 1_000;

/** "@jos" right before the caret: the text being typed after an @ (names can have a space). */
function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(?:^|\s)@([^\s@][^@\n]{0,24})$|(?:^|\s)@$/);
  if (!match) return null;
  const query = match[1] ?? "";
  if (query.split(" ").length > 3) return null;
  return { start: caret - query.length - 1, query };
}

/**
 * The message box at the bottom of a room. Enter sends, Shift+Enter starts a new line.
 * Type @ and a name to mention a player (it becomes a link to their profile for everyone).
 * The + button adds a poll, a trade to judge, or a game. Replying shows what you answer above.
 */
export function Composer({
  onSend,
  disabled,
  disabledReason,
  placeholder,
  replyTo,
  replyAuthor,
  onCancelReply,
  allowPolls = true,
  inputId = "chat-message",
}: {
  onSend: (message: OutgoingMessage) => Promise<{ error?: string }>;
  disabled: boolean;
  disabledReason?: string;
  placeholder: string;
  replyTo?: ChatMessage | null;
  replyAuthor?: ChatProfile;
  onCancelReply?: () => void;
  allowPolls?: boolean;
  inputId?: string;
}) {
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<PlayerRef[]>([]);
  const [trade, setTrade] = useState<TradeCard | null>(null);
  const [game, setGame] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState<"poll" | "trade" | "game" | null>(null);
  const [cooling, setCooling] = useState(false);
  const [suggest, setSuggest] = useState<{ start: number; query: string } | null>(null);
  const [highlight, setHighlight] = useState(0);
  const box = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { players } = usePlayers(suggest !== null);
  const teams = useTeams();

  const length = text.length;
  const empty = text.trim().length === 0;
  const near = length > MAX_MESSAGE_LENGTH - 50;
  const hasCard = Boolean(trade || game);
  const canSend = !disabled && (!empty || hasCard) && length <= MAX_MESSAGE_LENGTH && !cooling;
  const abbr = (id: string | null) => (id ? (teams[id]?.abbr ?? null) : null);
  const suggestions: Player[] = suggest && players ? searchPlayers(players, suggest.query, abbr, 6) : [];

  // The + menu closes on a tap anywhere else or Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function resize() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }

  function update(value: string, caret: number) {
    setText(value);
    setSuggest(mentionQuery(value, caret));
    setHighlight(0);
    resize();
  }

  function pick(player: Player) {
    if (!suggest) return;
    const name = player.name;
    const before = text.slice(0, suggest.start);
    const after = text.slice(suggest.start + 1 + suggest.query.length);
    const next = `${before}@${name} ${after.replace(/^\s+/, "")}`;
    setText(next);
    setMentions((list) => (list.some((p) => p.id === player.id) ? list : [...list, { id: player.id, name }].slice(-MAX_MENTIONS)));
    setSuggest(null);
    requestAnimationFrame(() => {
      const el = box.current;
      if (!el) return;
      const caret = before.length + name.length + 2;
      el.focus();
      el.setSelectionRange(caret, caret);
      resize();
    });
  }

  async function send(extra?: Partial<OutgoingMessage>) {
    if (!extra && !canSend) return;
    const body = extra?.body ?? (text.trim() || (trade ? "Is this trade fair?" : game ? "Talking about this game" : ""));
    const used = mentions.filter((p) => body.includes(`@${p.name}`));
    const attachments: MessageAttachments = {
      ...(used.length ? { players: used } : {}),
      ...(trade && !extra ? { trade } : {}),
      ...(game && !extra ? { game: { id: game } } : {}),
    };
    const outgoing: OutgoingMessage = {
      body,
      replyTo: replyTo?.id ?? null,
      attachments: Object.keys(attachments).length ? attachments : null,
      ...extra,
    };
    if (!extra) {
      setText("");
      setMentions([]);
      setTrade(null);
      setGame(null);
      requestAnimationFrame(resize);
    }
    onCancelReply?.();
    setCooling(true);
    setTimeout(() => setCooling(false), COOLDOWN_MS);
    // If it fails it stays in the conversation, marked, with Retry: nothing typed is lost.
    await onSend(outgoing);
  }

  const replySnippet = replyTo
    ? replyTo.deleted
      ? "Message deleted"
      : decodeMessageBody(replyTo.body).text.slice(0, 80) || "Shared a play"
    : "";

  return (
    <div className="relative flex flex-col gap-1.5">
      {suggest && suggestions.length > 0 && (
        <ul
          id={`${inputId}-mentions`}
          role="listbox"
          aria-label="Players"
          className="absolute inset-x-0 bottom-full z-20 mb-2 flex flex-col rounded-2xl bg-raised p-1 shadow-[0_8px_28px_rgb(0_0_0/0.6)]"
        >
          {suggestions.map((p, i) => {
            const team = p.teamId ? teams[p.teamId] : undefined;
            return (
              <li key={p.id} role="option" aria-selected={i === highlight} id={`${inputId}-mention-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left ${i === highlight ? "bg-well" : "hover:bg-well"}`}
                >
                  <PlayerAvatar
                    name={p.name}
                    headshot={p.position === "DST" ? team?.logo : p.headshot}
                    teamColor={visibleTeamColor(team)}
                    size={28}
                  />
                  <span className="min-w-0 flex-1 truncate text-[14px]">{p.name}</span>
                  <span className="shrink-0 text-[12px] text-faint">
                    {p.position === "DST" ? "D/ST" : p.position} · {team?.abbr ?? "FA"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {replyTo && (
        <div className="flex items-center gap-2 px-2 text-[13px] text-muted">
          <Icon name="reply" size={15} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            Replying to <span className="font-medium text-ink">@{replyAuthor?.username ?? "someone"}</span> · {replySnippet}
          </span>
          <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className="grid size-8 place-items-center rounded-full hover:bg-raised">
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      {(trade || game) && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {trade && (
            <span className="flex items-center gap-1.5 rounded-full bg-raised py-1 pr-1 pl-3 text-[13px]">
              <Icon name="swap" size={14} /> Trade: {trade.give.map((p) => p.name).join(", ")} for {trade.get.map((p) => p.name).join(", ")}
              <button type="button" onClick={() => setTrade(null)} aria-label="Remove trade" className="grid size-6 place-items-center rounded-full hover:bg-well">
                <Icon name="close" size={13} />
              </button>
            </span>
          )}
          {game && (
            <span className="flex items-center gap-1.5 rounded-full bg-raised py-1 pr-1 pl-3 text-[13px]">
              <Icon name="football" size={14} /> Game attached
              <button type="button" onClick={() => setGame(null)} aria-label="Remove game" className="grid size-6 place-items-center rounded-full hover:bg-well">
                <Icon name="close" size={13} />
              </button>
            </span>
          )}
        </div>
      )}

      {disabled && disabledReason && <p className="px-2 text-[13px] text-muted">{disabledReason}</p>}

      <form
        className="flex items-end gap-1 rounded-[22px] bg-raised p-1"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            disabled={disabled}
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-label="Add a poll, trade or game"
            className="pressable grid size-10 place-items-center rounded-full text-muted hover:bg-well hover:text-ink disabled:opacity-40"
          >
            <Icon name="plus" size={20} />
          </button>
          {menu && (
            <ul role="menu" className="absolute bottom-full left-0 z-20 mb-2 flex w-52 flex-col rounded-2xl bg-raised p-1 shadow-[0_8px_28px_rgb(0_0_0/0.6)]">
              {MENU.filter((item) => allowPolls || item.key !== "poll").map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenu(false);
                      setSheet(item.key);
                    }}
                    className="flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[14px] hover:bg-well"
                  >
                    <Icon name={item.icon} size={17} className="text-muted" /> {item.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <label className="sr-only" htmlFor={inputId}>
          Message
        </label>
        <textarea
          id={inputId}
          ref={box}
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={disabled}
          placeholder={placeholder}
          enterKeyHint="send"
          role="combobox"
          aria-expanded={suggestions.length > 0}
          aria-controls={`${inputId}-mentions`}
          aria-autocomplete="list"
          aria-activedescendant={suggestions.length ? `${inputId}-mention-${highlight}` : undefined}
          onChange={(event) => update(event.target.value, event.target.selectionStart ?? event.target.value.length)}
          onBlur={() => setTimeout(() => setSuggest(null), 120)}
          onKeyDown={(event) => {
            if (suggestions.length) {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                return;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                pick(suggestions[highlight]);
                return;
              }
              if (event.key === "Escape") {
                setSuggest(null);
                return;
              }
            }
            if (event.key === "Escape" && replyTo) onCancelReply?.();
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          className="max-h-[140px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[16px] leading-snug text-ink outline-none placeholder:text-faint disabled:opacity-50"
        />
        {length > 0 && (
          <span className={`self-center text-[12px] tabular-nums ${near ? "text-warning" : "text-faint"}`}>
            {length}/{MAX_MESSAGE_LENGTH}
            <span className="sr-only"> characters</span>
          </span>
        )}
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="pressable grid size-10 shrink-0 place-items-center rounded-full bg-ink text-black disabled:bg-well disabled:text-faint"
        >
          <Icon name="send" size={18} />
        </button>
      </form>

      <PollComposer
        open={sheet === "poll"}
        onClose={() => setSheet(null)}
        onCreate={(poll) => {
          setSheet(null);
          void send({ body: poll.question, poll, attachments: null });
        }}
      />
      <TradeComposer
        open={sheet === "trade"}
        onClose={() => setSheet(null)}
        onPick={(card) => {
          setSheet(null);
          setTrade(card);
          box.current?.focus();
        }}
      />
      <GamePicker
        open={sheet === "game"}
        onClose={() => setSheet(null)}
        onPick={(id) => {
          setSheet(null);
          setGame(id);
          box.current?.focus();
        }}
      />
    </div>
  );
}
