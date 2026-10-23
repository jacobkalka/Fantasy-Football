"use client";

import { useId, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { shortName } from "@/lib/startsit/model";
import type { PlayerVerdict } from "@/lib/startsit/types";

function pts(value: number) {
  if (Math.abs(value) < 0.05) return "0.0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

/** "How the numbers add up": every factor for every player, with what it was worth. */
export function TheMath({ players }: { players: PlayerVerdict[] }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panel}
        className="flex min-h-14 w-full items-center justify-between rounded-[var(--radius-card)] px-5 text-left text-[15px] font-medium hover:bg-raised"
      >
        How the numbers add up
        <Icon name="chevronDown" size={18} className={`text-muted transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* grid-rows 0fr → 1fr: opens smoothly to the content's real height, no measuring. */}
      <div
        id={panel}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden" inert={!open}>
          <div className="grid gap-6 px-5 pt-1 pb-5 sm:grid-cols-2 lg:grid-cols-3">
            {players.map((p) => {
              const inputs = p.factors.filter((f) => f.key !== "availability");
              const known = inputs.filter((f) => f.available && f.key !== "weather").length;
              const total = inputs.filter((f) => f.key !== "weather").length;
              return (
                <div key={p.playerId}>
                  <div className="flex items-baseline justify-between border-b border-rule pb-2">
                    <h3 className="text-[15px] font-semibold">{shortName(p.name)}</h3>
                    <span className="tabular text-[18px] font-semibold">{p.score.toFixed(1)}</span>
                  </div>
                  <dl className="mt-2 flex flex-col gap-2.5">
                    {p.factors.map((f) => (
                      <div key={f.key} className={f.available ? "" : "opacity-60"}>
                        <div className="flex items-baseline justify-between gap-3">
                          <dt className="text-[13px] text-muted">{f.label}</dt>
                          <dd
                            className={`tabular text-[13px] ${
                              f.key === "projection" || !f.available
                                ? "text-ink"
                                : f.points > 0.04
                                  ? "text-positive"
                                  : f.points < -0.04
                                    ? "text-negative"
                                    : "text-faint"
                            }`}
                          >
                            {f.key === "projection"
                              ? f.points.toFixed(1)
                              : f.key === "availability"
                                ? "0.0"
                                : f.available
                                  ? pts(f.points)
                                  : "n/a"}
                          </dd>
                        </div>
                        <p className="text-[12px] leading-4 text-faint">{f.detail}</p>
                      </div>
                    ))}
                  </dl>
                  {p.playing && (
                    <p className="mt-2 text-[12px] text-faint">
                      {known} of {total} inputs had data
                    </p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="px-5 pb-5 text-[13px] leading-5 text-muted">
            We start from ESPN&apos;s projection and nudge it by small, capped amounts: matchup up to ±8%, recent form ±6%,
            Vegas game total ±6%, weather (passing only) and injury risk. Floor and ceiling show a typical bad and good
            week. Projections are estimates, not guarantees.
          </p>
        </div>
      </div>
    </Card>
  );
}
