"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Sheet } from "@/components/ui/Sheet";
import { decodeMessageBody, sharedPlaySummary } from "@/lib/chat/shared-play";
import { REACTION_LABELS, REACTIONS, type ChatMessage, type Reaction } from "@/lib/chat/types";
import { openUser } from "@/lib/nav/query";

const REPORT_REASONS = [
  "Spam or ads",
  "Harassment or hate",
  "Sexual or violent content",
  "Scam or cheating",
  "Something else",
] as const;

type Step = "menu" | "report" | "block" | "delete";

export interface OptionsActions {
  onReact: (emoji: Reaction) => void;
  onReply: () => void;
  onThread?: () => void;
  onReport: (reason: string) => Promise<boolean>;
  onMute: () => void;
  onUnmute: () => void;
  onBlock: () => void;
  onDelete: () => void;
}

/**
 * Everything you can do with a message: react, reply (here or in a thread), copy, see who
 * wrote it, report, mute or block them, or delete it (your own; moderators can delete any).
 */
export function MessageOptions({
  message,
  authorName,
  me,
  isAdmin,
  muted,
  onClose,
  actions,
}: {
  message: ChatMessage | null;
  authorName: string;
  me: string;
  isAdmin: boolean;
  muted: boolean;
  onClose: () => void;
  actions: OptionsActions;
}) {
  return (
    <Sheet open={message !== null} onClose={onClose} title="Message" hideTitle size="sm">
      {message && (
        // A new message starts on the menu (the key resets the steps).
        <OptionsBody
          key={message.id}
          message={message}
          authorName={authorName}
          me={me}
          isAdmin={isAdmin}
          muted={muted}
          onClose={onClose}
          actions={actions}
        />
      )}
    </Sheet>
  );
}

function Row({ icon, label, onClick, tone = "ink" }: { icon: IconName; label: string; onClick: () => void; tone?: "ink" | "negative" }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] hover:bg-raised ${tone === "negative" ? "text-negative" : "text-ink"}`}
      >
        <Icon name={icon} size={19} className={tone === "negative" ? "" : "text-muted"} />
        {label}
      </button>
    </li>
  );
}

function OptionsBody({
  message,
  authorName,
  me,
  isAdmin,
  muted,
  onClose,
  actions,
}: {
  message: ChatMessage;
  authorName: string;
  me: string;
  isAdmin: boolean;
  muted: boolean;
  onClose: () => void;
  actions: OptionsActions;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = message.userId === me;
  const canDelete = !message.deleted && (mine || isAdmin);
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  if (step === "report") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const full = details.trim() ? `${reason}: ${details.trim()}` : reason;
          const done = await actions.onReport(full);
          setBusy(false);
          if (done) onClose();
        }}
      >
        <div>
          <h2 className="text-[18px] leading-6 font-semibold">Report message</h2>
          <p className="text-[14px] text-muted">A moderator will review it. @{authorName} won&apos;t know who reported it.</p>
        </div>
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">What&apos;s wrong with it?</legend>
          {REPORT_REASONS.map((option) => (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] ${reason === option ? "bg-well" : "hover:bg-raised"}`}
            >
              <input
                type="radio"
                name="reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
                className="size-4 accent-white"
              />
              {option}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">More details (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={300}
            rows={2}
            className="w-full rounded-xl bg-raised px-3 py-2.5 text-[16px] outline-none focus:ring-2 focus:ring-accent"
          />
        </label>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setStep("menu")}>Back</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Sending…" : "Send report"}
          </Button>
        </div>
      </form>
    );
  }

  if (step === "block" || step === "delete") {
    const block = step === "block";
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[18px] leading-6 font-semibold">{block ? `Block @${authorName}?` : "Delete this message?"}</h2>
          <p className="text-[14px] leading-relaxed text-muted">
            {block
              ? "You won't see their messages in any room, and they can't reach you. They won't be told. You can undo it right after."
              : mine
                ? "It's removed for everyone. This can't be undone."
                : "As a moderator you're removing it for everyone. This can't be undone."}
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setStep("menu")}>Cancel</Button>
          <Button variant="danger" onClick={run(block ? actions.onBlock : actions.onDelete)}>
            {block ? "Block" : "Delete"}
          </Button>
        </div>
      </div>
    );
  }

  const copy = () => {
    const { play, text } = decodeMessageBody(message.body);
    const value = play ? [`${sharedPlaySummary(play)}: ${play.text}`, text].filter(Boolean).join("\n") : text;
    void navigator.clipboard?.writeText(value).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-3">
      {!message.deleted && (
        <div className="grid grid-cols-9 gap-0.5" role="group" aria-label="React">
          {REACTIONS.map((emoji) => {
            const pressed = message.reactions.some((r) => r.userId === me && r.emoji === emoji);
            return (
              <button
                key={emoji}
                type="button"
                aria-pressed={pressed}
                aria-label={REACTION_LABELS[emoji]}
                onClick={run(() => actions.onReact(emoji))}
                className={`pressable grid h-11 place-items-center rounded-xl text-[20px] ${pressed ? "bg-well" : "hover:bg-raised"}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>
      )}
      <ul className="flex flex-col">
        {!message.deleted && <Row icon="reply" label="Reply" onClick={run(actions.onReply)} />}
        {!message.deleted && actions.onThread && <Row icon="thread" label="Reply in thread" onClick={run(actions.onThread)} />}
        {!message.deleted && message.body && <Row icon="copy" label="Copy text" onClick={run(copy)} />}
        {!mine && <Row icon="user" label={`View @${authorName}`} onClick={run(() => openUser(authorName))} />}
        {!mine && !message.deleted && <Row icon="flag" label="Report message" onClick={() => setStep("report")} />}
        {!mine && (
          <Row
            icon="mute"
            label={muted ? `Unmute @${authorName}` : `Mute @${authorName}`}
            onClick={run(muted ? actions.onUnmute : actions.onMute)}
          />
        )}
        {!mine && <Row icon="shield" label={`Block @${authorName}`} tone="negative" onClick={() => setStep("block")} />}
        {canDelete && (
          <Row icon="trash" label={`Delete message${!mine ? " (moderator)" : ""}`} tone="negative" onClick={() => setStep("delete")} />
        )}
      </ul>
    </div>
  );
}
