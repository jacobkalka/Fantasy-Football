/**
 * Turns sign-in errors from Supabase into sentences a person can act on.
 * Supabase errors carry a `code` (e.g. "otp_expired") and an HTTP `status`.
 */
export interface AuthErrorLike {
  code?: string;
  status?: number;
  message?: string;
  name?: string;
}

function isOffline(error: AuthErrorLike) {
  const text = `${error.name ?? ""} ${error.message ?? ""}`;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(text);
}

export function friendlyAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return "Something went wrong. Try again in a moment.";
  if (isOffline(error)) return "You seem to be offline. Check your connection and try again.";
  switch (error.code) {
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many sign-in emails in a short time. Wait a minute, then try again.";
    case "otp_expired":
      return "That code or link has expired or was already used. Ask for a new one.";
    case "email_address_invalid":
    case "validation_failed":
      return "That email address doesn't look right. Check it and try again.";
    case "signup_disabled":
    case "email_provider_disabled":
      return "Sign-up by email is switched off for this app right now.";
    case "provider_disabled":
      return "That sign-in option isn't switched on yet. Use your email instead.";
    case "flow_state_not_found":
    case "flow_state_expired":
    case "bad_code_verifier":
      return "That sign-in link was opened in a different browser or has expired. Ask for a new one here, or type the 6-digit code from the email.";
    case "access_denied":
      return "Sign-in was cancelled. Try again whenever you're ready.";
    case "missing_code":
      return "That sign-in link is incomplete. Ask for a new one.";
  }
  if (error.status === 429) return "Too many tries in a short time. Wait a minute, then try again.";
  if (/token.*(expired|invalid)/i.test(error.message ?? "")) {
    return "That code is wrong or has expired. Check it, or ask for a new one.";
  }
  return "Something went wrong signing in. Try again in a moment.";
}
