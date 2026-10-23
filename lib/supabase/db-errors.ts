/**
 * Turns database errors into plain English. Supabase's database API sends
 * { code, message, hint }: `code` is Postgres's error code (e.g. "23505" =
 * duplicate), and our own database rules add hints like "rate_limited".
 */
export interface DbErrorLike {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
  name?: string;
}

export type DbAction = "load" | "send" | "react" | "report" | "block" | "delete" | "save" | "share";

const GENERIC: Record<DbAction, string> = {
  load: "Couldn't load messages. Try again in a moment.",
  send: "Your message didn't send. Try again in a moment.",
  react: "Couldn't add that reaction. Try again.",
  report: "Couldn't send the report. Try again in a moment.",
  block: "Couldn't block that person. Try again in a moment.",
  delete: "Couldn't delete the message. Try again in a moment.",
  save: "Couldn't save your changes. Try again in a moment.",
  share: "Couldn't share the play. Try again in a moment.",
};

export function isNetworkError(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (!error || typeof error !== "object") return false;
  const { name, message } = error as { name?: string; message?: string };
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(`${name ?? ""} ${message ?? ""}`);
}

/** "Already exists": e.g. reacting twice or blocking someone already blocked. Usually fine to ignore. */
export function isDuplicateError(error: unknown): boolean {
  return (error as DbErrorLike | null)?.code === "23505";
}

export function friendlyDbError(error: unknown, action: DbAction): string {
  if (isNetworkError(error)) return "You seem to be offline. Check your connection and try again.";
  const e = (error ?? {}) as DbErrorLike;
  if (e.hint === "rate_limited" || /too fast/i.test(e.message ?? "")) {
    return "You're sending messages too fast. Wait a second and try again.";
  }
  switch (e.code) {
    case "23514": // a check rule failed
      if (action === "send" || action === "share") return "Messages need between 1 and 500 characters.";
      if (action === "save") return "Something in there isn't allowed. Check the highlighted field.";
      break;
    case "23505": // duplicate
      if (action === "report") return "You already reported this message. Thanks, a moderator will look at it.";
      if (action === "save") return "That username is taken. Try another one.";
      break;
    case "42501": // not allowed
    case "PGRST301":
    case "PGRST303":
      return "You need to be signed in to do that. Try signing out and back in.";
    case "PGRST116": // no row
      if (action === "delete" || action === "react") return "That message is gone.";
      break;
  }
  return GENERIC[action];
}
