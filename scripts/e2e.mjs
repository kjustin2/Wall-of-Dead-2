/**
 * Logic playthrough of the rebuilt game, driven through the window.__game hook.
 * Verifies connectivity, the act progression (fuses -> power -> core -> chase ->
 * escape), the cutscene handoffs, the fire-door bash, win, and death paths.
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";

// ?lowfx: the full post stack is too slow under headless SwiftShader and stalls
// the game clock past these timeout-based assertions. lowfx still drives the
// real composer so shader/runtime errors still surface.
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
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"]
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push("console: " + m.text()); });

let failed = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) failed++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** start a run: click DESCEND, skip the intro cutscene, land in playable state */
async function beginRun() {
  await page.goto(URL, { waitUntil: "networkidle0" });
  await page.click("#btn-start");
  await sleep(400);
  // any key skips the (skippable) descent cutscene
  await page.keyboard.press("Space");
  await page
    .waitForFunction(() => window.__game && window.__game.cine && !window.__game.cine.active, { timeout: 15000, polling: 100 })
    .catch(() => {});
  await page.evaluate(() => { window.__game.player.frozen = false; });
}
const idle = () => page.waitForFunction(() => !window.__game.cine.active, { timeout: 30000, polling: 100 }).then(() => true).catch(() => false);

// ---------- run 0: note reader open/close regression ----------
await beginRun();
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 27 * 2 + 1;        // work-order note is at cell (27,13)
  g.player.z = 13 * 2 + 1 + 2;    // 2 m south of it
  g.player.yaw = 0;               // forward = -z = toward the note
  g.player.pitch = 0;
  g.player.lightOn = true;
  g.player.battery = 1;
});
const promptShown = await page
  .waitForFunction(() => /read/i.test(document.getElementById("prompt").textContent || ""), { timeout: 5000, polling: 100 })
  .then(() => true).catch(() => false);
check("note: read prompt offered when aimed at note", promptShown);

await page.keyboard.press("KeyE");
const noteOpened = await page.waitForFunction(() => window.__game.hud.noteOpen, { timeout: 4000 }).then(() => true).catch(() => false);
check("note: E opens the note", noteOpened);

await sleep(250);
await page.keyboard.press("KeyE"); // close
const closed = await page.waitForFunction(() => window.__game.hud.noteOpen === false, { timeout: 5000, polling: 100 }).then(() => true).catch(() => false);
await sleep(300); // ...and it must STAY closed (not close+reopen)
const stayedClosed = closed && (await page.evaluate(() => window.__game.hud.noteOpen === false));
check("note: E closes the note and it stays closed", stayedClosed);
check("note: player is unfrozen after closing", await page.evaluate(() => window.__game.player.frozen === false));

await page.keyboard.press("KeyE");
const reopened = await page.waitForFunction(() => window.__game.hud.noteOpen, { timeout: 4000 }).then(() => true).catch(() => false);
check("note: a fresh E re-opens the note (loop is cyclic)", reopened);
await page.keyboard.press("KeyE");
await sleep(400);
check("note: the second close also sticks", await page.evaluate(() => window.__game.hud.noteOpen === false));

// ---------- run 1: full win path ----------
await beginRun();

// connectivity audit: every key route must be walkable
const routes = await page.evaluate(() => {
  const L = window.__game.level;
  const P = (a, b) => L.findPath(a[0], a[1], b[0], b[1], true) !== null;
  const out = {
    startToFuseA: P([26, 5], [9, 16]),
    startToFuseB: P([26, 5], [47, 24]),
    startToRack: P([26, 5], [46, 4]),
    rackToHatch: P([46, 4], [24, 4]),
    subLevelInternallyWalkable: P([26, 33], [20, 46]),
    // the locked service stair must block the concourse->sublevel shortcut pre-power
    stairLockedPrePower: L.findPath(26, 17, 26, 30, false) === null
  };
  L.door("d_stair").locked = false;
  out.coreToHatchEscape = P([20, 46], [24, 4]);
  L.door("d_stair").locked = true; // restore the gating
  return out;
});
for (const [k, v] of Object.entries(routes)) check(`route: ${k}`, v);

let r = await page.evaluate(() => {
  const g = window.__game;
  g.director.interact({ type: "item", id: "fuse_a" });
  return { fuses: g.director.fuses };
});
check("fuse A picked up", r.fuses === 1);

r = await page.evaluate(() => {
  const g = window.__game;
  g.director.interact({ type: "item", id: "fuse_b" });
  return { fuses: g.director.fuses, stalker: g.stalker.state };
});
check("fuse B picked, stalker wakes", r.fuses === 2 && r.stalker !== "dormant");

// refit at the rack -> power on cutscene -> service stair unlocks, no chase yet
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 46 * 2 + 1;
  g.player.z = 4 * 2 + 1;
  g.director.interact({ type: "item", id: "panel" });
});
const stairUnlocked = await page
  .waitForFunction(() => !window.__game.level.door("d_stair").locked, { timeout: 30000, polling: 100 })
  .then(() => true).catch(() => false);
