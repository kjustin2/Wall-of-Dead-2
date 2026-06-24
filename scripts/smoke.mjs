/**
 * Boots the game in headless Edge via puppeteer-core, plays a few seconds,
 * captures screenshots to scripts/shots/, and fails on console/page errors.
 * Requires the dev server (or `vite preview`) running; pass URL as argv[2].
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";

// Default to ?lowfx: the full post stack (GTAO/SMAA) is too slow under headless
// SwiftShader and stalls the game clock. lowfx still drives the real composer
// (RenderPass→bloom→output→FXAA→grade→film) so shader/runtime errors surface.
const base = process.argv[2] ?? "http://localhost:5173";
const URL = base.includes("?") ? base : base + "?lowfx";
const SHOTS = new globalThis.URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];
const exe = EDGE_PATHS.find((p) => existsSync(p));
if (!exe) {
  console.error("Edge not found");
  process.exit(1);
}

const errors = [];
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "shell", // old headless: renders the same but never steals window focus (see agent/lib.mjs)
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("favicon")) errors.push(`console: ${msg.text()}`);
});
page.on("response", (r) => {
  if (r.status() >= 400 && !r.url().includes("favicon")) errors.push(`http ${r.status()}: ${r.url()}`);
});
page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

await page.goto(URL, { waitUntil: "networkidle0", timeout: 30000 });
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: `${SHOTS}/1-title.png` });

await page.click("#btn-start");
// the descent cutscene plays first; capture it, then skip into playable state
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: `${SHOTS}/2-intro.png` });
await page.keyboard.press("Space");
await page
  .waitForFunction(() => window.__game && window.__game.cine && !window.__game.cine.active, { timeout: 15000, polling: 100 })
  .catch(() => {});
await page.evaluate(() => { window.__game.player.frozen = false; });
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${SHOTS}/2-start.png` });

// torch on, walk forward through the stairwell door area
await page.keyboard.down("KeyF");
await page.keyboard.up("KeyF");
await new Promise((r) => setTimeout(r, 400));
await page.screenshot({ path: `${SHOTS}/3-torch.png` });

await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 1800));
await page.keyboard.up("KeyW");
await page.keyboard.down("KeyE"); // open the stairwell door if prompted
await page.keyboard.up("KeyE");
await new Promise((r) => setTimeout(r, 600));
await page.keyboard.down("KeyW");
await new Promise((r) => setTimeout(r, 2200));
await page.keyboard.up("KeyW");
await page.screenshot({ path: `${SHOTS}/4-walk.png` });

// dump some game state for sanity
const state = await page.evaluate(() => {
  const hud = document.getElementById("objective")?.textContent;
  return { objective: hud, blackout: document.getElementById("blackout")?.style.opacity };
});
console.log("state:", JSON.stringify(state));

await browser.close();

if (errors.length) {
  console.error("SMOKE FAILURES:");
  for (const e of errors) console.error(" -", e);
  process.exit(1);
}
console.log("smoke ok — screenshots in scripts/shots/");
