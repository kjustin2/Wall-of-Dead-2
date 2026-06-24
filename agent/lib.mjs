/**
 * Shared helpers for the improvement-loop scripts (capture / verify / loop).
 * Drives the game headlessly through system Edge via puppeteer-core, exactly
 * like scripts/smoke.mjs + scripts/e2e.mjs, and at ?lowfx (the full post stack
 * stalls the dt-capped game clock under headless SwiftShader). All waits poll on
 * an interval, never rAF, because game-time runs ~3x slower than wall-time here.
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, "..");
export const DEFAULT_URL = "http://localhost:5173";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function loadGoals() {
  return JSON.parse(readFileSync(join(HERE, "goals.json"), "utf8"));
}

/** ?lowfx unless the caller already put a query string on the URL */
export function withFx(base) {
  return base.includes("?") ? base : base + "?lowfx";
}

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
];

export function findEdge() {
  const exe = EDGE_PATHS.find((p) => existsSync(p));
  if (!exe) throw new Error("Microsoft Edge not found; install Edge or edit EDGE_PATHS in agent/lib.mjs");
  return exe;
}

export async function launch() {
  const browser = await puppeteer.launch({
    executablePath: findEdge(),
    // "shell" (old headless) renders WebGL via SwiftShader identically to "new"
    // (verified — see agent/headless-ab.mjs) but never creates an OS window, so it
    // can't steal foreground focus / yank the cursor on Windows the way "new"
    // intermittently does. Do NOT change back to "new".
    headless: "shell",
    args: [
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--window-size=1280,720",
      "--autoplay-policy=no-user-gesture-required"
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !m.text().includes("favicon")) errors.push("console: " + m.text());
  });
  return { browser, page, errors };
}

/** wait until no cutscene is playing (returns true on success, false on timeout) */
export const idle = (page) =>
  page
    .waitForFunction(() => window.__game && !window.__game.cine.active, { timeout: 30000, polling: 100 })
    .then(() => true)
    .catch(() => false);

/** load fresh, click DESCEND, skip the intro cutscene, land in playable state */
export async function beginRun(page, url) {
  await page.goto(withFx(url), { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
  await page.click("#btn-start");
  await sleep(400);
  await page.keyboard.press("Space"); // any key skips the (skippable) descent cutscene
  await idle(page);
  await page.evaluate(() => {
    window.__game.player.frozen = false;
  });
}

/** teleport + configure the player (cell coords, like scripts/tour.mjs) */
export const place = (page, spot) =>
  page.evaluate((s) => {
    const g = window.__game;
    g.player.frozen = false;
    g.player.x = s.cx * 2 + 1;
    g.player.z = s.cy * 2 + 1;
    g.player.yaw = s.yaw ?? 0;
    g.player.pitch = s.pitch ?? 0;
    if (s.torch !== undefined) g.player.lightOn = s.torch;
    g.player.battery = s.battery ?? 1;
  }, spot);

/** if a zone-entry cutscene fired, skip it and re-place for a clean player view */
export async function skipIfCutscene(page, spot) {
  if (await page.evaluate(() => window.__game.cine.active)) {
    await page.keyboard.press("Space");
    await idle(page);
    if (spot) await place(page, spot);
    await sleep(300);
    return true;
  }
  return false;
}

/** evaluate a goal's in-page probe expression, returning {ok, error} */
export async function runProbe(page, expr) {
  try {
    const ok = await page.evaluate((src) => {
      // eslint-disable-next-line no-new-func
      const g = window.__game;
      return !!new Function("g", `return (${src});`)(g);
    }, expr);
    return { ok: !!ok, error: null };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}
