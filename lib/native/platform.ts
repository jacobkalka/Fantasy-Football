/**
 * Is this the Xpert iPhone/Android app (Capacitor) rather than a browser or the installed web app?
 * The <head> script (lib/pwa/boot.ts) asks Capacitor.isNativePlatform() before anything paints and
 * marks <html data-native>, so this is safe to call during the first client render and false on
 * the server. Native-only features (one-tap ESPN sign-in) check it; the website never needs it.
 */
export function isNativeApp(): boolean {
  if (typeof document === "undefined") return false;
  return document.documentElement.hasAttribute("data-native");
}

/** "ios" or "android" inside the app, null anywhere else. */
export function nativePlatform(): "ios" | "android" | null {
  if (!isNativeApp()) return null;
  const platform = (window as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.();
  if (platform === "ios" || platform === "android") return platform;
  return /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) ? "ios" : "android";
}
