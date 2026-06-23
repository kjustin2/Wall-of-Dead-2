/**
 * CAPTURE — scripted play-through that screenshots every meaningful beat and, at
 * the exact moment of each screenshot, evaluates the visual probes of the goals
 * attached to that beat. The PNGs are the visual evidence; the probe booleans are
 * the deterministic visual gate. Writes <out>/manifest.json.
 *
 *   node agent/capture.mjs --url http://localhost:5173 --out agent/runs/manual --cycle 0
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  HERE, ROOT, DEFAULT_URL, sleep, loadGoals, launch, idle, beginRun, place, skipIfCutscene, runProbe
} from "./lib.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const URL = arg("url", DEFAULT_URL);
const OUT = arg("out", join(ROOT, "agent", "runs", "manual"));
const CYCLE = Number(arg("cycle", "0"));
mkdirSync(OUT, { recursive: true });

const { goals } = loadGoals();
const visualGoals = goals.filter((g) => g.visual);
const goalsForBeat = (beat) => visualGoals.filter((g) => g.visual.beat === beat);

const { browser, page, errors } = await launch();
const shots = [];

/** snapshot a compact slice of DOM + game state for the report and the AI pass */
const snapshot = (page) =>
  page.evaluate(() => {
    const g = window.__game;
    const cls = (id) => document.getElementById(id).className;
    const shown = (id) => getComputedStyle(document.getElementById(id)).display !== "none";
    const vis = (id) => !document.getElementById(id).classList.contains("hidden");
    return {
      screen: { title: vis("title"), pause: vis("pause"), dead: vis("dead"), win: vis("win") },
      hudHidden: document.getElementById("hud").classList.contains("hidden"),
      objective: document.getElementById("objective").textContent.trim(),
      objlabel: (document.getElementById("objlabel").textContent || "").trim(),
      caption: (document.getElementById("caption").textContent || "").trim(),
      letterboxOn: document.getElementById("letterbox").classList.contains("on"),
      chaseVignetteOn: document.getElementById("chase-vignette").classList.contains("on"),
      wayfinderShown: shown("wayfinder"),
      director: g ? { power: g.director.power, broadcast: g.director.broadcast, chase: g.director.chase, fuses: g.director.fuses, over: g.director.over } : null,
      stalker: g ? { state: g.stalker.state, finalChase: g.stalker.finalChase } : null,
      _cls: { letterbox: cls("letterbox"), chase: cls("chase-vignette") }
    };
  });

/** screenshot a beat, run its goals' probes, record a manifest entry */
async function shoot(beat) {
  await sleep(250);
  const file = `${String(shots.length).padStart(2, "0")}-${beat}.png`;
  await page.screenshot({ path: join(OUT, file) });
  const state = await snapshot(page);
  const probes = [];
  for (const g of goalsForBeat(beat)) {
    const { ok, error } = await runProbe(page, g.visual.probe);
    probes.push({ goalId: g.id, ok, error, criteria: g.visual.criteria });
  }
  shots.push({ beat, file, probes, state });
  const pf = probes.map((p) => `${p.goalId}:${p.ok ? "PASS" : "FAIL"}`).join(" ");
  console.log(`  shot ${file}${pf ? "  [" + pf + "]" : ""}`);
}

