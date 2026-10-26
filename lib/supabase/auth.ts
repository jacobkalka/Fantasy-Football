/**
 * Who's signed in, in the browser.
 *
 * One shared store (like the roster store): every component that calls
 * useAuth() updates together when you sign in or out. Sign-in is by email
 * (a link or a 6-digit code) or Google. The session lives in cookies managed by
 * Supabase, so it survives reloads; Supabase refreshes it in the background.
 *
 * States: "disabled" (database not connected yet), "loading", "signed-out",
 * "signed-in".
 */
import { useSyncExternalStore } from "react";
import { primaryRoster } from "@/lib/roster/store";
import { friendlyAuthError } from "./auth-errors";
import { loadSupabase, requireSupabase } from "./client";
import { isSupabaseConfigured, readSupabaseEnv } from "./config";
import { friendlyDbError } from "./db-errors";
import { rosterSync } from "./roster-sync";
import { normalizeUsername, usernameProblem } from "./username";

export interface AuthUser {
  id: string;
  email: string | null;
}

export type AuthState =
  | { status: "disabled" }
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AuthUser };

export interface Profile {
  id: string;
  username: string;
  avatarUrl: string | null;
  /** ESPN team id. */
  favoriteTeam: string | null;
  isAdmin: boolean;
}

const DISABLED: AuthState = { status: "disabled" };
const LOADING: AuthState = { status: "loading" };
const SIGNED_OUT: AuthState = { status: "signed-out" };
const INITIAL: AuthState = isSupabaseConfigured() ? LOADING : DISABLED;

let auth: AuthState = INITIAL;
let profileState: { userId: string | null; profile: Profile | null; status: "idle" | "loading" | "ready" | "error" } = {
  userId: null,
  profile: null,
  status: "idle",
};
const listeners = new Set<() => void>();
let started = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function setAuth(next: AuthState) {
  const same =
    next.status === auth.status &&
    (next.status !== "signed-in" ||
      (auth.status === "signed-in" && auth.user.id === next.user.id && auth.user.email === next.user.email));
  if (same) return;
  auth = next;
  if (next.status === "signed-in") {
    if (profileState.userId !== next.user.id) void loadProfile(next.user.id);
  } else {
    profileState = { userId: null, profile: null, status: "idle" };
  }
  emit();
}

function start() {
  if (started || auth.status === "disabled") return;
  started = true;
  loadSupabase()
    .then((supabase) => {
      if (!supabase) return setAuth(SIGNED_OUT);
      supabase.auth.onAuthStateChange((_event, session) => {
        const user = session?.user;
        setAuth(user ? { status: "signed-in", user: { id: user.id, email: user.email ?? null } } : SIGNED_OUT);
      });
    })
    .catch(() => {
      // Couldn't download the sign-in code (offline). Try again on the next subscriber.
      started = false;
      setAuth(SIGNED_OUT);
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => {
    listeners.delete(listener);
  };
}

/** The current sign-in state. Same answer on the server and the first browser render. */
export function useAuth(): AuthState {
  return useSyncExternalStore(
    subscribe,
    () => auth,
    () => INITIAL,
  );
}

// ── Profile (username, picture, favorite team) ───────────────────────────────

const PROFILE_FIELDS = "id, username, avatar_url, favorite_team, is_admin";

function toProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    username: String(row.username),
    avatarUrl: typeof row.avatar_url === "string" ? row.avatar_url : null,
    favoriteTeam: typeof row.favorite_team === "string" ? row.favorite_team : null,
    isAdmin: row.is_admin === true,
  };
}

async function loadProfile(userId: string) {
  profileState = { userId, profile: null, status: "loading" };
  emit();
  try {
    const supabase = await requireSupabase();
    const { data, error } = await supabase.from("profiles").select(PROFILE_FIELDS).eq("id", userId).maybeSingle();
    if (profileState.userId !== userId) return;
    if (error) throw error;
    // The profile is created by the database the moment the account is; null only if something went wrong there.
    profileState = { userId, profile: data ? toProfile(data) : null, status: data ? "ready" : "error" };
  } catch {
    if (profileState.userId !== userId) return;
    profileState = { userId, profile: null, status: "error" };
  }
  emit();
}

const NO_PROFILE = { userId: null, profile: null, status: "idle" as const };

