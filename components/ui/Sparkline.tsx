/** A tiny line chart of points piling up over a game ("momentum"). Decorative. */
export function Sparkline({
  values,
  width = 64,
  height = 18,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const series = values.length > 1 ? values : [0, values[0] ?? 0];
  const min = Math.min(0, ...series);
  const max = Math.max(1, ...series);
  const points = series
    .map((v, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - 2 - ((v - min) / (max - min)) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const last = series[series.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={last >= 0 ? "var(--color-positive)" : "var(--color-negative)"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
      />
    </svg>
  );
}