try {
  // ---------- segment 1: title + intro cutscene ----------
  await page.goto(URL.includes("?") ? URL : URL + "?lowfx", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
  await sleep(400);
  await shoot("title");

  await page.click("#btn-start");
  // Wait for the cutscene to actually be PRESENTING before shooting: under
  // headless SwiftShader game-time runs ~3x slower than wall-time, so a fixed
  // sleep lands on the initial fade-to-black before the first caption (t=0.6s
  // game-time). Poll for the caption to show (fall back after a generous wait).
  await page
    .waitForFunction(
      () => window.__game && window.__game.cine.active &&
            document.getElementById("letterbox").classList.contains("on") &&
            document.getElementById("caption").classList.contains("show"),
      { timeout: 12000, polling: 100 }
    )
    .catch(() => {});
  await shoot("intro");

  // skip into playable state and continue on the same page
  await page.keyboard.press("Space");
  await idle(page);
  await page.evaluate(() => { window.__game.player.frozen = false; });

  // ---------- segment 2: gameplay beats ----------
  const concourse = { cx: 26, cy: 16, yaw: Math.PI, torch: true };
  await place(page, concourse);
  await skipIfCutscene(page, concourse);
  await shoot("concourse");

  const maint = { cx: 8, cy: 17, yaw: 1.6, torch: true };
  await place(page, maint);
  await skipIfCutscene(page, maint);
  await shoot("maintenance");

  const platform = { cx: 44, cy: 18, yaw: -2.74, torch: true };
  await place(page, platform);
  await skipIfCutscene(page, platform);
  await shoot("platform");

  const genroom = { cx: 43, cy: 5, yaw: -1.57, torch: true };
  await place(page, genroom);
  await skipIfCutscene(page, genroom);
  await shoot("genroom");

  // power: collect both fuses, refit at the rack -> power-on cutscene
  await page.evaluate(() => {
    const g = window.__game;
    g.director.interact({ type: "item", id: "fuse_a" });
    g.director.interact({ type: "item", id: "fuse_b" });
    g.player.x = 46 * 2 + 1;
    g.player.z = 4 * 2 + 1;
    g.director.interact({ type: "item", id: "panel" });
  });
  await idle(page);
  await place(page, genroom);
  await shoot("power");

  // archive: stair now unlocked; entering the intake zone fires the archive cutscene
  const archive = { cx: 23, cy: 39, yaw: 0, torch: true };
  await place(page, archive);
  await sleep(600);
  await skipIfCutscene(page, archive);
  await shoot("archive");

  const core = { cx: 20, cy: 46, yaw: Math.PI, torch: true };
  await place(page, core);
  await skipIfCutscene(page, core);
  await shoot("core");

  // chase: re-arm the broadcast at the console -> final chase (freeze the creature
  // so the single screenshot frame can't end in a death mid-capture)
  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 20 * 2 + 1;
    g.player.z = 46 * 2 + 1;
    g.director.interact({ type: "item", id: "console" });
  });
  await idle(page);
  await page.evaluate(() => {
    const g = window.__game;
    g.stalker.frozen = true;
    g.player.x = 26 * 2 + 1;
    g.player.z = 16 * 2 + 1;
    g.player.lightOn = true;
  });
  await sleep(400);
  await shoot("chase");

  // ---------- segment 3: death (fresh run) ----------
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.stalker.activate();
    g.stalker.setPos(g.player.x + 0.4, g.player.z);
  });
  await page
    .waitForFunction(() => !document.getElementById("dead").classList.contains("hidden"), { timeout: 15000, polling: 100 })
    .catch(() => {});
  await shoot("death");

  // ---------- segment 4: win (fresh run) ----------
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.director.power = true;
    g.director.broadcast = true;
    g.stalker.frozen = true;
    g.stalker.setPos(46 * 2 + 1, 24 * 2 + 1);
    g.player.x = 24 * 2 + 1;
    g.player.z = 4 * 2 + 1;
    g.director.interact({ type: "item", id: "hatch" });
  });
  await page
    .waitForFunction(() => !document.getElementById("win").classList.contains("hidden"), { timeout: 45000, polling: 100 })
    .catch(() => {});
  await shoot("win");
} catch (e) {
  errors.push("capture exception: " + String(e.message || e));
} finally {
  await browser.close();
}

const manifest = {
  cycle: CYCLE,
  url: URL,
  capturedAt: new Date().toISOString(),
  viewport: { width: 1280, height: 720 },
  shots,
  errors
};
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

const probeTotal = shots.reduce((n, s) => n + s.probes.length, 0);
const probePass = shots.reduce((n, s) => n + s.probes.filter((p) => p.ok).length, 0);
console.log(`capture: ${shots.length} shots, visual probes ${probePass}/${probeTotal} pass, ${errors.length} errors -> ${OUT}`);
if (errors.length) console.error("page errors:", errors);
process.exit(0);
