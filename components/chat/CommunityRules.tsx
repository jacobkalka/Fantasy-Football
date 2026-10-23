"use client";

import { acceptRules, COMMUNITY_RULES, useRulesAccepted } from "@/lib/chat/rules";
import { Sheet } from "./Sheet";

/** The house rules, shown once per device before the first message. */
export function CommunityRules() {
  const accepted = useRulesAccepted();
  return (
    <Sheet open={!accepted} onClose={acceptRules} label="Chat rules" dismissable={false}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.12em] text-gain uppercase">Before you jump in</p>
          <h2 className="font-display text-3xl leading-none font-bold tracking-wide text-ink-strong uppercase">House rules</h2>
        </div>
        <ol className="flex flex-col gap-2.5">
          {COMMUNITY_RULES.map((rule, i) => (
            <li key={rule.title} className="glass-chip flex gap-3 rounded-2xl p-3">
              <span className="font-display text-2xl leading-none font-bold text-gain" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="text-[15px] font-semibold text-ink-strong">{rule.title}</p>
                <p className="text-[13.5px] leading-snug text-ink-soft">{rule.body}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          data-autofocus
          onClick={acceptRules}
          className="glass-gain pressable min-h-12 rounded-2xl font-mono text-[12px] font-bold tracking-[0.12em] text-gain uppercase"
        >
          Got it, I&apos;m in
        </button>
      </div>
    </Sheet>
  );
}
