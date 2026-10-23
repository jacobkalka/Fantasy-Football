/**
 * A light, friendly profanity mask for chat: "what the f***".
 *
 * Only on screen: the message itself is stored as typed, and moderation (reports,
 * blocks, admins deleting messages) is the real safety net. Whole words only, so
 * "Scunthorpe", "class" and "assassin" are left alone. Catches stretched spellings
 * ("fuuuck") and simple look-alike characters ("sh1t", "@ss"). Football names
 * stay readable: plain "dick" isn't listed (Dick Vermeil, Dick Butkus).
 * To add a word, add it to WORDS (lowercase).
 */
const WORDS = [
  "fuck",
  "fucker",
  "motherfucker",
  "fck",
  "shit",
  "bullshit",
  "horseshit",
  "dipshit",
  "bitch",
  "cunt",
  "asshole",
  "ass",
  "jackass",
  "dumbass",
  "dickhead", // not plain "dick": Dick Vermeil, Dick LeBeau…
  "pussy",
  "bastard",
  "slut",
  "whore",
  "twat",
  "wanker",
];

// Look-alike characters people use to dodge filters.
const LOOKALIKES: Record<string, string> = {
  a: "a@4",
  e: "e3",
  i: "i1!|",
  o: "o0",
  s: "s$5",
  t: "t7+",
  u: "uv",
  c: "ck",
  k: "kc",
};

function letterClass(letter: string) {
  const chars = LOOKALIKES[letter] ?? letter;
  return `[${chars.replace(/[\]\\^-]/g, "\\$&")}]+`;
}

// Common endings: fucking, shitty, bitches, asses, dicks …
const SUFFIX = "(?:ing|in|in'|ed|er|ers|s|es|y|ty)?";

const PATTERN = new RegExp(
  `(?<![\\p{L}\\p{N}])(?:${[...WORDS]
    .sort((a, b) => b.length - a.length)
    .map((word) => [...word].map(letterClass).join(""))
    .join("|")})${SUFFIX}(?![\\p{L}\\p{N}])`,
  "giu",
);

/** Replaces each listed word with its first letter and asterisks: "shit" → "s***". */
export function maskProfanity(text: string): string {
  return text.replace(PATTERN, (word) => word[0] + "*".repeat(Math.max(1, word.length - 1)));
}

export function hasProfanity(text: string): boolean {
  PATTERN.lastIndex = 0;
  const found = PATTERN.test(text);
  PATTERN.lastIndex = 0;
  return found;
}
