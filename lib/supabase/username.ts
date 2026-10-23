/**
 * Usernames follow the database rule exactly (profiles_username_format):
 * 3 to 24 characters, lowercase letters, numbers and underscores only.
 */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 24;
const PATTERN = /^[a-z0-9_]+$/;

/** Tidies what someone typed: trims spaces and lowercases ("Jo_Smith " → "jo_smith"). */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A plain-English problem with the username, or null if it's fine. */
export function usernameProblem(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN) return `Use at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `Use at most ${USERNAME_MAX} characters.`;
  if (!PATTERN.test(name)) return "Use only letters, numbers and _ (no spaces or symbols).";
  return null;
}
