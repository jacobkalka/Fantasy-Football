/**
 * The 0-100 scale every team grade uses, and how numbers turn into words and letters.
 *
 * Anchored scale: `zero` maps to 0, `average` (what an average team in this league has) to 50,
 * `best` (the best anyone could have) to 100. Straight lines in between, clamped to 0-100.
 */

export function anchored(x: number, zero: number, average: number, best: number): number {
  let score: number;
  if (x <= average) {
    score = average > zero ? (50 * (x - zero)) / (average - zero) : x >= average ? 50 : 0;
  } else {
    score = best > average ? 50 + (50 * (x - average)) / (best - average) : 100;
  }
  return Math.min(100, Math.max(0, score));
}

/** One decimal, for showing a 0-100 grade ("63.4"). */
export function round1(n: number): number {
  const v = Math.round(n * 10) / 10;
  return v === 0 ? 0 : v;
}

export type GradeLabel = "Elite" | "Strong" | "Above average" | "Average" | "Below average" | "Weak";

/** Words for a 0-100 grade where 50 is an average team in your league. */
export function gradeLabel(score: number): GradeLabel {
  if (score >= 85) return "Elite";
  if (score >= 65) return "Strong";
  if (score >= 55) return "Above average";
  if (score >= 45) return "Average";
  if (score >= 30) return "Below average";
  return "Weak";
}

export type LetterGrade = "A+" | "A" | "A-" | "B+" | "B" | "B-" | "C+" | "C" | "C-" | "D+" | "D" | "D-" | "F";

/**
 * Letter for a trade, from how much it moves your team rating (0-100 points), after risk.
 * About +1 rating point is a modest upgrade at one starting spot (~1 point per game).
 */
export function tradeLetter(ratingChange: number): LetterGrade {
  const steps: [number, LetterGrade][] = [
    [5, "A+"],
    [3.5, "A"],
    [2.5, "A-"],
    [1.75, "B+"],
    [1, "B"],
    [0.5, "B-"],
    [0.15, "C+"],
    [-0.15, "C"],
    [-0.5, "C-"],
    [-1, "D+"],
    [-2, "D"],
    [-3, "D-"],
  ];
  for (const [min, letter] of steps) if (ratingChange >= min) return letter;
  return "F";
}

/** One letter lower (A → A-, C- → D+), for trades that add risk. F stays F. */
export function lowerLetter(letter: LetterGrade): LetterGrade {
  const order: LetterGrade[] = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];
  return order[Math.min(order.length - 1, order.indexOf(letter) + 1)];
}
