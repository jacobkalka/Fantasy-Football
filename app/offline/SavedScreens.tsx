"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { APP_NAME } from "@/lib/config";

/** Must match the page cache name in public/sw.js ("fantasylab-pages-r<revision>-<build>"). */
const PAGES_CACHE_PREFIX = "fantasylab-pages-";
const SAVED_AT_HEADER = "x-fantasylab-saved-at";
const MAX_LISTED = 8;

interface SavedScreen {
  href: string;
  title: string;
  savedAt: number | null;
}

function titleOf(html: string, url: URL) {
  const tag = html.match(/<title[^>]*>[^<]*<\/title>/)?.[0];
  const title = tag ? new DOMParser().parseFromString(tag, "text/html").title.trim() : "";
  const short = title.replace(` · ${APP_NAME}`, "").trim();
  if (!short || short === APP_NAME) return url.pathname === "/" ? "Home" : url.pathname;
  return short;
}

async function readSavedScreens(): Promise<SavedScreen[]> {
  if (!("caches" in window)) return [];
  const names = (await caches.keys()).filter((name) => name.startsWith(PAGES_CACHE_PREFIX));
  const here = window.location.pathname + window.location.search;
  const screens: SavedScreen[] = [];
  for (const name of names) {
    const cache = await caches.open(name);
    // Oldest first in the cache; show the most recently saved.
    for (const request of [...(await cache.keys())].reverse()) {
      if (screens.length >= MAX_LISTED) break;
      const url = new URL(request.url);
      const href = url.pathname + url.search;
      if (href === here || screens.some((s) => s.href === href)) continue;
      const response = await cache.match(request);
      if (!response) continue;
      const savedAt = Number(response.headers.get(SAVED_AT_HEADER)) || null;
      screens.push({ href, title: titleOf(await response.text(), url), savedAt });
    }
  }
  return screens;
}

function savedLabel(savedAt: number | null) {
  if (!savedAt) return "Saved earlier";
  const date = new Date(savedAt);
  const sameDay = date.toDateString() === new Date().toDateString();
  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return sameDay ? `Saved at ${time}` : `Saved ${date.toLocaleDateString([], { weekday: "short" })} ${time}`;
}

/** Screens stored on this device by the service worker, so you can open them offline. */
export function SavedScreens() {
  const [screens, setScreens] = useState<SavedScreen[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSavedScreens()
      .then((list) => !cancelled && setScreens(list))
      .catch(() => !cancelled && setScreens([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!screens || screens.length === 0) return null;

  return (
    <section className="mt-6" aria-labelledby="saved-screens">
      <h2 id="saved-screens" className="px-1 pb-2 text-[13px] leading-5 font-medium text-muted">
        Saved on this device
      </h2>
      <ul className="card flex flex-col p-1.5">
        {screens.map((screen) => (
          <li key={screen.href}>
            {/* A full page load (not in-app navigation), so the service worker can serve the saved copy. */}
            <a
              href={screen.href}
              data-saved-screen
              className="pressable flex items-center gap-3 rounded-[var(--radius-inner)] px-3.5 py-3 hover:bg-raised"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] leading-6">{screen.title}</span>
                <span className="block text-[13px] leading-5 text-faint">{savedLabel(screen.savedAt)}</span>
              </span>
              <Icon name="chevronRight" size={16} className="text-faint" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
