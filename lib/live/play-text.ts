/**
 * Turns ESPN's play-by-play shorthand into something easier to read:
 * "(Shotgun) P.Mahomes pass short left to T.Kelce to LAC 33 for 5 yards (T.Jefferson)."
 *   → "P.Mahomes pass short left to T.Kelce to LAC 33 for 5 yards."
 */
export function cleanPlayText(text: string): string {
  return (
    text
      // Formation notes at the start: "(Shotgun)", "(No Huddle, Shotgun)", "(Punt formation)".
      .replace(/^(\s*\([^)]*\)\s*)+/, "")
      // Who made the tackle: "(T.Jefferson)" / "(D.Henley; N.Barrett)" / "(N.Herbig, C.Heyward)".
      .replace(/\s*\((?:[A-Z][A-Za-z'.-]*\.[A-Za-z' .-]+)(?:[;,]\s*[A-Z][A-Za-z'.-]*\.[A-Za-z' .-]+)*\)/g, "")
      // Assists in brackets: "[M.Crosby]".
      .replace(/\s*\[[^\]]*\]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\s+([.,])/g, "$1")
      .trim()
  );
}

/** Plays worth showing by default: at least a point either way, a touchdown, or an injury. */
export function isKeyPlay(item: { kind: string; points: number; isTouchdown: boolean }): boolean {
  return item.kind === "injury" || item.isTouchdown || Math.abs(item.points) >= 1;
}
