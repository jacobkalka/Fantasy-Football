/**
 * Community rules, shown the first time someone opens chat on a device.
 * Once they tap "I'm in", it's remembered in this browser.
 */
import { useSyncExternalStore } from "react";

export const COMMUNITY_RULES = [
  { title: "Trash-talk teams, not people", body: "Rivalries are the fun part. Personal attacks aren't." },
  { title: "No hate, threats or harassment", body: "Nothing about anyone's race, religion, gender, sexuality or disability. Ever." },
  { title: "No spam or ads", body: "One message a second, up to 500 characters. Links to scams get you removed." },
  { title: "Keep it about football (mostly)", body: "Plays, players, fantasy pain. Go wild." },
  { title: "Report it, block it", body: "Tap ⋯ on any message to report it or block the sender. Moderators review every report." },
] as const;

const KEY = "fantasylab:chat-rules:v1";
const LEGACY_KEY = "the-feed:chat-rules:v1";
const listeners = new Set<() => void>();
let accepted: boolean | null = null;

function read(): boolean {
  if (accepted !== null) return accepted;
  try {
    accepted = (window.localStorage.getItem(KEY) ?? window.localStorage.getItem(LEGACY_KEY)) === "accepted";
  } catch {
    accepted = false;
  }
  return accepted;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** True once this device has accepted the rules. (Server render: treated as accepted, to avoid a flash.) */
export function useRulesAccepted(): boolean {
  return useSyncExternalStore(subscribe, read, () => true);
}

export function acceptRules() {
  accepted = true;
  try {
    window.localStorage.setItem(KEY, "accepted");
  } catch {
    // Storage blocked: they'll see the rules again next visit. That's fine.
  }
  listeners.forEach((listener) => listener());
}
