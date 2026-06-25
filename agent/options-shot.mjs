/**
 * Visual + behavioural check for the new Options/Settings menu.
 *  1. title screen (shows the new OPTIONS button)
 *  2. title → OPTIONS (full settings panel)
 *  3. in-game → pause → OPTIONS (translucent, previewing the frozen scene)
 * Also drives a few controls and asserts they reach the live systems via __game.
 */
import { launch, beginRun, DEFAULT_URL, sleep, withFx } from "./lib.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { HERE } from "./lib.mjs";

const URL = process.argv[2] || DEFAULT_URL;
const OUT = join(HERE, "runs", "options");
mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch();
const shot = (name) => page.screenshot({ path: join(OUT, name) });

// 1. fresh title
await page.goto(withFx(URL), { waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
await sleep(500);
await shot("01-title.png");

// 2. title -> OPTIONS
await page.click("#btn-options");
await sleep(400);
await shot("02-options.png");

// brightness slider -> renderer exposure
await page.evaluate(() => {
  const s = document.getElementById("opt-brightness");
  s.value = "1.3";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
// resolution 50%
await page.click('#opt-res .seg-opt[data-v="0.5"]');
// graphics medium
await page.click('#opt-quality .seg-opt[data-v="medium"]');
// fov 84
await page.evaluate(() => {
  const s = document.getElementById("opt-fov");
  s.value = "84";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
// sensitivity 1.8
await page.evaluate(() => {
  const s = document.getElementById("opt-sens");
  s.value = "1.8";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
// invert on, volume 30%
await page.click('#opt-invert .seg-opt[data-v="1"]');
await page.evaluate(() => {
  const s = document.getElementById("opt-volume");
  s.value = "0.3";
  s.dispatchEvent(new Event("input", { bubbles: true }));
});
await sleep(200);
await shot("03-options-changed.png");

const live = await page.evaluate(() => {
  const g = window.__game;
  return {
    lookSpeed: g.player.lookSpeed,
    invertY: g.player.invertY,
    renderScale: g.post.getRenderScale(),
    quality: g.post.getQuality(),
    volume: g.fx.getVolume(),
    resReadout: document.getElementById("res-readout").textContent,
    fovReadout: document.getElementById("fov-readout").textContent,
    saved: JSON.parse(localStorage.getItem("deadair.settings.v1") || "{}")
  };
});

// back to title, then into the game and verify settings persisted/applied
await page.click("#btn-opts-back");
await sleep(200);
await shot("04-back-to-title.png");

// reload to prove persistence, then play and open pause options
await beginRun(page, URL);
await sleep(800);
const applied = await page.evaluate(() => {
  const g = window.__game;
  return {
    lookSpeed: g.player.lookSpeed,
    invertY: g.player.invertY,
    renderScale: g.post.getRenderScale(),
    quality: g.post.getQuality()
  };
});

// pause (release pointer lock) -> options over the frozen scene
await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
await sleep(300);
await page.evaluate(() => { window.__game.hud.showScreen("pause"); });
await sleep(200);
await shot("05-pause.png");
await page.click("#btn-pause-options");
await sleep(300);
await shot("06-pause-options.png");

console.log("live (after edits):", JSON.stringify(live, null, 2));
console.log("applied (after reload+play):", JSON.stringify(applied, null, 2));
console.log("page/console errors:", errors.length ? errors : "none");

await browser.close();
