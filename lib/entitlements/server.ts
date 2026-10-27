import "server-only";

/** Entitlements for the person making this request, decided on the server (cookie + database). */
import { cookies } from "next/headers";
import { adminSetup } from "@/lib/admin/config";
import { COOKIE_NAME, verifyAdminCookie } from "@/lib/admin/service";
import { currentUser } from "@/lib/supabase/session";
import { NO_ENTITLEMENTS, type Entitlements } from "./index";

export async function currentEntitlements(): Promise<Entitlements> {
  const setup = adminSetup();
  const user = await currentUser();
  if (!setup || !user) return NO_ENTITLEMENTS;
  const jar = await cookies();
  const session = await verifyAdminCookie({ cookie: jar.get(COOKIE_NAME)?.value, userId: user.id, store: setup.store, secret: setup.config.secret });
  return session.active ? { admin: true, adminExpiresAt: new Date(session.expiresAt).toISOString(), granted: [] } : NO_ENTITLEMENTS;
}
