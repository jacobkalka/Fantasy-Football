/**
 * Everything the root layout needs so FantasyLab installs and launches like an app.
 *
 * Spread these into app/layout.tsx:
 *   export const metadata: Metadata = { ...pwaMetadata, title: ..., description: ... };
 *   export const viewport: Viewport = { ...pwaViewport };
 *
 * The manifest itself (name, icons, shortcuts) is app/manifest.ts; Next.js links it automatically.
 */
import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/config";
import splashDevices from "./splash-devices.json";

/**
 * Browser bar / status bar color and the launch background. Must be a literal color
 * (manifests and meta tags can't read CSS variables). Pure black, like the splash screens.
 */
export const PWA_THEME_COLOR = "#000000";
export const PWA_BACKGROUND_COLOR = "#000000";

export interface SplashDevice {
  name: string;
  /** Screen size in CSS pixels, portrait. */
  width: number;
  height: number;
  /** Device pixel ratio. */
  ratio: number;
}

export interface SplashScreen {
  url: string;
  media: string;
  /** Image size in real pixels. */
  pixelWidth: number;
  pixelHeight: number;
  orientation: "portrait" | "landscape";
  device: string;
}

/** File name of one splash image, in real pixels (e.g. apple-splash-1179x2556.png). */
export function splashFileName(pixelWidth: number, pixelHeight: number) {
  return `apple-splash-${pixelWidth}x${pixelHeight}.png`;
}

/**
 * iPhone/iPad launch images (portrait + landscape for each screen size). iOS picks the one whose
 * media query matches the device exactly; a device not listed here launches on a plain screen.
 * Regenerate the images with `node lib/pwa/generate-splash.mjs` after changing the list or the logo.
 */
export const splashScreens: SplashScreen[] = (splashDevices as SplashDevice[]).flatMap((device) =>
  (["portrait", "landscape"] as const).map((orientation) => {
    const portrait = orientation === "portrait";
    const pixelWidth = (portrait ? device.width : device.height) * device.ratio;
    const pixelHeight = (portrait ? device.height : device.width) * device.ratio;
    return {
      url: `/splash/${splashFileName(pixelWidth, pixelHeight)}`,
      // iOS always reports device-width/height in portrait terms.
      media:
        `screen and (device-width: ${device.width}px) and (device-height: ${device.height}px)` +
        ` and (-webkit-device-pixel-ratio: ${device.ratio}) and (orientation: ${orientation})`,
      pixelWidth,
      pixelHeight,
      orientation,
      device: device.name,
    };
  }),
);

export const pwaMetadata = {
  applicationName: APP_NAME,
  appleWebApp: {
    // Next.js writes this as <meta name="mobile-web-app-capable">.
    capable: true,
    title: APP_NAME,
    // Content runs under the status bar (the layout pads with env(safe-area-inset-top)).
    statusBarStyle: "black-translucent",
    startupImage: splashScreens.map(({ url, media }) => ({ url, media })),
  },
  icons: {
    // Listing icons here replaces the automatic links for app/icon.svg and app/apple-icon.png,
    // so those same files are listed again.
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Stops iOS from turning scores and stat lines into phone-number links.
  formatDetection: { telephone: false },
  other: {
    // The older Apple-only spelling. Safari still reads it for home-screen launch images;
    // Next.js only writes the standard "mobile-web-app-capable", so both are sent.
    "apple-mobile-web-app-capable": "yes",
  },
} satisfies Metadata;

export const pwaViewport = {
  themeColor: PWA_THEME_COLOR,
  // Lets the app draw edge to edge (under the notch and home indicator).
  viewportFit: "cover",
  // Dark from the first paint, before the stylesheet loads.
  colorScheme: "dark",
} satisfies Viewport;
