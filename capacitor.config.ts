import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Xpert's native app (iOS and Android) is a window onto the live website: it loads the
 * production Vercel site, so every web update reaches app users at once, without an App Store
 * review. The web app stays the one codebase; native-only features check
 * `Capacitor.isNativePlatform()` (lib/native/platform.ts).
 *
 * Capacitor's docs mark `server.url` "not intended for use in production" (it's built for live
 * reload). It works, but the app needs a connection to open (offline it shows native/www/offline.html)
 * and Apple reviews website wrappers strictly (App Store guideline 4.2). DECISIONS.md, "Native app".
 *
 * To point a test build at another copy of the site (a Vercel preview), set XPERT_APP_URL before
 * `npx cap sync`, e.g. XPERT_APP_URL=https://… npx cap sync android.
 */
const SITE = process.env.XPERT_APP_URL?.trim() || "https://fantasy-football-xi-ecru.vercel.app";

const config: CapacitorConfig = {
  // Permanent once published to the stores (confirmed with the owner 2026-10-27).
  appId: "com.xpertfantasy.app",
  appName: "Xpert",
  // Required by Capacitor; with server.url it only holds the offline page.
  webDir: "native/www",
  backgroundColor: "#000000",
  server: {
    url: SITE,
    errorPath: "offline.html",
  },
  // Lets the website tell it's inside the app before any script runs (lib/pwa/boot.ts).
  // Set per platform: the root option adds stray spaces on iOS (Capacitor 8 upgrade notes).
  android: { appendUserAgent: "XpertApp/1" },
  ios: { appendUserAgent: "XpertApp/1", contentInset: "never" },
  plugins: {
    // Android 15+ draws apps edge to edge. "css" (the default) keeps env(safe-area-inset-*) right on
    // current WebViews and adds --safe-area-inset-* variables for older ones (app/globals.css uses both).
    // "DARK" means light status-bar icons for Xpert's black screens (iOS: UIUserInterfaceStyle in Info.plist).
    SystemBars: { insetsHandling: "css", style: "DARK", initialViewportFitValueHint: "cover" },
  },
};

export default config;
