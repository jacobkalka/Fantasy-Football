#!/usr/bin/env node
/**
 * Draws the iPhone/iPad launch ("splash") images into public/splash/: the FantasyLab mark
 * centered on black, at the exact pixel size of every screen in lib/pwa/splash-devices.json,
 * portrait and landscape. lib/pwa/metadata.ts lists the same files for the <head>.
 *
 * Run it again after changing the logo (public/brand/mark.svg) or the device list:
 *
 *   node lib/pwa/generate-splash.mjs
 *
 * Needs playwright-core and a Chromium. If they aren't installed in this project, point at them:
 *   PLAYWRIGHT_CORE=/path/to/node_modules/playwright-core CHROME_PATH=/path/to/chrome node lib/pwa/generate-splash.mjs
 */
import { mkdir, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = path.join(root, "public/splash");
const BACKGROUND = "#000000"; // Same as PWA_BACKGROUND_COLOR in lib/pwa/metadata.ts.

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const candidates = [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean);
  for (const id of candidates) {
    try {
      return require(id);
    } catch {
      // try the next one
    }
  }
  throw new Error("playwright-core not found. Install it or set PLAYWRIGHT_CORE=/path/to/playwright-core.");
}

/** Reads width and height from a PNG header. */
async function pngSize(file) {
  const buffer = await readFile(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const devices = JSON.parse(await readFile(path.join(root, "lib/pwa/splash-devices.json"), "utf8"));
const mark = await readFile(path.join(root, "public/brand/mark.svg"), "utf8");
const html = `<!doctype html><html><head><style>
  html, body { margin: 0; height: 100%; background: ${BACKGROUND}; overflow: hidden; }
  body { display: grid; place-items: center; }
  .mark { width: min(30vmin, 168px); }
  .mark svg { display: block; width: 100%; height: auto; }
</style></head><body><div class="mark">${mark}</div></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });

await mkdir(outDir, { recursive: true });
for (const file of await readdir(outDir)) {
  if (file.startsWith("apple-splash-") && file.endsWith(".png")) await rm(path.join(outDir, file));
}

let count = 0;
for (const device of devices) {
  const context = await browser.newContext({ deviceScaleFactor: device.ratio });
  const page = await context.newPage();
  for (const orientation of ["portrait", "landscape"]) {
    const width = orientation === "portrait" ? device.width : device.height;
    const height = orientation === "portrait" ? device.height : device.width;
    await page.setViewportSize({ width, height });
    await page.setContent(html);
    const pixelWidth = width * device.ratio;
    const pixelHeight = height * device.ratio;
    const file = path.join(outDir, `apple-splash-${pixelWidth}x${pixelHeight}.png`);
    await page.screenshot({ path: file, type: "png" });
    const size = await pngSize(file);
    if (size.width !== pixelWidth || size.height !== pixelHeight) {
      throw new Error(`${file} is ${size.width}x${size.height}, expected ${pixelWidth}x${pixelHeight}`);
    }
    count += 1;
  }
  await context.close();
}
await browser.close();
console.log(`Wrote ${count} splash images to ${path.relative(root, outDir)}/`);
