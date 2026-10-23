"use client";

import { useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/types";

/** Pause after each send. The database allows 1 message per second; this avoids hitting it. */
const COOLDOWN_MS = 1_000;

/**
 * The message box, floating in glass just above the tab bar. Enter sends,
 * Shift+Enter starts a new line. Shows a 500-character counter. If a message
 * fails, its text comes back into the box with the reason.
 */
export function Composer({
  onSend,
  disabled,
  disabledReason,
  placeholder,
  above,
}: {
  onSend: (text: string) => Promise<{ error?: string }>;
  disabled: boolean;
  disabledReason?: string;
  placeholder: string;
  /** Stacked just above the box (the "new messages" button, room notices), so nothing overlaps. */
  above?: React.ReactNode;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cooling, setCooling] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);

  const length = text.length;
  const empty = text.trim().length === 0;
  const near = length > MAX_MESSAGE_LENGTH - 50;
  const canSend = !disabled && !empty && length <= MAX_MESSAGE_LENGTH && !cooling;

  function resize() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }

  async function send() {
    if (!canSend) return;
    const draft = text;
    setText("");
    setError(null);
    setCooling(true);
    setTimeout(() => setCooling(false), COOLDOWN_MS);
    requestAnimationFrame(resize);
    const result = await onSend(draft);
    if (result.error) {
      // Put it back so nothing typed is lost.
      setText((current) => current || draft);
      setError(result.error);
      requestAnimationFrame(resize);
    }
  }

  return (
    // The strip itself lets taps through to the messages behind it; only its contents catch them.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),0.75rem)+4.75rem)] z-30 px-3">
      <div className="mx-auto flex max-w-xl flex-col gap-1.5">
        {above}
        {(error || (disabled && disabledReason)) && (
          <p
            role={error ? "alert" : "status"}
            className={`glass-bar pointer-events-auto self-start rounded-xl px-3 py-1.5 text-[13px] ${error ? "text-alert" : "text-ink-soft"}`}
          >
            {error ? `⚠ ${error}` : disabledReason}
          </p>
        )}
        <form
          className="glass-bar pointer-events-auto flex items-end gap-1.5 rounded-[1.4rem] p-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="chat-message">
            Message
          </label>
          <textarea
            id="chat-message"
            ref={box}
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            disabled={disabled}
            placeholder={placeholder}
            enterKeyHint="send"
            aria-describedby="chat-counter"
            onChange={(event) => {
              setText(event.target.value);
              if (error) setError(null);
              resize();
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            className="max-h-[132px] min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[16px] leading-snug text-ink-strong outline-none placeholder:text-muted/80 disabled:opacity-50"
          />
          <span
            id="chat-counter"
            className={`self-center font-mono text-[10px] tabular-nums ${near ? "text-alert" : "text-muted"} ${length === 0 ? "sr-only" : ""}`}
          >
            {length}/{MAX_MESSAGE_LENGTH}
            <span className="sr-only"> characters</span>
          </span>
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send message"
            className="glass-gain pressable flex size-11 shrink-0 items-center justify-center rounded-full text-gain disabled:opacity-40 disabled:hover:translate-y-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
