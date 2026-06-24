/** close-range checks: dormant stalker reveal, chase pose, kill-cam */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:5199";
const SHOTS = new globalThis.URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });
const exe = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "shell", // old headless: renders the same but never steals window focus (see agent/lib.mjs)
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle0" });
await page.click("#btn-start");
await new Promise((r) => setTimeout(r, 2000));

// 1. dormant creature beside fuse B, torch on, ~5m away
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 81;
  g.player.z = 57;
  g.player.yaw = -Math.PI / 2; // face east
  g.player.pitch = -0.05;
  g.player.lightOn = true;
  g.player.battery = 1;
});
// screenshot before the platform-entry beat (0.8s) wakes it
await new Promise((r) => setTimeout(r, 450));
await page.screenshot({ path: `${SHOTS}/close-dormant.png` });

// 2. chasing toward the player down the platform, eyes on
await page.evaluate(() => {
  const g = window.__game;
  g.stalker.activate();
  g.stalker.startFinalChase();
  g.stalker.setPos(g.player.x + 7, g.player.z);
});
await new Promise((r) => setTimeout(r, 1100));
await page.screenshot({ path: `${SHOTS}/close-chase.png` });

// 3. kill-cam (a moment after contact)
await page.evaluate(() => {
  const g = window.__game;
  g.stalker.setPos(g.player.x + 1.2, g.player.z);
});
await new Promise((r) => setTimeout(r, 900));
await page.screenshot({ path: `${SHOTS}/close-kill.png` });

if (errors.length) {
  console.error("errors:", errors);
  process.exit(1);
}
console.log("closeup ok");
await browser.close();
