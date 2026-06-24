/** clean, lit captures of the large fixtures (console, breaker panel) via the
 *  debug scenario system (clears cutscenes + powers the lights) */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle } from "./lib.mjs";
const OUT = join(ROOT, "agent", "runs", "fixtures");
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch();

async function clearOverlays() {
  await page.evaluate(() => {
    window.__game.hud.letterbox(false);
    for (const id of ["caption", "subtitle", "blackout", "chase-vig", "damage"]) {
      const e = document.getElementById(id);
      if (e) { e.classList.remove("show", "on", "active"); e.style.opacity = "0"; }
    }
  });
}
function setup(spec) {
  return page.evaluate((s) => {
    const g = window.__game;
    g.debug.scenario(s.scn);
    for (const lh of g.world.lights.values()) { lh.on = true; lh.base = Math.max(lh.base, 2.2); lh.pulse = false; lh.dipT = 0; }
    g.director.chase = true; // suppress the objective beacon
    if (s.cx != null) { const [x, z] = g.level.cellCenter(s.cx, s.cy); g.player.x = x; g.player.z = z; }
    if (s.yaw != null) g.player.yaw = s.yaw;
    g.player.pitch = s.pitch; g.player.frozen = true;
  }, spec);
}
try {
  await page.goto((process.argv[2] ?? DEFAULT_URL) + "?lowfx", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
  await page.click("#btn-start"); await sleep(400);
  await page.keyboard.press("Space"); await idle(page);

  // console (repeater core) — stand back (north) from it; operator side faces -z
  await setup({ scn: "core", cx: 20, cy: 44, yaw: Math.PI, pitch: -0.12 });
  await sleep(1300);
  await clearOverlays();
  await sleep(250);
  await page.screenshot({ path: join(OUT, "0-console.png") });

  // breaker panel — power-on scenario lights the area; nudge to face the east-wall rack
  await setup({ scn: "power-on", cx: 44, cy: 4, yaw: -Math.PI / 2, pitch: 0.05 });
  await sleep(1300);
  await clearOverlays();
  await sleep(250);
  await page.screenshot({ path: join(OUT, "1-panel.png") });
} catch (e) { errors.push(String(e.message || e)); }
finally { await browser.close(); }
console.log("fixtures done", errors.length ? "ERR " + errors.slice(0, 2) : "(0 err)");
