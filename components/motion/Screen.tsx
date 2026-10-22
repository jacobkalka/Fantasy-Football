import { ViewTransition } from "react";

/**
 * Wrap each page in this. When you switch tabs, the old screen slides out and the
 * new one slides in from the side you moved toward. Pages, not the layout, own it:
 * layouts stay mounted across navigations, so they never "enter" or "exit".
 */
export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition
      enter={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      exit={{ "nav-forward": "nav-forward", "nav-back": "nav-back", default: "none" }}
      default="none"
    >
      <div className="flex flex-col gap-5">{children}</div>
    </ViewTransition>
  );
}

/** Loading placeholder that slides away when the real content arrives. */
export function Reveal({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: boolean;
}) {
  return fallback ? (
    <ViewTransition exit="slide-down" default="none">
      <div>{children}</div>
    </ViewTransition>
  ) : (
    <ViewTransition enter="slide-up" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