await idle();
r = await page.evaluate(() => ({ power: window.__game.director.power, chase: window.__game.director.chase, broadcast: window.__game.director.broadcast }));
check("power restored at rack", r.power);
check("service stair unlocked by power", stairUnlocked);
check("no chase / broadcast yet (must reach the core)", r.chase === false && r.broadcast === false);

// descend to the core, restore the broadcast -> chase + escape unlocked
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 20 * 2 + 1;
  g.player.z = 46 * 2 + 1;
  g.director.interact({ type: "item", id: "console" });
});
const chaseOk = await page
  .waitForFunction(() => window.__game.director.chase && window.__game.stalker.finalChase, { timeout: 40000, polling: 100 })
  .then(() => true).catch(() => false);
r = await page.evaluate(() => ({ broadcast: window.__game.director.broadcast, emLit: window.__game.world.lights.get("l_em_conc").on }));
check("broadcast restored at core", r.broadcast);
check("final chase started", chaseOk);
check("emergency escape lights on", r.emLit);
await page.screenshot({ path: `${SHOTS}/e2e-chase.png` });

// slam a fire door in its face and confirm it breaks through
await page.evaluate(() => {
  const g = window.__game;
  const door = g.level.door("d_lobby");
  door.targetOpen = false;
  const [sx, sz] = g.level.cellCenter(26, 15);   // concourse side, behind the door
  g.stalker.setPos(sx, sz);
  g.stalker.startFinalChase();
  g.player.x = 26 * 2 + 1;                        // player up in the shaft head
  g.player.z = 5 * 2 + 1;
});
const bashed = await page
  .waitForFunction(() => window.__game.level.door("d_lobby").broken, { timeout: 40000, polling: 100 })
  .then(() => true).catch(() => false);
check("stalker bashes through closed fire door", bashed);

// ---------- run 1b: reach the hatch and climb out -> escape cutscene -> win ----------
// (isolated run so the live chase from run 1 can't kill the player at the hatch)
await beginRun();
await page.evaluate(() => {
  const g = window.__game;
  g.director.power = true;
  g.director.broadcast = true; // signal already restored; the hatch will release
  g.player.x = 24 * 2 + 1;
  g.player.z = 4 * 2 + 1;
  g.stalker.frozen = true;
  g.stalker.setPos(46 * 2 + 1, 24 * 2 + 1);
  g.director.interact({ type: "item", id: "hatch" });
});
// the escape cutscene runs on game-time; under headless SwiftShader the dt-capped
// clock advances ~3x slower than wall-time, so allow generous real-time headroom.
const won = await page
  .waitForFunction(() => !document.getElementById("win").classList.contains("hidden"), { timeout: 40000, polling: 100 })
  .then(() => true).catch(() => false);
check("win screen shows", won);
await page.screenshot({ path: `${SHOTS}/e2e-win.png` });

// ---------- run 2: death path (while reading a note) ----------
await beginRun();
await page.evaluate(() => {
  const g = window.__game;
  g.player.x = 27 * 2 + 1;
  g.player.z = 13 * 2 + 1 + 2;
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
const died = await page
  .waitForFunction(() => !document.getElementById("dead").classList.contains("hidden"), { timeout: 15000, polling: 100 })
  .then(() => true).catch(() => false);
check("death screen shows on contact", died);
check("note: dismissed when death occurs while reading", await page.evaluate(() => window.__game.hud.noteOpen === false));
await page.screenshot({ path: `${SHOTS}/e2e-dead.png` });

// continuing from the death screen restores play in-place (one-click retry)
await page.evaluate(() => window.__game.continueGame());
const resumed = await page
  .waitForFunction(() => window.__game.director.over === false && window.__game.player.frozen === false, { timeout: 6000, polling: 100 })
  .then(() => true).catch(() => false);
check("save: continue after death resets the game to playable", resumed);

// ---------- run 3: save system ----------
await beginRun(); // NEW GAME clears any save; skipping the intro writes the Arrival checkpoint
check("save: checkpoint written on arrival", await page.evaluate(() => !!localStorage.getItem("deadair.save.v1")));
await page.evaluate(() => window.__game.director.interact({ type: "item", id: "fuse_a" }));
await sleep(250);
const sv = await page.evaluate(() => JSON.parse(localStorage.getItem("deadair.save.v1")));
check("save: fuse A recorded in the checkpoint", !!sv && sv.fuseA === true && sv.fuses === 1);
// restore it and confirm the world reflects the saved progress
await page.evaluate(() => window.__game.continueGame());
await sleep(300);
const restored = await page.evaluate(() => ({
  taken: window.__game.world.items.get("fuse_a").taken,
  fuses: window.__game.director.fuses,
  over: window.__game.director.over,
  hiddenMesh: window.__game.world.items.get("fuse_a").obj.visible === false
}));
check("save: continue restores fuse-A progress", restored.taken && restored.fuses === 1 && restored.over === false && restored.hiddenMesh);
// NEW GAME clears the save
await page.evaluate(() => { window.__game.newGame(); });
await sleep(150);
check("save: NEW GAME clears the save", await page.evaluate(() => !localStorage.getItem("deadair.save.v1")));

await browser.close();
if (errors.length) {
  console.error("page errors:", errors);
  failed++;
}
process.exit(failed ? 1 : 0);
