"use client";

import { useId, useMemo, useRef, useState } from "react";
import { gsap, prefersReducedMotion, useGSAP } from "@/lib/motion/gsap";
import { niceTicks, useWidth } from "./useWidth";

/**
 * A line chart that answers one question ("how has he scored week to week?"), built to the
 * chart rules in DECISIONS.md: 2px lines, ≥8px markers with a surface ring, a 10% area wash
 * under the main series, hairline solid gridlines, one y-axis, a legend for 2+ series, the
 * value at the line's end, and a crosshair + tooltip on hover/tap (arrow keys too). A hidden
 * table gives screen readers the same numbers.
 */
export interface LineSeries {
  id: string;
  label: string;
  /** A chart token: "var(--color-chart-1)". */
  color: string;
  values: (number | null)[];
  /** Draw markers on every point (weekly data) rather than only the end. */
  markers?: boolean;
  /** Fill a light wash under this series (use for the main one only). */
  area?: boolean;
}

export function LineChart({
  labels,
  series,
  height = 180,
  format = (v) => v.toFixed(2),
  title,
  yMin,
  reference,
  ariaLabel,
  invert = false,
}: {
  /** One label per x position ("W1", "W2"…). */
  labels: string[];
  series: LineSeries[];
  height?: number;
  format?: (value: number) => string;
  title?: string;
  /** Force the axis to start here (0 for points). */
  yMin?: number;
  /** A horizontal reference line with a label (e.g. the season average). */
  reference?: { value: number; label: string };
  ariaLabel: string;
  /** Smaller is better (ranks): 1 at the top. */
  invert?: boolean;
}) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const id = useId();

  const pad = { top: 14, right: 44, bottom: 24, left: 34 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const n = labels.length;

  const { ticks, lo, hi } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    if (reference) all.push(reference.value);
    const min = yMin ?? Math.min(0, ...all);
    const max = Math.max(min + 1, ...all);
    const t = niceTicks(min, max, 4);
    return { ticks: t, lo: t[0], hi: t[t.length - 1] };
  }, [series, reference, yMin]);

  const x = (i: number) => pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) =>
    invert ? pad.top + ((v - lo) / (hi - lo || 1)) * innerH : pad.top + innerH - ((v - lo) / (hi - lo || 1)) * innerH;

  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    const firstIdx = s.values.findIndex((v) => v !== null);
    const lastIdx = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
    const area =
      s.area && firstIdx >= 0
        ? `${d}L${x(lastIdx).toFixed(1)},${y(lo).toFixed(1)}L${x(firstIdx).toFixed(1)},${y(lo).toFixed(1)}Z`
        : null;
    return { s, d, area, lastIdx };
  });

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      const lines = svgRef.current?.querySelectorAll<SVGPathElement>("[data-line]");
      lines?.forEach((line) => {
        const length = line.getTotalLength();
        gsap.fromTo(line, { strokeDasharray: length, strokeDashoffset: length }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.out", clearProps: "strokeDasharray,strokeDashoffset" });
      });
      gsap.from(svgRef.current?.querySelectorAll("[data-area]") ?? [], { opacity: 0, duration: 0.8, delay: 0.3 });
    },
    { scope: svgRef, dependencies: [labels.join(","), width > 0] },
  );

  const pick = (clientX: number) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const rel = clientX - box.left - pad.left;
    const i = Math.round((rel / innerW) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  };

  // As many x labels as fit without overlapping (about 6.4px per character at 11px, 34px minimum).
  const longest = labels.reduce((m, l) => Math.max(m, l.length), 0);
  const labelStep = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / Math.max(34, longest * 6.4 + 8)))));
  const tooltipX = active === null ? 0 : x(active);
  const flip = tooltipX > width - 150;

  return (
    <figure className="relative" aria-label={ariaLabel}>
      {title && <figcaption className="mb-2 text-[13px] font-medium text-muted">{title}</figcaption>}
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted" aria-hidden="true">
          {series.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 rounded-full" style={{ background: s.color }} />
              {s.label}
            </span>
          ))}
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
          onPointerMove={(e) => pick(e.clientX)}
          onPointerDown={(e) => pick(e.clientX)}
          onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
          onBlur={() => setActive(null)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") setActive((a) => Math.min(n - 1, (a ?? -1) + 1));
            else if (e.key === "ArrowLeft") setActive((a) => Math.max(0, (a ?? n) - 1));
            else if (e.key === "Escape") setActive(null);
          }}
        >
          <defs>
            {paths.map(({ s }) => (
              <linearGradient key={s.id} id={`${id}-${s.id}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--color-chart-grid)" strokeWidth={1} />
              <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" className="fill-faint text-[11px] tabular">
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {labels.map((label, i) =>
            i % labelStep === 0 ? (
              <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-faint text-[11px]">
                {label}
              </text>
            ) : null,
          )}
          {reference && (
            <g>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(reference.value)}
                y2={y(reference.value)}
                stroke="var(--color-faint)"
                strokeOpacity={0.6}
                strokeWidth={1}
              />
              <text x={width - pad.right + 4} y={y(reference.value) + 4} className="fill-faint text-[10px]">
                {reference.label}
              </text>
            </g>
          )}
          {paths.map(({ s, area }) =>
            area ? <path key={`a-${s.id}`} data-area="" d={area} fill={`url(#${id}-${s.id})`} /> : null,
          )}
          {paths.map(({ s, d }) => (
            <path key={s.id} data-line="" d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {paths.map(({ s, lastIdx }) =>
            s.values.map((v, i) =>
              v !== null && (s.markers || i === lastIdx) ? (
                <circle key={`${s.id}-${i}`} cx={x(i)} cy={y(v)} r={4} fill={s.color} stroke="var(--color-surface)" strokeWidth={2} />
              ) : null,
            ),
          )}
          {/* The end value of the main series, labeled once. */}
          {paths[0] && paths[0].lastIdx >= 0 && paths[0].s.values[paths[0].lastIdx] !== null && (
            <text
              x={x(paths[0].lastIdx) + 8}
              y={y(paths[0].s.values[paths[0].lastIdx]!) + 4}
              className="fill-ink text-[11px] font-semibold tabular"
            >
              {format(paths[0].s.values[paths[0].lastIdx]!)}
            </text>
          )}
          {active !== null && (
            <g pointerEvents="none">
              <line x1={x(active)} x2={x(active)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-control)" strokeWidth={1} />
              {series.map((s) =>
                s.values[active] !== null ? (
                  <circle key={s.id} cx={x(active)} cy={y(s.values[active]!)} r={5.5} fill={s.color} stroke="var(--color-ink)" strokeWidth={2} />
                ) : null,
              )}
            </g>
          )}
        </svg>
        {active !== null && (
          <div
            role="status"
            className="bg-raised pointer-events-none absolute top-1 z-10 min-w-[120px] rounded-xl px-3 py-2 text-[12px] shadow-[0_12px_30px_-10px_rgb(0_0_0/0.9)]"
            style={{ left: flip ? undefined : tooltipX + 10, right: flip ? width - tooltipX + 10 : undefined }}
          >
            <p className="mb-1 font-medium text-ink">{labels[active]}</p>
            {series.map((s) => (
              <p key={s.id} className="flex items-center justify-between gap-3 text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular font-medium text-ink">{s.values[active] === null ? "—" : format(s.values[active]!)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Point</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={i}>
              <th scope="row">{label}</th>
              {series.map((s) => (
                <td key={s.id}>{s.values[i] === null ? "no data" : format(s.values[i]!)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
