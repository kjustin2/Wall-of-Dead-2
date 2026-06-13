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
await new Promise((r) => setTimeout(r, 2600));

const spots = [
  { name: "stairwell", cx: 19, cy: 29, yaw: 0, torch: true },
  { name: "concourse", cx: 19, cy: 21, yaw: 0, torch: true },
  { name: "concourse-lit", cx: 19, cy: 18, yaw: 0.8, torch: false },
  { name: "office", cx: 8, cy: 17, yaw: 1.6, torch: true },
  { name: "platform-stalker", cx: 38, cy: 22, yaw: -2.45, torch: true },
  { name: "platform-north", cx: 38, cy: 19, yaw: 0, torch: false },
  { name: "genroom", cx: 39, cy: 4, yaw: -1.57, torch: true },
  { name: "corridor", cx: 30, cy: 3, yaw: 1.57, torch: true }
];

for (const s of spots) {
  await page.evaluate((spot) => {
    const g = window.__game;
    g.player.x = spot.cx * 2 + 1;
    g.player.z = spot.cy * 2 + 1;
    g.player.yaw = spot.yaw;
    g.player.pitch = 0;
    g.player.lightOn = spot.torch;
    g.player.battery = 1;
  }, s);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `${SHOTS}/tour-${s.name}.png` });
}

if (errors.length) {
  console.error("tour errors:", errors);
  process.exit(1);
}
console.log("tour ok");
await browser.close();