/** The signed-in person's profile (null until loaded or when signed out). */
export function useProfile(): { profile: Profile | null; status: "idle" | "loading" | "ready" | "error" } {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => profileState,
    () => NO_PROFILE,
  );
  return { profile: snapshot.profile, status: snapshot.status };
}

export function reloadProfile() {
  if (auth.status === "signed-in") void loadProfile(auth.user.id);
}

/** Saves a new username and favorite team. Returns a plain-English error, if any. */
export async function updateProfile(changes: { username: string; favoriteTeam: string | null }): Promise<{ error?: string }> {
  if (auth.status !== "signed-in") return { error: "Sign in first." };
  const problem = usernameProblem(changes.username);
  if (problem) return { error: problem };
  const userId = auth.user.id;
  try {
    const supabase = await requireSupabase();
    const { data, error } = await supabase
      .from("profiles")
      .update({ username: normalizeUsername(changes.username), favorite_team: changes.favoriteTeam || null })
      .eq("id", userId)
      .select(PROFILE_FIELDS)
      .single();
    if (error) return { error: friendlyDbError(error, "save") };
    profileState = { userId, profile: toProfile(data), status: "ready" };
    emit();
    return {};
  } catch (error) {
    return { error: friendlyDbError(error, "save") };
  }
}

// ── Signing in ───────────────────────────────────────────────────────────────

function callbackUrl(next: string) {
  const url = new URL("/auth/callback", window.location.origin);
  url.searchParams.set("next", next);
  return url.toString();
}

/** Emails a sign-in link (and code). New emails get a new account automatically. */
export async function sendSignInEmail(email: string, next: string): Promise<{ error?: string }> {
  try {
    const supabase = await requireSupabase();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: true },
    });
    return error ? { error: friendlyAuthError(error) } : {};
  } catch (error) {
    return { error: friendlyAuthError(error as Error) };
  }
}

/** Signs in with the 6-digit code from the email. */
export async function verifySignInCode(email: string, code: string): Promise<{ error?: string }> {
  try {
    const supabase = await requireSupabase();
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    return error ? { error: friendlyAuthError(error) } : {};
  } catch (error) {
    return { error: friendlyAuthError(error as Error) };
  }
}

/** Sends the browser to Google, which sends it back to /auth/callback. */
export async function signInWithGoogle(next: string): Promise<{ error?: string }> {
  try {
    const supabase = await requireSupabase();
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: callbackUrl(next) } });
    return error ? { error: friendlyAuthError(error) } : {};
  } catch (error) {
    return { error: friendlyAuthError(error as Error) };
  }
}

/**
 * Which sign-in options are switched on in the Supabase dashboard. Google only
 * works once it's been set up there, so its button stays hidden until then.
 */
export async function fetchSignInOptions(): Promise<{ google: boolean; email: boolean } | null> {
  const env = readSupabaseEnv();
  if (!env) return null;
  try {
    const response = await fetch(`${env.url}/auth/v1/settings`, { headers: { apikey: env.publishableKey } });
    if (!response.ok) return null;
    const body = (await response.json()) as { external?: Record<string, boolean> };
    return { google: body.external?.google === true, email: body.external?.email !== false };
  } catch {
    return null;
  }
}

/**
 * Signs out of this device. If your team is safely saved in your account, the
 * device copy is cleared (sign back in to get it). If the latest edits couldn't
 * be saved (offline), they're kept on the device so nothing is lost.
 */
export async function signOut(): Promise<{ error?: string; keptOnDevice?: boolean }> {
  const saved = await rosterSync.flush();
  const supabase = await loadSupabase().catch(() => null);
  if (supabase) {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) return { error: "Couldn't sign out. Check your connection and try again." };
  }
  rosterSync.stop();
  setAuth(SIGNED_OUT);
  if (saved) {
    rosterSync.forget();
    primaryRoster.actions.clear();
    rosterSync.announce("Signed out. Your team is saved in your account; sign in to get it back.");
    return { keptOnDevice: false };
  }
  rosterSync.announce(
    rosterSync.hasLocalPlayers()
      ? "Signed out. Your latest team changes couldn't be saved to your account, so they're still on this device."
      : "Signed out.",
  );
  return { keptOnDevice: true };
}
