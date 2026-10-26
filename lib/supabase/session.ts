import "server-only";

/**
 * Who is making this request? Verified by Supabase on the server (getUser checks the token with
 * the auth server, it doesn't just trust the cookie). null when signed out or accounts aren't set up.
 */
import { createSupabaseServerClient } from "./server";

export async function currentUser(): Promise<{ id: string } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id };
}
