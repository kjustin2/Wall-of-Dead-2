/**
 * Logic playthrough: drives the game via the window.__game hook.
 * Verifies fuse pickups, power-on, final chase, win, and death.
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

// Default to ?lowfx: the full post stack (GTAO/SMAA) is too slow under headless
// SwiftShader and stalls the game clock past these timeout-based assertions.
// lowfx still drives the real composer so shader/runtime errors still surface.
const base = process.argv[2] ?? "http://localhost:5199";
const URL = base.includes("?") ? base : base + "?lowfx";
const SHOTS = new globalThis.URL("./shots/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
mkdirSync(SHOTS, { recursive: true });

const exe = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
].find((p) => existsSync(p));

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- run 0: note reader open/close (regression for "E won't close note") ----------
// Driven by REAL key presses through the game loop — the bug was loop-ordering
// (the closing E being consumed a second time and re-opening the note), which
// calling director.interact() directly would not reproduce.
await page.goto(URL, { waitUntil: "networkidle0" });
await page.click("#btn-start");
await sleep(1200);

// stand 2m south of the work-order note (cell 20,28), facing north toward it
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 20 * 2 + 1;
  g.player.z = 28 * 2 + 1 + 2;
  g.player.yaw = 0; // forward = -z = toward the note
  g.player.pitch = 0;
  g.player.lightOn = true;
  g.player.battery = 1;
});
// poll (like every other check here) rather than snapshot a fixed 200ms later —
// the prompt only updates on a played frame, which is racy under slow headless GL
const promptShown = await page
  .waitForFunction(() => /read/i.test(document.getElementById("prompt").textContent || ""), { timeout: 5000, polling: 100 })
  .then(() => true)
  .catch(() => false);
check("note: read prompt offered when aimed at note", promptShown);

await page.keyboard.press("KeyE");
const noteOpened = await page
  .waitForFunction(() => window.__game.hud.noteOpen, { timeout: 4000 })
  .then(() => true)
  .catch(() => false);
check("note: E opens the note", noteOpened);

await sleep(250);
await page.keyboard.press("KeyE"); // close — must STAY closed (not close+reopen)
await sleep(450);
const afterClose = await page.evaluate(() => ({
  noteOpen: window.__game.hud.noteOpen,
  frozen: window.__game.player.frozen
}));
check("note: E closes the note and it stays closed", afterClose.noteOpen === false);
check("note: player is unfrozen after closing", afterClose.frozen === false);

// the loop is fully cyclic: a fresh E re-opens the note. (Movement is gated
// solely on player.frozen, already asserted false above, so this + the
// unfrozen check together prove the game is playable again — deterministically,
// without depending on a real W keypress landing in headless.)
await page.keyboard.press("KeyE");
const reopened = await page
  .waitForFunction(() => window.__game.hud.noteOpen, { timeout: 4000 })
  .then(() => true)
  .catch(() => false);
check("note: a fresh E re-opens the note (loop is cyclic)", reopened);
await page.keyboard.press("KeyE");
await sleep(400);
const reclosed = await page.evaluate(() => window.__game.hud.noteOpen === false);
check("note: the second close also sticks", reclosed);

// ---------- run 1: full win path ----------
await page.goto(URL, { waitUntil: "networkidle0" });
await page.click("#btn-start");
await sleep(1500);

// world connectivity audit: every key route must be walkable
const routes = await page.evaluate(() => {
  const L = window.__game.level;
  const P = (a, b) => L.findPath(a[0], a[1], b[0], b[1], true) !== null;
  const out = {
    startToFuseA: P([19, 29], [4, 15]),
    startToFuseB: P([19, 29], [43, 29]),
    startToPanel: P([19, 29], [43, 4]),
    panelToHatch: P([43, 4], [3, 2]),
    subStairToCore: P([19, 32], [15, 45]), // Act III sub-level is internally walkable
    concourseToCorridorBlockedPrePower: !L.findPath(19, 18, 19, 8, false) ||
      L.findPath(19, 18, 19, 8, false).length > 25 // locked d_north must not be the shortcut
  };
  // with the gated doors released, the full escape from the core must connect
  L.door("d_service").locked = false;
  L.door("d_north").locked = false;
  out.coreToHatchEscape = P([15, 45], [3, 2]);
  L.door("d_service").locked = true; // restore so the run still exercises the gating
  L.door("d_north").locked = true;
  return out;
});
for (const [k, v] of Object.entries(routes)) check(`route: ${k}`, v);

let r = await page.evaluate(() => {
  const g = window.__game;
  g.director.interact({ type: "item", id: "fuse_a" });
  return { fuses: g.director.fuses, stalker: g.stalker.state };
});
check("fuse A picked, stalker wakes", r.fuses === 1 && r.stalker !== "dormant");

r = await page.evaluate(() => {
  const g = window.__game;
  g.director.interact({ type: "item", id: "fuse_b" });
  return { fuses: g.director.fuses };
});
check("fuse B picked", r.fuses === 2);

// refit the fuses at the panel -> power comes up, the service stair unlocks,
// but the broadcast is dead and there is NO chase yet
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 43 * 2 + 1;
  g.player.z = 4 * 2 + 1;
  g.director.interact({ type: "item", id: "panel" });
});
// powerOn unlocks the service stair in a ~0.9s delayed beat — poll for it
const serviceUnlocked = await page
  .waitForFunction(() => !window.__game.level.door("d_service").locked, { timeout: 20000, polling: 100 })
  .then(() => true)
  .catch(() => false);
r = await page.evaluate(() => {
  const g = window.__game;
  return { power: g.director.power, chase: g.director.chase, broadcast: g.director.broadcast };
});
check("power restored at panel", r.power);
check("service stair unlocked by power", serviceUnlocked);
check("no chase / broadcast yet (must go to the core)", r.chase === false && r.broadcast === false);

// descend to the repeater core and restore the broadcast -> chase + escape unlock
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 15 * 2 + 1;
  g.player.z = 45 * 2 + 1;
  g.director.interact({ type: "item", id: "console" });
});
// game time can run slower than wall time in headless; poll
const chaseOk = await page
  .waitForFunction(() => window.__game.director.chase && window.__game.stalker.finalChase, { timeout: 40000, polling: 100 })
  .then(() => true)
  .catch(() => false);
r = await page.evaluate(() => {
  const g = window.__game;
  return {
    broadcast: g.director.broadcast,
    northUnlocked: !g.level.door("d_north").locked,
    corridorLit: g.world.lights.get("l_corr_a").on
  };
});
check("broadcast restored at core", r.broadcast);
check("final chase started", chaseOk);
check("escape route unlocked + lit", r.northUnlocked && r.corridorLit);
await page.screenshot({ path: `${SHOTS}/e2e-chase.png` });

// slam a fire door in its face and confirm it breaks through
await page.evaluate(() => {
  const g = window.__game;
  const door = g.level.door("f3");
  door.targetOpen = false;
  // put the stalker right behind it, hunting the player beyond it
  const [sx, sz] = g.level.cellCenter(31, 3);
  g.stalker.setPos(sx, sz);
  g.player.x = 2 * 25 + 1;
  g.player.z = 2 * 3 + 1;
});
r = await page
  .waitForFunction(() => window.__game.level.door("f3").broken, { timeout: 40000 })
  .then(() => true)
  .catch(() => false);
check("stalker bashes through closed fire door", r);

await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 3 * 2 + 1;
  g.player.z = 3 * 2 + 1;
  // keep it away so it can't kill us at the hatch
  g.stalker.setPos(2 * 35 + 1, 2 * 3 + 1);
  g.director.interact({ type: "item", id: "hatch" });
});
r = await page
  .waitForFunction(() => !document.getElementById("win").classList.contains("hidden"), { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check("win screen shows", r);
await page.screenshot({ path: `${SHOTS}/e2e-win.png` });

// ---------- run 2: death path (while reading a note) ----------
await page.goto(URL, { waitUntil: "networkidle0" });
await page.click("#btn-start");
await sleep(1200);
// open a note, then get killed mid-read
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 20 * 2 + 1;
  g.player.z = 28 * 2 + 1 + 2;
  g.player.yaw = 0;
  g.player.pitch = 0;
});
await sleep(150);
await page.keyboard.press("KeyE");
await page.waitForFunction(() => window.__game.hud.noteOpen, { timeout: 4000 }).catch(() => {});
await page.evaluate(() => {
  const g = window.__game;
  g.stalker.activate();
  g.stalker.setPos(g.player.x + 0.4, g.player.z);
});
r = await page
  .waitForFunction(() => !document.getElementById("dead").classList.contains("hidden"), { timeout: 15000 })
  .then(() => true)
  .catch(() => false);
check("death screen shows on contact", r);
const noteClosedOnDeath = await page.evaluate(() => window.__game.hud.noteOpen === false);
check("note: dismissed when death occurs while reading", noteClosedOnDeath);
await page.screenshot({ path: `${SHOTS}/e2e-dead.png` });

await browser.close();
if (errors.length) {
  console.error("page errors:", errors);
  failed++;
}
process.exit(failed ? 1 : 0);
