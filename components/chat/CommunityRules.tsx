"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { acceptRules, COMMUNITY_RULES, useRulesAccepted } from "@/lib/chat/rules";

/**
 * The house rules. Until this device has agreed to them, a line above the message box says
 * so; tapping it shows the rules with "I'm in". Reading chat never needs it, posting does.
 */
export function CommunityRules() {
  const accepted = useRulesAccepted();
  const [open, setOpen] = useState(false);
  if (accepted) return null;
  return (
    <>
      <div className="flex items-center gap-3 rounded-xl bg-raised px-3 py-2.5 text-[13px]">
        <span className="min-w-0 flex-1 text-muted">Agree to the house rules to start posting.</span>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>
          Read the rules
        </Button>
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="House rules"
        description="Real people, real takes. Five rules keep it fun."
        footer={
          <div className="flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Not now</Button>
            <Button
              variant="primary"
              onClick={() => {
                acceptRules();
                setOpen(false);
              }}
            >
              I&apos;m in
            </Button>
          </div>
        }
      >
        <ol className="flex flex-col gap-2">
          {COMMUNITY_RULES.map((rule, i) => (
            <li key={rule.title} className="flex gap-3 rounded-xl bg-raised p-3">
              <span className="tabular w-5 shrink-0 text-[15px] font-semibold text-muted" aria-hidden="true">
                {i + 1}
              </span>
              <span>
                <span className="block text-[15px] font-medium">{rule.title}</span>
                <span className="block text-[14px] text-muted">{rule.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </Sheet>
    </>
  );
}
