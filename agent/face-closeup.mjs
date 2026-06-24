/** extreme close-up of the Tallyman's head — crop to judge eyes/teeth/throat/flesh */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle } from "./lib.mjs";
const OUT = join(ROOT, "agent", "runs", process.argv[3] ?? "face");
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch();
const ANCHOR = { ax: 26 * 2 + 1, az: 19 * 2 + 1, yaw: 0 };
async function shot(name, { dist, pitch, state, mawForce }) {
  await page.evaluate((p) => {
    const g = window.__game;
    g.player.frozen = true;
    g.player.x = p.ax; g.player.z = p.az; g.player.yaw = p.yaw; g.player.pitch = p.pitch;
    g.player.lightOn = true; g.player.battery = 1;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const sx = p.ax + fx * p.dist, sz = p.az + fz * p.dist;
    const s = g.stalker;
    s.frozen = false; s.endReveal && s.endReveal();
    s.setPos(sx, sz);
    s.facing = Math.atan2(p.ax - sx, p.az - sz);
    s.path = []; s.lastSeen = null; s.doorWait = null;
    s.finalChase = true; s.state = "chase"; s.suspicion = 1; s.crouchPose = 0; s.onKill = () => {};
  }, { ...ANCHOR, dist, pitch });
  await sleep(1100);
  // center crop on the head
  await page.screenshot({ path: join(OUT, `${name}.png`), clip: { x: 470, y: 120, width: 340, height: 320 } });
}
try {
  await page.goto((process.argv[2] ?? DEFAULT_URL) + "?lowfx", { waitUntil: "networkidle0" });
  await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
  await page.click("#btn-start"); await sleep(400);
  await page.keyboard.press("Space"); await idle(page);
  await page.waitForFunction(() => window.__game.stalker.mixer != null, { timeout: 20000, polling: 200 }).catch(() => {});
  await shot("00-head", { dist: 2.2, pitch: 0.2 });
  await shot("01-head-near", { dist: 1.7, pitch: 0.28 });
} catch (e) { errors.push(String(e.message || e)); }
finally { await browser.close(); }
console.log("face-closeup done", errors.length ? "ERR " + errors.slice(0, 2) : "(0 err)");
