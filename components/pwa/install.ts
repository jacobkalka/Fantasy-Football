"use client";

import { useSyncExternalStore } from "react";
import { INSTALL_EVENT } from "@/lib/pwa/boot";

/**
 * How FantasyLab can be installed on the device you're using, if at all. Each browser does
 * it differently, and only Chrome-family browsers let a site show the install dialog itself:
 *
 * - installed     running as the installed app right now
 * - just-installed installed from this browser tab a moment ago (the tab itself stays a tab)
 * - prompt        Chrome, Edge, Samsung Internet: our Install button opens the browser's dialog
 * - ios-safari    iPhone/iPad Safari: Share → Add to Home Screen (sites can't open it for you)
 * - ios-browser   Chrome, Edge, Firefox on iPhone: the same, from their Share button
 * - ios-in-app    Instagram, Facebook, Google app... their built-in browsers can't install: open in Safari
 * - android-menu  Android browsers without the dialog (Firefox): menu → Install
 * - mac-safari    Safari on a Mac: File → Add to Dock
 * - desktop-menu  Chrome/Edge on a computer without the dialog right now: the install icon in the address bar
 * - unsupported   Firefox on a computer
 */
export type InstallRoute =
  | "installed"
  | "just-installed"
  | "prompt"
  | "ios-safari"
  | "ios-browser"
  | "ios-in-app"
  | "android-menu"
  | "mac-safari"
  | "desktop-menu"
  | "unsupported";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __fantasylabInstall?: InstallPromptEvent | null;
    __fantasylabInstalled?: boolean;
  }
  interface Navigator {
    standalone?: boolean;
  }
}

const DISPLAY_MODES = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"];

/** True when running as the installed app. The <head> script marks it before the first paint. */
export function isStandalone(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-standalone");
}

function detect(): InstallRoute {
  if (isStandalone()) return "installed";
  if (window.__fantasylabInstalled) return "just-installed";
  if (window.__fantasylabInstall) return "prompt";
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac; touch gives it away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (ios) {
    if (/FBAN|FBAV|Instagram|GSA\/|Line\/|LinkedInApp|Snapchat|TikTok|musical_ly|Pinterest|Twitter/.test(ua)) return "ios-in-app";
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/.test(ua)) return "ios-browser";
    return "ios-safari";
  }
  if (/Android/.test(ua)) return "android-menu";
  if (/Firefox\//.test(ua)) return "unsupported";
  if (/Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)) return "mac-safari";
  if (/Chrome|Chromium|Edg\//.test(ua)) return "desktop-menu";
  return "unsupported";
}

function subscribe(onChange: () => void) {
  const queries = DISPLAY_MODES.map((mode) => window.matchMedia(`(display-mode: ${mode})`));
  const onDisplayChange = () => {
    // Chrome on a computer can move this tab into the app window right after installing.
    const standalone = queries.some((q) => q.matches);
    document.documentElement.toggleAttribute("data-standalone", standalone);
    onChange();
  };
  window.addEventListener(INSTALL_EVENT, onChange);
  queries.forEach((q) => q.addEventListener("change", onDisplayChange));
  return () => {
    window.removeEventListener(INSTALL_EVENT, onChange);
    queries.forEach((q) => q.removeEventListener("change", onDisplayChange));
  };
}

/**
 * How to install on this device, or null on the server and while the page first loads
 * (so nothing about it is guessed before the browser is known).
 */
export function useInstallRoute(): InstallRoute | null {
  return useSyncExternalStore(subscribe, detect, () => null);
}

/**
 * Opens the browser's own install dialog (Chrome-family browsers only). It can be used once:
 * after a "no", the browser decides when to offer it again.
 */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const event = window.__fantasylabInstall;
  if (!event) return "unavailable";
  await event.prompt();
  const { outcome } = await event.userChoice;
  window.__fantasylabInstall = null;
  window.dispatchEvent(new Event(INSTALL_EVENT));
  if (outcome === "accepted") {
    // Installed apps keep their saved data; ask the browser to treat it as important.
    void navigator.storage?.persist?.().catch(() => false);
  }
  return outcome;
}
