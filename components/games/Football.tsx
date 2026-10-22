/** A tiny football marking the team with the ball. */
export function Football({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 14" width="16" height="10" className={className} role="img" aria-label="Has the ball">
      <ellipse cx="12" cy="7" rx="11" ry="6" fill="#8a4b22" stroke="#f3d3b0" strokeWidth="1" />
      <path d="M8 7h8M10 5.5v3M12 5.5v3M14 5.5v3" stroke="#f7efe6" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}
