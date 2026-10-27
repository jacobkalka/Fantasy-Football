import { cookies, headers } from "next/headers";
import { adminSetup } from "@/lib/admin/config";
import { addressHash, attemptAdmin, COOKIE_NAME, sessionIdOf, verifyAdminCookie } from "@/lib/admin/service";
import { currentUser } from "@/lib/supabase/session";

/**
 * Admin Mode (DECISIONS.md, "Admin Mode").
 *   GET     is it available, and is it on for you?
 *   POST    { code }: check the administrator code; on success Admin Mode turns on
 *   DELETE  turn it off now
 *
 * The code is checked here only, against a server secret; nothing about it is ever sent back.
 * Every wrong-code answer is the same sentence after the same delay, so neither the message nor
 * the timing hints at how close a guess was. Too many wrong codes lock the account and the
 * network address out for a while.
 */

const noStore = { "cache-control": "private, no-store" };
/** Every code answer takes at least this long, right or wrong, so timing tells nothing. */
const ANSWER_MS = 900;
const INCORRECT = "Incorrect administrator code.";
const UNAVAILABLE = "Admin Mode isn't available on this server.";

const reply = (status: number, body: object, extra: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...noStore, ...extra } });

async function address(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/** Only this site's own pages may ask (no cross-site form posts, no scripts elsewhere). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

function cookieOptions(request: Request, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: new URL(request.url).protocol === "https:" || process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export async function GET() {
  const setup = adminSetup();
  const user = await currentUser();
  if (!setup) return reply(200, { available: false, signedIn: Boolean(user), active: false, expiresAt: null });
  if (!user) return reply(200, { available: true, signedIn: false, active: false, expiresAt: null });
  const jar = await cookies();
  try {
    const session = await verifyAdminCookie({ cookie: jar.get(COOKIE_NAME)?.value, userId: user.id, store: setup.store, secret: setup.config.secret });
    return reply(200, {
      available: true,
      signedIn: true,
      active: session.active,
      expiresAt: session.active ? new Date(session.expiresAt).toISOString() : null,
    });
  } catch {
    return reply(503, { error: "Couldn't check Admin Mode right now." });
  }
}

export async function POST(request: Request) {
  const started = Date.now();
  const answer = async (status: number, body: object, extra?: Record<string, string>) => {
    const wait = ANSWER_MS - (Date.now() - started);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return reply(status, body, extra);
  };

  if (!sameOrigin(request) || !request.headers.get("content-type")?.includes("application/json")) {
    return answer(403, { error: "Not allowed." });
  }
  const user = await currentUser();
  if (!user) return answer(401, { error: "Sign in first." });
  const setup = adminSetup();
  if (!setup) return answer(503, { error: UNAVAILABLE });

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const ipHash = addressHash(setup.config.secret, await address());
  try {
    const result = await attemptAdmin({ code: body?.code, userId: user.id, ipHash, store: setup.store, config: setup.config });
    if (result.ok) {
      const jar = await cookies();
      jar.set(COOKIE_NAME, result.cookie, cookieOptions(request, Math.floor((result.expiresAt - Date.now()) / 1000)));
      return answer(200, { active: true, expiresAt: new Date(result.expiresAt).toISOString() });
    }
    if (result.reason === "locked") {
      // Repeated attempts are worth a look; never log what was typed.
      console.warn("admin mode: attempt while locked out", { user: user.id, address: ipHash.slice(0, 12) });
      return answer(429, { error: "Too many attempts. Try again later.", retryAfter: result.retryAfter }, { "retry-after": String(result.retryAfter) });
    }
    return answer(401, { error: INCORRECT });
  } catch {
    console.error("admin mode: check failed");
    return answer(503, { error: "Couldn't check the code right now. Try again later." });
  }
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return reply(403, { error: "Not allowed." });
  const jar = await cookies();
  const cookie = jar.get(COOKIE_NAME)?.value;
  jar.set(COOKIE_NAME, "", cookieOptions(request, 0));
  const setup = adminSetup();
  const user = await currentUser();
  if (setup && user && cookie) {
    try {
      const session = await verifyAdminCookie({ cookie, userId: user.id, store: setup.store, secret: setup.config.secret });
      const id = session.active ? session.sessionId : sessionIdOf(cookie);
      if (session.active && id) await setup.store.revokeSession(id);
    } catch {
      // The cookie is gone either way; the session expires on its own.
    }
  }
  return reply(200, { active: false });
}
