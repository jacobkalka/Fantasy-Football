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
    // Real screens of the app (a real roster, real projections). Android and desktop Chrome show
    // them in a larger install dialog. Retake with scripts/store-screenshots.mjs after a redesign.
    screenshots: [
      {
        src: "/screenshots/home-phone.png",
        sizes: "780x1688",
        type: "image/png",
        form_factor: "narrow",
        label: "Home: this week's projection and the lineup decisions that need you",
      },
      {
        src: "/screenshots/lineup-phone.png",
        sizes: "780x1688",
        type: "image/png",
        form_factor: "narrow",
        label: "Lineup: live points for every starter, play by play",
      },
      {
        src: "/screenshots/startsit-phone.png",
        sizes: "780x1688",
        type: "image/png",
        form_factor: "narrow",
        label: "Start/Sit: who to start, how sure we are, and why",
      },
      {
        src: "/screenshots/home-wide.png",
        sizes: "1440x900",
        type: "image/png",
        form_factor: "wide",
        label: `${APP_NAME} on a computer`,
      },
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
      { name: "Live", url: "/feed", description: "Every play that moves your points", icons: shortcutIcons },
      { name: "Matchup", url: "/team/matchup", description: "Your head-to-head, live", icons: shortcutIcons },
    ],
  };
}
