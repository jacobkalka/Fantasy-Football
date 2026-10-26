import { z } from "zod";
import {
  deleteCredentials,
  espnLinkAvailable,
  EspnLinkUnavailableError,
  readCredentials,
  saveCredentials,
} from "@/lib/espn-link/service";
import { validateEspnCookies } from "@/lib/espn-link/secret-box";
import { currentUser } from "@/lib/supabase/session";

/**
 * Your ESPN login for private leagues.
 *   GET    → { available, connected, status }   (never the cookies themselves)
 *   POST   { espnS2, swid } → saves them encrypted
 *   DELETE → removes them
 * Signed-in users only; each user can only touch their own connection.
 */
const Body = z.object({ espnS2: z.string().min(1).max(2000), swid: z.string().min(1).max(64) });

const noStore = { "cache-control": "private, no-store" };

export async function GET() {
  const user = await currentUser();
  if (!espnLinkAvailable()) return Response.json({ available: false, connected: false, status: null }, { headers: noStore });
  if (!user) return Response.json({ available: true, connected: false, status: null, signedIn: false }, { headers: noStore });
  try {
    const saved = await readCredentials(user.id);
    return Response.json(
      { available: true, connected: Boolean(saved), status: saved?.status ?? null, signedIn: true },
      { headers: noStore },
    );
  } catch {
    return Response.json({ error: "Couldn't check your ESPN connection." }, { status: 500, headers: noStore });
  }
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Paste both values." }, { status: 400, headers: noStore });
  const problem = validateEspnCookies(parsed.data.espnS2, parsed.data.swid);
  if (problem) return Response.json({ error: problem }, { status: 400, headers: noStore });
  try {
    await saveCredentials(user.id, parsed.data);
    return Response.json({ connected: true, status: "active" }, { headers: noStore });
  } catch (error) {
    if (error instanceof EspnLinkUnavailableError) {
      return Response.json({ error: error.message }, { status: 503, headers: noStore });
    }
    // Never log the values themselves.
    console.error("espn connection save failed");
    return Response.json({ error: "Couldn't save the connection. Try again." }, { status: 500, headers: noStore });
  }
}

export async function DELETE() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Sign in first." }, { status: 401, headers: noStore });
  try {
    await deleteCredentials(user.id);
    return Response.json({ connected: false }, { headers: noStore });
  } catch (error) {
    if (error instanceof EspnLinkUnavailableError) {
      return Response.json({ error: error.message }, { status: 503, headers: noStore });
    }
    return Response.json({ error: "Couldn't remove the connection. Try again." }, { status: 500, headers: noStore });
  }
}
