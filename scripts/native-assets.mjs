#!/usr/bin/env node
/**
 * Makes the native app's icon and splash SOURCE images in assets/ from the current logo files,
 * so the iOS and Android apps look exactly like the website's installed app:
 *
 *   assets/icon-only.png        1024×1024  the app icon (a copy of public/brand/icon-1024.png)
 *   assets/icon-foreground.png  1024×1024  Android's layered icon: the mark on transparent
 *   assets/icon-background.png  1024×1024  Android's layered icon: the icon's background colour
 *   assets/splash.png           2732×2732  launch screen: the mark on black (like public/splash/)
 *   assets/splash-dark.png      2732×2732  the same, for dark mode
 *
 * Then `npx @capacitor/assets@3.0.5 generate` turns those five files into every size iOS and
 * Android need. To change the app's look later, replace the five PNGs in assets/ (or the logo in
 * public/brand/ and run this again) and run that command; docs/SETUP.md part 6 has the steps.
 *
 * Needs playwright-core and a Chromium (same as lib/pwa/generate-splash.mjs):
 *   PLAYWRIGHT_CORE=/path/to/playwright-core CHROME_PATH=/path/to/chrome node scripts/native-assets.mjs
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets");

// The navy behind the mark in public/brand/icon-1024.png and the maskable icons.
const ICON_BACKGROUND = "#14161e";
// Android shows 72 of the icon's 108 dp; the mark fills the same share of that as in the
// maskable web icon (public/icon-maskable-512.png: 35% of the icon), so it looks the same size.
const FOREGROUND_MARK_SHARE = 0.354 * (72 / 108);
// On a phone the 2732 square is scaled to the screen's height (about 0.94 on an iPhone), and the
// web launch images draw the mark at 30% of the screen width: about 380 px here.
const SPLASH_MARK_PX = 380;

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const id of [process.env.PLAYWRIGHT_CORE, "playwright-core", "playwright"].filter(Boolean)) {
    try {
      return require(id);
    } catch {
      // try the next one
    }
  }
  throw new Error("playwright-core not found. Install it or set PLAYWRIGHT_CORE=/path/to/playwright-core.");
}

const mark = await readFile(path.join(root, "public/brand/mark.svg"), "utf8");
const page = (size, markWidth, background) => `<!doctype html><html><head><style>
  html, body { margin: 0; width: ${size}px; height: ${size}px; background: ${background}; }
  body { display: flex; align-items: center; justify-content: center; }
  .mark { width: ${markWidth}px; } .mark svg { display: block; width: 100%; height: auto; }
</style></head><body><div class="mark">${mark}</div></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
async function render(file, size, markWidth, background, transparent = false) {
  const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const tab = await context.newPage();
  await tab.setContent(page(size, markWidth, background));
  await tab.screenshot({ path: path.join(out, file), omitBackground: transparent });
  await context.close();
  console.log("wrote assets/" + file);
}

await mkdir(out, { recursive: true });
await copyFile(path.join(root, "public/brand/icon-1024.png"), path.join(out, "icon-only.png"));
console.log("wrote assets/icon-only.png");
await render("icon-foreground.png", 1024, Math.round(1024 * FOREGROUND_MARK_SHARE), "transparent", true);
await render("icon-background.png", 1024, 0, ICON_BACKGROUND);
await render("splash.png", 2732, SPLASH_MARK_PX, "#000000");
await render("splash-dark.png", 2732, SPLASH_MARK_PX, "#000000");
await browser.close();
