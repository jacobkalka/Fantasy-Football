import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // How long shared server copies of ESPN data stay fresh (seconds). See lib/data/sports.ts.
  cacheLife: {
    // Live scores and plays: refetched from ESPN at most every 5 seconds, shared by every visitor.
    live: { stale: 30, revalidate: 5, expire: 120 },
    // Finished games don't change (except rare stat corrections).
    final: { stale: 300, revalidate: 1800, expire: 86400 },
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
