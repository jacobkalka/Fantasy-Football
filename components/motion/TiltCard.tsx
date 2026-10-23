/**
 * Formerly a 3D tilt card; the new direction is flat (DECISIONS.md, "Design"). Kept as a
 * plain wrapper so older screens keep working while they're redesigned.
 */
export function TiltCard({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  max?: number;
}) {
  return (
    <div className={className} style={style}>
      {children}
    </div>
  );
}
