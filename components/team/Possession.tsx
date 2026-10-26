import type { PlayerGame } from "@/lib/live/types";
import type { Position } from "@/lib/providers/types";

/**
 * Who has the ball in a player's game, straight from ESPN's live game situation
 * (lib/live/team.ts): "On offense · ball" when his team has it, "Opponent's ball" when it
 * doesn't, and "Possession unknown" when ESPN doesn't say (halftime, reviews, between
 * drives). Never guessed. For a D/ST it's flipped: the unit is on the field when the
 * opponent has the ball. Shape + word + colour, never colour alone.
 */
export function Possession({ game, position }: { game: PlayerGame | null; position: Position }) {
  if (!game || game.state !== "in" || !game.possession) return null;
  const dst = position === "DST";
  if (game.possession === "unknown") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-well px-1.5 py-0.5 text-[11px] font-medium text-muted" title="ESPN isn't reporting possession right now">
        <span className="size-1.5 rounded-full border border-faint" aria-hidden="true" />
        Possession unknown
      </span>
    );
  }
  const ours = game.possession === "ball";
  const onField = dst ? !ours : ours;
  const label = dst ? (ours ? "Offense has ball" : "On the field") : ours ? "Ball · on offense" : "Opponent's ball";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
        onField ? "bg-positive-soft text-positive" : "bg-well text-muted"
      }`}
      title={game.downDistance ?? undefined}
    >
      <span
        className={`size-1.5 rounded-full ${onField ? "live-dot bg-positive" : "border border-muted"}`}
        aria-hidden="true"
      />
      {label}
      {game.isRedZone && ours && !dst && <span className="ml-0.5 text-negative">· Red zone</span>}
    </span>
  );
}
