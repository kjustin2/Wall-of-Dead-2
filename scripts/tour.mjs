/**
 * Visual tour: teleports the player to key spots, screenshots each.
 * Usage: node scripts/tour.mjs [url]
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, existsSync } from "node:fs";

const URL = process.argv[2] ?? "http://localhost:5199";
const SHOTS = new globalThis.URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });

const exe = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: "networkidle0" });
await page.click("#btn-start");
await new Promise((r) => setTimeout(r, 800));
await page.keyboard.press("Space"); // skip the descent cutscene
await page
  .waitForFunction(() => window.__game && window.__game.cine && !window.__game.cine.active, { timeout: 15000, polling: 100 })
  .catch(() => {});
await page.evaluate(() => { window.__game.player.frozen = false; });

const spots = [
  { name: "shaft", cx: 26, cy: 5, yaw: 3.14, torch: false },        // arrival: lift cage + exit
  { name: "concourse", cx: 26, cy: 13, yaw: 3.14, torch: true },    // entering the hub
  { name: "concourse-lit", cx: 26, cy: 17, yaw: 0, torch: false },  // hub signage / wayfinding
  { name: "maintenance", cx: 8, cy: 17, yaw: 1.6, torch: true },    // fuse A wing
  { name: "platform-stalker", cx: 44, cy: 18, yaw: -2.74, torch: true }, // first sighting view
  { name: "platform-north", cx: 42, cy: 14, yaw: 0, torch: false }, // cold blue platform
  { name: "genroom", cx: 43, cy: 5, yaw: -1.57, torch: true },      // breaker rack
  { name: "stairwell", cx: 26, cy: 28, yaw: 1.57, torch: true },    // service stair
  { name: "subhall", cx: 23, cy: 39, yaw: 0, torch: true },         // intake archive — facing the wall of faces
  { name: "core", cx: 20, cy: 46, yaw: 3.14, torch: true }          // repeater core
];

const place = (spot) =>
  page.evaluate((s) => {
    const g = window.__game;
    g.player.frozen = false;
    g.player.x = s.cx * 2 + 1;
    g.player.z = s.cy * 2 + 1;
    g.player.yaw = s.yaw;
    g.player.pitch = 0;
    g.player.lightOn = s.torch;
    g.player.battery = 1;
  }, spot);

for (const s of spots) {
  await place(s);
  await new Promise((r) => setTimeout(r, 300));
  // entering a zone may have started a cutscene (e.g. the platform reveal); skip
  // it and re-place so each shot is a clean, player-driven view of the location.
  if (await page.evaluate(() => window.__game.cine.active)) {
    await page.keyboard.press("Space");
    await page.waitForFunction(() => !window.__game.cine.active, { timeout: 15000, polling: 100 }).catch(() => {});
    await place(s);
  }
  await new Promise((r) => setTimeout(r, 450));
  await page.screenshot({ path: `${SHOTS}/tour-${s.name}.png` });
}

if (errors.length) {
  console.error("tour errors:", errors);
  process.exit(1);
}
console.log("tour ok");
await browser.close();
