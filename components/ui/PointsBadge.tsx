import { formatPoints, roundPoints } from "@/lib/scoring";

/** "+9.4" on lime glass, "−2.0" outlined in red, "0.0" muted. The sign always carries the meaning. */
export function PointsBadge({
  points,
  size = "md",
  className = "",
}: {
  points: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rounded = roundPoints(points, 1);
  const sizes = {
    sm: "px-1.5 text-sm",
    md: "px-2 py-0.5 text-lg",
    lg: "px-3 py-1 text-3xl",
  }[size];
  const tone =
    rounded > 0
      ? "glass-gain text-gain"
      : rounded < 0
        ? "border border-loss-line/70 bg-loss/10 text-loss"
        : "glass-chip text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-lg font-display leading-tight font-bold ${sizes} ${tone} ${className}`}
    >
      {formatPoints(points)}
    </span>
  );
}
