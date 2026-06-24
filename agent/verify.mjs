/**
 * VERIFY — the logical gate. Drives scripted play-throughs through window.__game
 * and asserts in-game values/state transitions, grouped into named checks that
 * map 1:1 to the `logic.check` ids in goals.json. Writes <out>/results.json.
 * Mirrors the proven flow in scripts/e2e.mjs (same coordinates/waits).
 *
 *   node agent/verify.mjs --url http://localhost:5173 --out agent/runs/manual
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle, beginRun } from "./lib.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const URL = arg("url", DEFAULT_URL);
const OUT = arg("out", join(ROOT, "agent", "runs", "manual"));
mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch();
const checks = {};
function check(id, name, ok) {
  (checks[id] ??= { assertions: [], pass: true });
  checks[id].assertions.push({ name, ok: !!ok });
  if (!ok) checks[id].pass = false;
  console.log(`  ${ok ? "PASS" : "FAIL"}  [${id}] ${name}`);
}
const waitTrue = (fn, ms = 30000) =>
  page.waitForFunction(fn, { timeout: ms, polling: 100 }).then(() => true).catch(() => false);

try {
  // ========== run 1: connectivity + progression ==========
  await beginRun(page, URL);

  const routes = await page.evaluate(() => {
    const L = window.__game.level;
    const P = (a, b) => L.findPath(a[0], a[1], b[0], b[1], true) !== null;
    const out = {
      startToFuseA: P([26, 5], [9, 16]),
      startToFuseB: P([26, 5], [47, 24]),
      startToRack: P([26, 5], [46, 4]),
      rackToHatch: P([46, 4], [24, 4]),
      subLevelWalkable: P([26, 33], [20, 46]),
      stairLockedPrePower: L.findPath(26, 17, 26, 30, false) === null
    };
    L.door("d_stair").locked = false;
    out.coreToHatchEscape = P([20, 46], [24, 4]);
    L.door("d_stair").locked = true;
    return out;
  });
  for (const [k, v] of Object.entries(routes)) check("connectivity", `route ${k}`, v);

  let r = await page.evaluate(() => {
    window.__game.director.interact({ type: "item", id: "fuse_a" });
    return { fuses: window.__game.director.fuses };
  });
  check("fuseProgression", "fuse A picked up (fuses=1)", r.fuses === 1);

  r = await page.evaluate(() => {
    const g = window.__game;
    g.director.interact({ type: "item", id: "fuse_b" });
    return { fuses: g.director.fuses, stalker: g.stalker.state };
  });
  check("fuseProgression", "fuse B picked, stalker wakes", r.fuses === 2 && r.stalker !== "dormant");

  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 46 * 2 + 1;
    g.player.z = 4 * 2 + 1;
    g.director.interact({ type: "item", id: "panel" });
  });
  const stairUnlocked = await waitTrue(() => !window.__game.level.door("d_stair").locked);
  await idle(page);
  r = await page.evaluate(() => ({ power: window.__game.director.power, chase: window.__game.director.chase, broadcast: window.__game.director.broadcast }));
  check("powerFlow", "power restored at rack", r.power);
  check("powerFlow", "service stair unlocked by power", stairUnlocked);
  check("powerFlow", "no premature chase/broadcast", r.chase === false && r.broadcast === false);

  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 20 * 2 + 1;
    g.player.z = 46 * 2 + 1;
    g.director.interact({ type: "item", id: "console" });
  });
  const chaseOk = await waitTrue(() => window.__game.director.chase && window.__game.stalker.finalChase, 40000);
  r = await page.evaluate(() => ({ broadcast: window.__game.director.broadcast, emLit: window.__game.world.lights.get("l_em_conc").on }));
  check("broadcastChase", "broadcast restored at core", r.broadcast);
  check("broadcastChase", "final chase started", chaseOk);
  check("broadcastChase", "emergency escape lights on", r.emLit);

  await page.evaluate(() => {
    const g = window.__game;
    g.level.door("d_lobby").targetOpen = false;
    const [sx, sz] = g.level.cellCenter(26, 15);
    g.stalker.setPos(sx, sz);
    g.stalker.startFinalChase();
    g.player.x = 26 * 2 + 1;
    g.player.z = 5 * 2 + 1;
  });
  const bashed = await waitTrue(() => window.__game.level.door("d_lobby").broken, 40000);
  check("fireDoorBash", "stalker bashes through closed fire door", bashed);

  // ========== run 2: escape -> win ==========
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.director.power = true;
    g.director.broadcast = true;
    g.player.x = 24 * 2 + 1;
    g.player.z = 4 * 2 + 1;
    g.stalker.frozen = true;
    g.stalker.setPos(46 * 2 + 1, 24 * 2 + 1);
    g.director.interact({ type: "item", id: "hatch" });
  });
  const won = await waitTrue(() => !document.getElementById("win").classList.contains("hidden"), 60000);
  check("escapeWin", "win screen shows after hatch", won);

  // ========== run 3: death while reading a note ==========
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 27 * 2 + 1;
    g.player.z = 13 * 2 + 1 + 2;
    g.player.yaw = 0;
    g.player.pitch = 0;
  });
  await sleep(150);
  await page.keyboard.press("KeyE");
  await waitTrue(() => window.__game.hud.noteOpen, 4000);
  await page.evaluate(() => {
    const g = window.__game;
    g.stalker.activate();
    g.stalker.setPos(g.player.x + 0.4, g.player.z);
  });
  const died = await waitTrue(() => !document.getElementById("dead").classList.contains("hidden"), 15000);
  check("deathPath", "death screen shows on contact", died);
  check("deathPath", "note dismissed on death", await page.evaluate(() => window.__game.hud.noteOpen === false));

  // ========== run 4: save / restore / clear ==========
  await beginRun(page, URL); // NEW GAME clears; skipping the intro writes the arrival checkpoint
  check("saveResume", "checkpoint written on arrival", await page.evaluate(() => !!localStorage.getItem("deadair.save.v1")));
  await page.evaluate(() => window.__game.director.interact({ type: "item", id: "fuse_a" }));
  await sleep(250);
  const sv = await page.evaluate(() => JSON.parse(localStorage.getItem("deadair.save.v1")));
  check("saveResume", "fuse A recorded in checkpoint", !!sv && sv.fuseA === true && sv.fuses === 1);
  await page.evaluate(() => window.__game.continueGame());
  await sleep(300);
  const restored = await page.evaluate(() => ({
    taken: window.__game.world.items.get("fuse_a").taken,
    fuses: window.__game.director.fuses,
    over: window.__game.director.over
  }));
  check("saveResume", "continue restores fuse-A progress", restored.taken && restored.fuses === 1 && restored.over === false);
  await page.evaluate(() => window.__game.newGame());
  await sleep(150);
  check("saveResume", "NEW GAME clears the save", await page.evaluate(() => !localStorage.getItem("deadair.save.v1")));

  // ========== run 5: sub-level palette + cutscene-toast suppression ==========
  await beginRun(page, URL);
  const palette = await page.evaluate(() => {
    const g = window.__game;
    return ["l_intake_a", "l_intake_b", "l_core", "l_pump"].map((id) => {
      const h = g.world.lights.get(id);
      return { id, on: h.on, base: h.base, r: h.light.color.r, g: h.light.color.g };
    });
  });
  for (const l of palette) check("sublevelPalette", `${l.id} grey-green (g>=r) & lit`, l.on && l.base > 0 && l.g >= l.r);

  const toastShown = await page.evaluate(() => {
    const g = window.__game;
    g.hud.letterbox(true);
    g.hud.toast("checkpoint test");
    const shown = document.getElementById("toast").classList.contains("show");
    g.hud.letterbox(false);
    return shown;
  });
  check("toastSuppressedInCutscene", "toast hidden while letterbox is on", toastShown === false);

  // ========== run 6: monster pacing — hidden at start, sighting gated ==========
  await beginRun(page, URL);
  const start = await page.evaluate(() => ({ state: window.__game.stalker.state, z: window.__game.stalker.z }));
  check("monsterPacing", "creature dormant + hidden (sub-level) at start", start.state === "dormant" && start.z > 80);
  await page.evaluate(() => {
    const g = window.__game;
    g.director.armSighting();              // build-up done
    g.player.x = 44 * 2 + 1; g.player.z = 20 * 2 + 1; g.player.frozen = false; // step onto the platform
  });
  const fired = await waitTrue(() => window.__game.stalker.z < 70, 10000); // it comes up for the reveal
  check("monsterPacing", "armed platform entry triggers the first sighting", fired);

  // ========== run 7: exit to menu -> resume from last checkpoint ==========
  await beginRun(page, URL);
  await page.evaluate(() => window.__game.director.interact({ type: "item", id: "fuse_a" }));
  await sleep(250);
  check("menuResume", "auto-saving sign shown at checkpoint", await page.evaluate(() => /AUTO-SAV/i.test(document.getElementById("toast").textContent || "")));
  await page.evaluate(() => window.__game.quitToTitle()); // QUIT TO TITLE (in-place)
  await sleep(250);
  const atTitle = await page.evaluate(() => ({
    title: !document.getElementById("title").classList.contains("hidden"),
    cont: !document.getElementById("btn-continue").classList.contains("hidden")
  }));
  check("menuResume", "quit to title shows title + CONTINUE", atTitle.title && atTitle.cont);
  await page.evaluate(() => window.__game.continueGame());
  const resumed = await waitTrue(() => window.__game.director.over === false && window.__game.player.frozen === false && document.getElementById("title").classList.contains("hidden"), 6000);
  check("menuResume", "CONTINUE resumes from last checkpoint", resumed);
  check("menuResume", "resumed with fuse-A progress intact", await page.evaluate(() => window.__game.director.fuses === 1 && window.__game.world.items.get("fuse_a").taken));

  // ========== run 8: run-and-hide — the monster gives up if you get away ==========
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 26 * 2 + 1; g.player.z = 16 * 2 + 1; g.player.lightOn = true; g.player.frozen = false;
    g.stalker.setPos(26 * 2 + 1, 13 * 2 + 1);
    g.stalker.state = "chase"; g.stalker.suspicion = 1; g.stalker.finalChase = false;
    g.stalker.lastSeen = [g.player.x, g.player.z];
  });
  await sleep(300);
  check("hideGiveUp", "enters a (non-final) chase", await page.evaluate(() => window.__game.stalker.state === "chase"));
  await page.evaluate(() => {
    const g = window.__game; // break line of sight + run far into maintenance
    g.player.lightOn = false;
    g.player.x = 8 * 2 + 1; g.player.z = 17 * 2 + 1;
  });
  const gaveUp = await waitTrue(() => window.__game.stalker.state !== "chase", 14000);
  check("hideGiveUp", "monster gives up the chase once you get away", gaveUp);

  // ========== run 9: perf instrument wired + producing sane numbers ==========
  await beginRun(page, URL);
  check("perfHarness", "window.__game.perf exposed", await page.evaluate(() => typeof window.__game.perf?.summary === "function"));
  await page.evaluate(() => window.__game.perf.reset());
  await sleep(900); // collect a window of real frames
  const perf = await page.evaluate(() => window.__game.perf.summary());
  check("perfHarness", "frames sampled", perf.frames > 0);
  check("perfHarness", "draw calls > 0 (scene is rendering)", perf.calls > 0);
  check("perfHarness", "triangles > 0", perf.triangles > 0);
  check("perfHarness", "frame time finite & positive", Number.isFinite(perf.ms.avg) && perf.ms.avg > 0);
  check("perfHarness", "cpu/render split recorded", perf.cpuMs >= 0 && perf.renderMs >= 0);
  // reset() must actually clear the window (regression probe for a stale-buffer bug)
  await page.evaluate(() => window.__game.perf.reset());
  const afterReset = await page.evaluate(() => window.__game.perf.summary().frames);
  check("perfHarness", "reset() clears the sampling window", afterReset <= 2);
  // toggling the overlay creates the DOM node
  const overlayWorks = await page.evaluate(() => {
    window.__game.perf.setOverlay(true);
    const on = !!document.getElementById("perf-overlay") && window.__game.perf.isOverlayOn();
    window.__game.perf.setOverlay(false);
    return on;
  });
  check("perfHarness", "overlay toggles + injects #perf-overlay", overlayWorks);
} catch (e) {
  errors.push("verify exception: " + String(e.message || e));
} finally {
  await browser.close();
}

const ids = Object.keys(checks);
const passCount = ids.filter((id) => checks[id].pass).length;
const results = {
  verifiedAt: new Date().toISOString(),
  url: URL,
  checks,
  errors,
  summary: { total: ids.length, pass: passCount, fail: ids.length - passCount }
};
writeFileSync(join(OUT, "results.json"), JSON.stringify(results, null, 2));
console.log(`verify: ${passCount}/${ids.length} checks pass, ${errors.length} errors -> ${OUT}`);
if (errors.length) console.error("page errors:", errors);
process.exit(errors.length ? 1 : 0);
