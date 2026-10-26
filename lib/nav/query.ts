"use client";

/**
 * Small URL-state helpers built on the browser's History API, which Next.js keeps in sync with
 * useSearchParams (node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md,
 * "Using the native History API"). No server round trip, no remount: tabs, filters and the
 * player overlay live in the URL, so they survive a refresh and work as links.
 */
export function setQueryParams(updates: Record<string, string | null>, { push = false }: { push?: boolean } = {}) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  if (push) window.history.pushState({ ...window.history.state, __fl: true }, "", next);
  else window.history.replaceState(window.history.state, "", next);
}

/** Open the canonical player profile over the current screen (deep-linkable: ?player=<id>). */
export function openPlayer(playerId: string) {
  if (!/^-?\d{1,12}$/.test(playerId)) return;
  const current = new URL(window.location.href).searchParams.get("player");
  if (current === playerId) return;
  // Opening one profile from another replaces it, so Back returns to the screen underneath.
  setQueryParams({ player: playerId }, { push: !current });
}

/** Close the profile: go back if we opened it (keeps the screen's scroll), else drop the param. */
export function closePlayer() {
  if ((window.history.state as { __fl?: boolean } | null)?.__fl) window.history.back();
  else setQueryParams({ player: null });
}

/** Open a public user profile over the current screen (?user=<username>). */
export function openUser(username: string) {
  if (!/^[a-z0-9_]{3,24}$/.test(username)) return;
  const current = new URL(window.location.href).searchParams.get("user");
  if (current === username) return;
  setQueryParams({ user: username }, { push: !current });
}

export function closeUser() {
  if ((window.history.state as { __fl?: boolean } | null)?.__fl) window.history.back();
  else setQueryParams({ user: null });
}
