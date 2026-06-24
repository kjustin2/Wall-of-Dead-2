/**
 * One-off: launch the game under a given headless mode + window flags and
 * screenshot it, so we can confirm WebGL still renders (not a black frame)
 * before changing the harness launch config. Usage:
 *   node agent/headless-ab.mjs new      -> shot-new.png   (--headless=new)
 *   node agent/headless-ab.mjs shell    -> shot-shell.png (old/shell headless)
 *   node agent/headless-ab.mjs offnew   -> shot-offnew.png(--headless=new + off-screen)
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { join } from "node:path";

const MODE = process.argv[2] || "new";
const URL = "http://localhost:5173?lowfx";
const EDGE = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
              "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"].find(existsSync);

const baseArgs = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                  "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"];
const offscreen = ["--window-position=-2400,-2400"];

const cfg = {
  new:    { headless: "new",  args: baseArgs },
  shell:  { headless: "shell", args: baseArgs },
  offnew: { headless: "new",  args: [...baseArgs, ...offscreen] },
}[MODE];

const browser = await puppeteer.launch({ executablePath: EDGE, ...cfg });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
await page.click("#btn-start");
await new Promise((r) => setTimeout(r, 600));
await page.keyboard.press("Space");
await page.waitForFunction(() => window.__game && !window.__game.cine.active, { timeout: 30000, polling: 100 }).catch(() => {});
await page.evaluate(() => { window.__game.player.frozen = false; window.__game.player.lightOn = true; });
await new Promise((r) => setTimeout(r, 1500));

const out = join("scripts", "shots", `shot-${MODE}.png`);
const buf = await page.screenshot({ path: out });
// crude brightness: average of every 997th byte of the raw PNG is meaningless,
// so instead read pixel stats via the page canvas.
const lum = await page.evaluate(() => {
  const c = document.querySelector("canvas");
  if (!c) return -1;
  const g = c.getContext("webgl2") || c.getContext("webgl");
  // can't easily read default framebuffer; sample via 2d copy
  const t = document.createElement("canvas"); t.width = 64; t.height = 36;
  const ctx = t.getContext("2d"); ctx.drawImage(c, 0, 0, 64, 36);
  const d = ctx.getImageData(0, 0, 64, 36).data;
  let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i+1] + d[i+2]) / 3;
  return s / (d.length / 4);
});
console.log(`mode=${MODE} screenshot=${out} bytes=${buf.length} avgLuma(0-255)=${lum.toFixed(1)}`);
await browser.close();
