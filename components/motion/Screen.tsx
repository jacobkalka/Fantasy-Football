/**
 * A screen's content column. Screen arrivals are animated once, for every page, by
 * app/template.tsx (GSAP); this only sets the spacing between a screen's blocks.
 */
export function Screen({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-5">{children}</div>;
}

/** Kept for older screens: content that replaces a placeholder. The new Reveal lives in ./Reveal. */
export function Reveal({ children }: { children: React.ReactNode; fallback?: boolean }) {
  return <div>{children}</div>;
}
