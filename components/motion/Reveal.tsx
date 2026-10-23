/**
 * A group of blocks that replaces its loading placeholder. The entrance itself is handled
 * for every screen by PageEnter (cards cascade in when they appear, or when you scroll to
 * them), so this is only the layout wrapper.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  /** Kept for older callers; every reveal now cascades. */
  stagger?: boolean;
  as?: "div" | "section" | "ul" | "ol";
}) {
  return <Tag className={className}>{children}</Tag>;
}
