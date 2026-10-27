"use client";

import { useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import { niceTicks, useWidth } from "./useWidth";

/**
 * Columns from one baseline (≤ 24px wide, 4px rounded tops, 2px gaps), optionally with a
 * comparison tick on each (ESPN's projection, so "did he beat it?" reads at a glance).
 * Hover/tap a column for its numbers; a hidden table carries them for screen readers.
 */
export interface Bar {
  label: string;
  value: number | null;
  /** A comparison value drawn as a tick across the column (e.g. the projection). */
  compare?: number | null;
  /** Extra line for the tooltip ("vs KC · W 27-20"). */
  note?: string;
  /** Highlight this column (the best week, the current week). */
  highlight?: boolean;
  /** Muted column (didn't play, bye). */
  muted?: boolean;
}

export function BarChart({
  bars,
  height = 168,
  format = (v) => v.toFixed(2),
  valueLabel = "Points",
  compareLabel = "Projected",
  ariaLabel,
  color = "var(--color-chart-1)",
  compareColor = "var(--color-ink)",
}: {
  bars: Bar[];
  height?: number;
  format?: (v: number) => string;
  valueLabel?: string;
  compareLabel?: string;
  ariaLabel: string;
  color?: string;
  compareColor?: string;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const pad = { top: 18, right: 6, bottom: 22, left: 30 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const values = bars.flatMap((b) => [b.value ?? 0, b.compare ?? 0]);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(5, ...values), 4);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const slot = innerW / Math.max(1, bars.length);
  const barW = Math.min(24, Math.max(4, slot - 2));
  const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;
  const zero = y(0);
  const hasCompare = bars.some((b) => b.compare != null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from(svgRef.current?.querySelectorAll("[data-bar]") ?? [], {
        scaleY: 0,
        transformOrigin: "50% 100%",
        duration: 0.7,
        stagger: 0.025,
        ease: "power3.out",
      });
    },
    { scope: svgRef, dependencies: [bars.length] },
  );

  const columnPath = (cx: number, top: number, bottom: number) => {
    const w = barW;
    const h = bottom - top;
    if (h <= 0) return "";
    const r = Math.min(4, w / 2, h);
    const left = cx - w / 2;
    // Rounded at the data end (top), square at the baseline.
    return `M${left},${bottom}V${top + r}Q${left},${top} ${left + r},${top}H${left + w - r}Q${left + w},${top} ${left + w},${top + r}V${bottom}Z`;
  };

  const activeBar = active === null ? null : bars[active];
  const cxOf = (i: number) => pad.left + slot * i + slot / 2;
  const flip = active !== null && cxOf(active) > width - 150;

  return (
    <figure className="relative" aria-label={ariaLabel}>
      {hasCompare && (
        <div className="mb-2 flex gap-4 text-[12px] text-muted" aria-hidden="true">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: color }} />
            {valueLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ background: compareColor }} />
            {compareLabel}
          </span>
        </div>
      )}
      <div ref={ref} className="relative w-full">
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          tabIndex={0}
          className="block touch-pan-y outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-accent"
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(bars.length - 1, (a ?? -1) + 1));
            else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? bars.length) - 1));
            else if (e.key === "Escape") setActive(null);
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-chart-grid)" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t) + 4} textAnchor="end" className="fill-faint text-[11px] tabular">
                {t}
              </text>
            </g>
          ))}
          {bars.map((b, i) => {
            const cx = cxOf(i);
            const v = b.value ?? 0;
            const top = Math.min(y(v), zero);
            const bottom = Math.max(y(v), zero);
            return (
              <g
                key={i}
                onPointerEnter={() => setActive(i)}
                onPointerDown={() => setActive(i)}
                className="cursor-pointer"
              >
                {/* A hit area wider and taller than the column. */}
                <rect x={cx - slot / 2} y={pad.top} width={slot} height={innerH} fill="transparent" />
                {b.value !== null && (
                  <path
                    data-bar=""
                    d={columnPath(cx, top, bottom)}
                    fill={b.muted ? "var(--color-well)" : color}
                    opacity={active === null || active === i ? (b.highlight || active === i ? 1 : 0.78) : 0.45}
                  />
                )}
                {b.compare != null && (
                  <line
                    x1={cx - barW / 2 - 3}
                    x2={cx + barW / 2 + 3}
                    y1={y(b.compare)}
                    y2={y(b.compare)}
                    stroke={compareColor}
                    strokeWidth={2}
                    strokeLinecap="round"
                    opacity={0.85}
                  />
                )}
                {(bars.length <= 12 || i % Math.ceil(bars.length / 10) === 0) && (
                  <text x={cx} y={height - 6} textAnchor="middle" className="fill-faint text-[11px]">
                    {b.label}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.left} x2={width - pad.right} y1={zero} y2={zero} stroke="var(--color-control)" strokeWidth={1} />
        </svg>
        {activeBar && active !== null && (
          <div
            role="status"
            className="bg-raised pointer-events-none absolute top-0 z-10 min-w-[128px] rounded-xl px-3 py-2 text-[12px] shadow-[0_12px_30px_-10px_rgb(0_0_0/0.9)]"
            style={{ left: flip ? undefined : cxOf(active) + 12, right: flip ? width - cxOf(active) + 12 : undefined }}
          >
            <p className="font-medium text-ink">{activeBar.label}</p>
            {activeBar.note && <p className="text-faint">{activeBar.note}</p>}
            <p className="mt-1 flex justify-between gap-3 text-muted">
              {valueLabel}
              <span className="tabular font-medium text-ink">{activeBar.value === null ? "Didn't play" : format(activeBar.value)}</span>
            </p>
            {activeBar.compare != null && (
              <p className="flex justify-between gap-3 text-muted">
                {compareLabel}
                <span className="tabular text-ink">{format(activeBar.compare)}</span>
              </p>
            )}
          </div>
        )}
      </div>
      <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Week</th>
            <th scope="col">{valueLabel}</th>
            {hasCompare && <th scope="col">{compareLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {bars.map((b, i) => (
            <tr key={i}>
              <th scope="row">{b.label}</th>
              <td>{b.value === null ? "did not play" : format(b.value)}</td>
              {hasCompare && <td>{b.compare == null ? "none" : format(b.compare)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
