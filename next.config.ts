import type { NextConfig } from "next";

// One id per production build. The app registers /sw.js?v=<id>, so every deployment installs a
// new service worker (components/pwa/service-worker.ts). Kept in process.env so that every
// process of one build agrees on it; set PWA_BUILD_ID yourself only to pin it.
const pwaBuildId = (process.env.PWA_BUILD_ID ||= String(Date.now()));

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // How long shared server copies of ESPN data stay fresh (seconds). See lib/data/sports.ts.
  cacheLife: {
    // Live scores and plays: refetched from ESPN at most every 5 seconds, shared by every visitor.
    live: { stale: 30, revalidate: 5, expire: 120 },
    // Finished games don't change (except rare stat corrections).
    final: { stale: 300, revalidate: 1800, expire: 86400 },
    // News: checked every couple of minutes (breaking injury news matters on game days).
    news: { stale: 60, revalidate: 120, expire: 3600 },
    // Projections, injuries, news.
    outlook: { stale: 300, revalidate: 600, expire: 7200 },
    // Player list, teams, bye weeks.
    reference: { stale: 3600, revalidate: 21600, expire: 172800 },
  },
  images: {
    // Images are resized by ESPN's CDN (see lib/espn-image-loader.ts), not by Vercel.
    loader: "custom",
    loaderFile: "./lib/espn-image-loader.ts",
  },
  env: {
    PWA_BUILD_ID: pwaBuildId,
  },
  // Screens that moved in the 2026-10-26 navigation (DECISIONS.md, "Navigation"); old links keep working.
  async redirects() {
    return [
      { source: "/trades", destination: "/team/trades", permanent: false },
      { source: "/trades/calculator", destination: "/team/trades?tool=calculator", permanent: false },
      { source: "/players/pickups", destination: "/team/pickups", permanent: false },
      { source: "/players/watchlist", destination: "/feed?view=tracker", permanent: false },
      { source: "/team/rating", destination: "/team", permanent: false },
    ];
  },
  async headers() {
    return [
      {
        // The offline-support service worker (public/sw.js). Never cached, so phones see a new
        // version right away; its own security policy only lets it reach this site and ESPN's
        // image CDN (player photos and team logos).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; connect-src 'self' https://a.espncdn.com; script-src 'self'",
          },
        ],
      },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
