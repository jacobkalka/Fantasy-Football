import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath } from "@/lib/supabase/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/**
 * GET /auth/confirm?token_hash=…&type=email&next=/chat
 *
 * For sign-in emails whose link was changed to point here (see the email
 * template steps in the setup notes). Unlike /auth/callback, this works even
 * when the email is opened in a different browser or app than the one that
 * asked for it.
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

  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.redirect(new URL("/auth/sign-in", request.url));

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (!tokenHash || !type || !TYPES.includes(type)) return back("missing_code");
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) return back(error.code ?? "otp_expired");
  return NextResponse.redirect(new URL(next, request.url));
}
