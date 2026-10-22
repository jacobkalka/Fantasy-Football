/** Color helpers for team colors, which range from near-black navy to bright orange. */

function luminance(hex: string) {
  const m = hex.replace("#", "").match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return 0;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A team color that shows up on our near-black background: the primary color,
 * or the alternate when the primary is too dark (Houston's navy, Seattle's blue).
 */
export function visibleTeamColor(team?: { color: string; altColor: string } | null, fallback = "#5a6570") {
  if (!team) return fallback;
  if (luminance(team.color) >= 0.04) return team.color;
  return luminance(team.altColor) >= 0.04 ? team.altColor : fallback;
}
