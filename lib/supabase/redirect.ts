/**
 * Where to send someone after they sign in.
 *
 * The page they came from travels along as "?next=/chat". Only paths on this
 * site are allowed, so a crafted link can't bounce people to another website
 * after signing in (an "open redirect").
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/account"): string {
  if (!raw) return fallback;
  // Must be a path on this site: "/chat" yes; "//evil.com", "/\evil.com", "https://…" no.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  // Never loop back into the sign-in machinery itself.
  if (raw.startsWith("/auth/")) return fallback;
  try {
    const url = new URL(raw, "https://the-feed.invalid");
    if (url.origin !== "https://the-feed.invalid") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
