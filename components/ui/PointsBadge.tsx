import { formatPoints, roundPoints } from "@/lib/scoring";

/** "+9.40" cyan, "−2.00" coral, "0.00" grey: a pale tint with the sign always carrying the meaning. */
export function PointsBadge({
  points,
  size = "md",
  className = "",
}: {
  points: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const rounded = roundPoints(points, 2);
  const sizes = {
    sm: "h-[22px] px-1.5 text-[12px]",
    md: "h-7 px-2 text-[14px]",
    lg: "h-9 px-3 text-[18px]",
  }[size];
  const tone =
    rounded > 0 ? "bg-positive-soft text-positive" : rounded < 0 ? "bg-negative-soft text-negative" : "bg-well text-muted";
  return (
    <span className={`tabular inline-flex items-center rounded-full font-semibold ${sizes} ${tone} ${className}`}>
      {formatPoints(points)}
    </span>
  );
}
