/**
 * Brute-force protection for the administrator code. A six-digit code has a million values, so
 * guesses are limited per account AND per network address:
 *   - 5 wrong codes in 15 minutes locks for 15 minutes (from the last wrong code);
 *   - 20 wrong codes in 24 hours locks for 24 hours.
 * Every attempt is logged server-side; a locked attempt doesn't even check the code.
 */

export const SHORT_WINDOW_MS = 15 * 60_000;
export const SHORT_LIMIT = 5;
export const LONG_WINDOW_MS = 24 * 3600_000;
export const LONG_LIMIT = 20;

export interface Lockout {
  locked: boolean;
  /** Seconds until another attempt is allowed (0 when not locked). */
  retryAfter: number;
}

/** `failures` are the times (ms) of recent wrong codes for one account or one address. */
export function lockoutFor(failures: number[], now: number): Lockout {
  const recent = failures.filter((t) => now - t < LONG_WINDOW_MS).sort((a, b) => a - b);
  const short = recent.filter((t) => now - t < SHORT_WINDOW_MS);
  if (recent.length >= LONG_LIMIT) {
    const unlock = recent[recent.length - LONG_LIMIT] + LONG_WINDOW_MS;
    return { locked: true, retryAfter: Math.max(1, Math.ceil((unlock - now) / 1000)) };
  }
  if (short.length >= SHORT_LIMIT) {
    const unlock = short[short.length - 1] + SHORT_WINDOW_MS;
    return { locked: true, retryAfter: Math.max(1, Math.ceil((unlock - now) / 1000)) };
  }
  return { locked: false, retryAfter: 0 };
}

/** The stricter of the account's and the address's lockouts. */
export function combinedLockout(byUser: number[], byAddress: number[], now: number): Lockout {
  const a = lockoutFor(byUser, now);
  const b = lockoutFor(byAddress, now);
  return a.retryAfter >= b.retryAfter ? a : b;
}
