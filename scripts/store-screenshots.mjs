#!/usr/bin/env node
/**
 * Retakes the install-dialog screenshots listed in app/manifest.ts (public/screenshots/) from a
 * running production build, as the installed app, with a real roster: the most-rostered healthy
 * players at each position from /api/players, so every number is real ESPN data.
 *
 *   npx next build && npx next start -p 3510      (in another terminal)
 *   node scripts/store-screenshots.mjs --base http://localhost:3510
 *
 * Needs playwright-core and Chromium (see scripts/test-pwa.mjs for PLAYWRIGHT_CORE / CHROME_PATH).
 * Times are shown in US Eastern.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const baseAt = args.indexOf("--base");
const base = baseAt >= 0 && args[baseAt + 1] ? args[baseAt + 1] : "http://localhost:3510";
const out = path.join(root, "public", "screenshots");

const require = createRequire(import.meta.url);
const { chromium } = [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"]
  .filter(Boolean)
  .map((id) => {
    try {
      return require(id);
    } catch {
      return null;
    }
  })
  .find(Boolean) ?? (() => {
  throw new Error("playwright-core not found. Install it or set PLAYWRIGHT_CORE=/path/to/playwright-core.");
})();

const { players } = await (await fetch(`${base}/api/players`)).json();
const slotsFor = { QB: ["QB"], RB: ["RB", "RB", "FLEX"], WR: ["WR", "WR", "BENCH"], TE: ["TE"], K: ["K"], DST: ["DST"] };
const taken = {};
const roster = {
  version: 1,
  name: "Sunday Scaries",
  format: "ppr",
  updatedAt: new Date().toISOString(),
  players: players
    .filter((p) => !p.injuryStatus || p.injuryStatus === "ACTIVE")
    .flatMap((p) => {
      const slots = slotsFor[p.position];
      const i = taken[p.position] ?? 0;
      if (!slots || i >= slots.length) return [];
      taken[p.position] = i + 1;
      return [{ playerId: p.id, name: p.name, position: p.position, teamId: p.teamId ?? null, headshot: p.headshot ?? null, slot: slots[i] }];
    }),
};

const shots = [
  { file: "home-phone.png", path: "/", viewport: { width: 390, height: 844 }, scale: 2, phone: true },
  { file: "lineup-phone.png", path: "/team", viewport: { width: 390, height: 844 }, scale: 2, phone: true },
  { file: "startsit-phone.png", path: "/start-sit", viewport: { width: 390, height: 844 }, scale: 2, phone: true },
  { file: "home-wide.png", path: "/", viewport: { width: 1440, height: 900 }, scale: 1, phone: false },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: "localhost,127.0.0.1" } : undefined,
});
for (const shot of shots) {
  const context = await browser.newContext({
    viewport: shot.viewport,
    deviceScaleFactor: shot.scale,
    isMobile: shot.phone,
    hasTouch: shot.phone,
    timezoneId: "America/New_York",
    locale: "en-US",
  });
  await context.addInitScript((team) => {
    localStorage.setItem("fantasylab:roster", JSON.stringify(team));
    // Look like the installed app (no install card, no browser bars).
    Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
  }, roster);
  const page = await context.newPage();
  await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(3500); // entrance animations and number rolls finish
  await page.screenshot({ path: path.join(out, shot.file) });
  console.log(`saved public/screenshots/${shot.file}`);
  await context.close();
}
await browser.close();
