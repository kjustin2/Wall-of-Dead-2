/**
 * MONSTER SHOTS — close, torch-lit captures of the Tallyman in each pose, for
 * before/after verification of scariness + animation work. Waits for the rigged
 * GLB to load (falls back to the procedural creature) so shots are deterministic.
 *
 *   node agent/monster-shots.mjs --out agent/runs/monster-before
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle } from "./lib.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const URL = arg("url", DEFAULT_URL);
const OUT = arg("out", join(ROOT, "agent", "runs", "monster"));
mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch();
const shots = [];

// player anchored in the open concourse hub, looking north (-z); creature placed
// a few metres ahead along the look vector, lit by the torch and facing the player.
const ANCHOR = { ax: 26 * 2 + 1, az: 19 * 2 + 1, yaw: 0 };

async function pose(name, { dist = 4.5, state = "dormant", pitch = 0, reveal = false, settle = 700 }) {
  await page.evaluate((p) => {
    const g = window.__game;
    g.player.frozen = true;
    g.player.x = p.ax; g.player.z = p.az; g.player.yaw = p.yaw; g.player.pitch = p.pitch;
    g.player.lightOn = true; g.player.battery = 1;
    // forward = (-sin yaw, -cos yaw) in XZ
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const sx = p.ax + fx * p.dist, sz = p.az + fz * p.dist;
    const s = g.stalker;
    s.frozen = false;
    s.endReveal && s.endReveal();
    s.setPos(sx, sz);
    s.facing = Math.atan2(p.ax - sx, p.az - sz); // face the player so the eyes catch the light
    s.path = []; s.lastSeen = null; s.doorWait = null;
    if (p.reveal) { s.crouchPose = 1; s.beginReveal(p.ax, p.az); }
    else if (p.state === "chase") { s.finalChase = true; s.state = "chase"; s.suspicion = 1; s.crouchPose = 0; s.onKill = () => {}; }
    else if (p.state === "idle") { s.state = "roam"; s.frozen = true; s.crouchPose = 0; }
    else { s.state = "dormant"; s.crouchPose = 1; }
  }, { ...ANCHOR, dist, state, pitch, reveal });
  await sleep(settle);
  const file = `${String(shots.length).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: join(OUT, file) });
  const info = await page.evaluate(() => {
    const g = window.__game;
    return { rig: !!g.stalker.mixer, state: g.stalker.state, eyeOpacity: g.stalker.eyeMatL?.opacity ?? null };
  });
  shots.push({ name, file, ...info });
  console.log(`  ${file}  rig=${info.rig} state=${info.state} eyes=${(info.eyeOpacity ?? 0).toFixed?.(2)}`);
}

try {
  await page.goto(URL.includes("?") ? URL : URL + "?lowfx", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
  await page.click("#btn-start");
  await sleep(400);
  await page.keyboard.press("Space");
  await idle(page);
  // give the 2.9MB rigged GLB time to load + parse (poll, fall back to primitive)
  const rigLoaded = await page
    .waitForFunction(() => window.__game.stalker.mixer != null, { timeout: 20000, polling: 200 })
    .then(() => true).catch(() => false);
  console.log(`rig loaded: ${rigLoaded}`);

  await pose("dormant", { dist: 4.5, state: "dormant" });
  await pose("reveal", { dist: 5.0, reveal: true, settle: 1800 });
  await pose("idle", { dist: 4.5, state: "idle" });
  await pose("chase", { dist: 4.0, state: "chase", settle: 1000 });
  await pose("face", { dist: 2.6, state: "chase", pitch: 0.16, settle: 900 });
} catch (e) {
  errors.push("monster-shots exception: " + String(e.message || e));
} finally {
  await browser.close();
}

writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ capturedAt: new Date().toISOString(), url: URL, shots, errors }, null, 2));
console.log(`monster-shots: ${shots.length} poses -> ${OUT}${errors.length ? "  (" + errors.length + " errors)" : ""}`);
if (errors.length) console.error(errors);
process.exit(0);
