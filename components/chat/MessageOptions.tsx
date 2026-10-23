"use client";

import { useState } from "react";
import { decodeMessageBody, sharedPlaySummary } from "@/lib/chat/shared-play";
import { REACTION_LABELS, REACTIONS, type ChatMessage, type Reaction } from "@/lib/chat/types";
import { Sheet } from "./Sheet";

const REPORT_REASONS = [
  "Spam or ads",
  "Harassment or hate",
  "Sexual or violent content",
  "Scam or cheating",
  "Something else",
] as const;

const ROW =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] transition-colors hover:bg-white/5";

type Step = "menu" | "report" | "block" | "delete";

/**
 * What you can do with a message: react, copy, report, block the sender,
 * or delete it (your own, or anyone's if you're a moderator).
 */
export function MessageOptions({
  message,
  authorName,
  me,
  isAdmin,
  onClose,
  onReact,
  onReport,
  onBlock,
  onDelete,
}: {
  message: ChatMessage | null;
  authorName: string;
  me: string;
  isAdmin: boolean;
  onClose: () => void;
  onReact: (emoji: Reaction) => void;
  onReport: (reason: string) => Promise<boolean>;
  onBlock: () => void;
  onDelete: () => void;
}) {
  // Each time the sheet opens for a message, it starts on the menu (the key resets this state).
  return (
    <Sheet open={message !== null} onClose={onClose} label="Message options">
      {message && (
        <OptionsBody
          key={message.id}
          message={message}
          authorName={authorName}
          me={me}
          isAdmin={isAdmin}
          onClose={onClose}
          onReact={onReact}
          onReport={onReport}
          onBlock={onBlock}
          onDelete={onDelete}
        />
      )}
    </Sheet>
  );
}

function OptionsBody({
  message,
  authorName,
  me,
  isAdmin,
  onClose,
  onReact,
  onReport,
  onBlock,
  onDelete,
}: {
  message: ChatMessage;
  authorName: string;
  me: string;
  isAdmin: boolean;
  onClose: () => void;
  onReact: (emoji: Reaction) => void;
  onReport: (reason: string) => Promise<boolean>;
  onBlock: () => void;
  onDelete: () => void;
}) {
  const [step, setStep] = useState<Step>("menu");
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = message.userId === me;
  const canDelete = !message.deleted && (mine || isAdmin);

  if (step === "report") {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          const full = details.trim() ? `${reason}: ${details.trim()}` : reason;
          const done = await onReport(full);
          setBusy(false);
          if (done) onClose();
        }}
      >
        <div>
          <h2 className="text-[18px] leading-6 font-semibold text-ink">Report message</h2>
          <p className="text-[14px] text-ink-soft">A moderator will review it. @{authorName} won&apos;t know who reported it.</p>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="sr-only">What&apos;s wrong with it?</legend>
          {REPORT_REASONS.map((option) => (
            <label
              key={option}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl px-4 text-[15px] ${ reason === option ? "glass-gain text-ink" : "glass-chip text-ink-soft" }`}
            >
              <input
                type="radio"
                name="reason"
                value={option}
                checked={reason === option}
                onChange={() => setReason(option)}
                className="size-4 accent-gain"
              />
              {option}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">More details (optional)</span>
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            maxLength={300}
            rows={2}
            className="glass-chip w-full rounded-2xl px-4 py-3 text-[16px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-gain/70"
          />
        </label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("menu")} className="glass-chip min-h-12 flex-1 rounded-2xl text-[15px] text-ink-soft">
            Back
          </button>
          <button
            type="submit"
            disabled={busy}
            className="glass-gain pressable min-h-12 flex-[2] rounded-2xl text-[12px] font-bold text-gain disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send report"}
          </button>
        </div>
      </form>
    );
  }

  if (step === "block" || step === "delete") {
    const block = step === "block";
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-[18px] leading-6 font-semibold text-ink">
            {block ? `Block @${authorName}?` : "Delete this message?"}
          </h2>
          <p className="text-[14px] leading-relaxed text-ink-soft">
            {block
              ? "You won't see their messages in any room. They won't be told. You can undo it right after."
              : mine
                ? "It's removed for everyone. This can't be undone."
                : "As a moderator you're removing it for everyone. This can't be undone."}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("menu")} className="glass-chip min-h-12 flex-1 rounded-2xl text-[15px] text-ink-soft">
            Cancel
          </button>
          <button
            type="button"
            data-autofocus
            onClick={() => {
              if (block) onBlock();
              else onDelete();
              onClose();
            }}
            className="min-h-12 flex-[2] rounded-2xl border border-loss-line/50 bg-loss/15 text-[12px] font-bold text-loss"
          >
            {block ? "Block" : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!message.deleted && (
        <div>
          <p className="px-1 pb-2 text-[12px] text-muted">React</p>
          <div className="grid grid-cols-6 gap-1.5">
            {REACTIONS.map((emoji) => {
              const pressed = message.reactions.some((r) => r.userId === me && r.emoji === emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={pressed}
                  aria-label={REACTION_LABELS[emoji]}
                  onClick={() => {
                    onReact(emoji);
                    onClose();
                  }}
                  className={`pressable flex h-12 items-center justify-center rounded-2xl text-[22px] ${pressed ? "glass-gain" : "glass-chip"}`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <ul className="flex flex-col">
        {!message.deleted && message.body && (
          <li>
            <button
              type="button"
              className={`${ROW} text-ink`}
              onClick={() => {
                const { play, text } = decodeMessageBody(message.body);
                const copy = play ? [`${sharedPlaySummary(play)}: ${play.text}`, text].filter(Boolean).join("\n") : text;
                void navigator.clipboard?.writeText(copy).catch(() => {});
                onClose();
              }}
            >
              Copy text
            </button>
          </li>
        )}
        {!mine && !message.deleted && (
          <li>
            <button type="button" className={`${ROW} text-ink`} onClick={() => setStep("report")}>
              Report message
            </button>
          </li>
        )}
        {!mine && (
          <li>
            <button type="button" className={`${ROW} text-alert`} onClick={() => setStep("block")}>
              Block @{authorName}
            </button>
          </li>
        )}
        {canDelete && (
          <li>
            <button type="button" className={`${ROW} text-loss`} onClick={() => setStep("delete")}>
              Delete message{!mine ? " (moderator)" : ""}
            </button>
          </li>
        )}
        <li>
          <button type="button" className={`${ROW} text-muted`} onClick={onClose}>
            Cancel
          </button>
        </li>
      </ul>
    </div>
  );
}
