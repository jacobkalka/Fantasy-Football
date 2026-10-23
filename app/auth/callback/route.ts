import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/supabase/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * GET /auth/callback?code=…&next=/chat
 *
 * Where the sign-in email link and Google send people back to. Swaps the
 * one-time code for a session (saved as cookies), then continues to `next`.
 * Any problem goes back to the sign-in page with a reason it can explain.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeNextPath(params.get("next"));
  const back = (reason: string) => {
    const url = new URL("/auth/sign-in", request.url);
    url.searchParams.set("error", reason.slice(0, 64));
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  };

  // Google or Supabase reported a problem (e.g. the person pressed Cancel).
  const reported = params.get("error_code") ?? params.get("error");
  if (reported) return back(reported);

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/auth/sign-in", request.url));

  const code = params.get("code");
  if (!code) return back("missing_code");
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return back(error.code ?? "exchange_failed");
  return NextResponse.redirect(new URL(next, request.url));
}
