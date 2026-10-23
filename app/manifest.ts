import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/config";
import { PWA_BACKGROUND_COLOR, PWA_THEME_COLOR } from "@/lib/pwa/metadata";

/** Same icon for every shortcut; Android requires one of at least 96 × 96. */
const shortcutIcons = [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }];

/**
 * The web app manifest: lets phones and computers install FantasyLab like an app
 * (own icon, full screen, no browser bar). Served at /manifest.webmanifest and linked
 * from every page automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable identity: "/" is what browsers computed for installs made before this field existed,
    // so existing home-screen installs keep being recognized as the same app.
    id: "/",
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: "en-US",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Where full "standalone" isn't supported (some desktop browsers), keep back/reload buttons
    // rather than opening a normal browser tab.
    display_override: ["standalone", "minimal-ui"],
    // No orientation lock: portrait and landscape both work.
    background_color: PWA_BACKGROUND_COLOR,
    theme_color: PWA_THEME_COLOR,
    categories: ["sports", "entertainment"],
    prefer_related_applications: false,
    // Opening the app (or a shortcut) while it's already open reuses that window.
    launch_handler: { client_mode: ["navigate-existing", "auto"] },
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon (Android, desktop) to jump straight to these screens.
    shortcuts: [
      { name: "Home", url: "/", description: "Your fantasy dashboard", icons: shortcutIcons },
      { name: "My team", url: "/team", description: "Your lineup and live points", icons: shortcutIcons },
      {
        name: "Start/Sit",
        short_name: "Start/Sit",
        url: "/start-sit",
        description: "Who to start this week",
        icons: shortcutIcons,
      },
      { name: "Players", url: "/players", description: "Search and compare players", icons: shortcutIcons },
      { name: "Trades", url: "/trades", description: "Check a trade before you make it", icons: shortcutIcons },
    ],
  };
}
