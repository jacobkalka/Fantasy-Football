"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { Sheet } from "@/components/ui/Sheet";

const DURATIONS = [
  { value: "none", label: "No end" },
  { value: "1h", label: "1 hour" },
  { value: "1d", label: "1 day" },
  { value: "3d", label: "3 days" },
] as const;
type Duration = (typeof DURATIONS)[number]["value"];
const HOURS: Record<Duration, number | null> = { none: null, "1h": 1, "1d": 24, "3d": 72 };

/** Make a poll: a question and 2-6 options (the same limits the database checks). */
export function PollComposer({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (poll: { question: string; options: string[]; closesAt: string | null }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [duration, setDuration] = useState<Duration>("1d");
  const clean = options.map((o) => o.trim()).filter(Boolean);
  const unique = new Set(clean.map((o) => o.toLowerCase())).size === clean.length;
  const valid = question.trim().length > 0 && clean.length >= 2 && unique;

  function reset() {
    setQuestion("");
    setOptions(["", ""]);
    setDuration("1d");
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New poll"
      description="Everyone in this room can vote once, and change their vote."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              const hours = HOURS[duration];
              onCreate({
                question: question.trim(),
                options: clean,
                closesAt: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
              });
              reset();
            }}
          >
            Post poll
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Question</span>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={140}
            placeholder="Who do I start at flex?"
            className="h-11 rounded-xl bg-raised px-3 text-[16px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
          />
        </label>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[13px] text-muted">Options</legend>
          {options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={option}
                onChange={(e) => setOptions((list) => list.map((o, j) => (j === i ? e.target.value : o)))}
                maxLength={60}
                placeholder={`Option ${i + 1}`}
                aria-label={`Option ${i + 1}`}
                className="h-11 min-w-0 flex-1 rounded-xl bg-raised px-3 text-[16px] outline-none placeholder:text-faint focus:ring-2 focus:ring-accent"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="grid size-10 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <Button size="sm" icon="plus" variant="quiet" className="self-start" onClick={() => setOptions((list) => [...list, ""])}>
              Add option
            </Button>
          )}
          {!unique && <p className="text-[13px] text-warning">Two options say the same thing.</p>}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted">Voting closes</span>
          <Segmented options={DURATIONS} value={duration} onChange={setDuration} label="Voting closes" />
        </div>
      </div>
    </Sheet>
  );
}
