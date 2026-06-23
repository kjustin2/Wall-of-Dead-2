/** verify the first-sighting build-up payoff + a jumpscare flash overlay */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle, beginRun } from "./lib.mjs";
const URL = process.argv[2] ?? DEFAULT_URL;
const OUT = join(ROOT, "agent", "runs", "scare-shots");
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch();
try {
  // ---- first sighting (facing the first monster): trigger the platform reveal ----
  await beginRun(page, URL);
  await page.waitForFunction(() => window.__game.stalker.mixer != null, { timeout: 20000, polling: 200 }).catch(()=>{});
  await page.evaluate(() => {
    const g = window.__game;
    g.stalker.setPos(44 * 2 + 1, 14 * 2 + 1);          // creature straight down the platform (clear LOS)
    g.stalker.facing = 0;
    g.player.lightOn = true; g.player.battery = 1;
    g.player.x = 44 * 2 + 1; g.player.z = 24 * 2 + 1; g.player.yaw = 0; // step on -> fires the sighting, facing it
  });
  await sleep(6500); // let the reveal camera push in and settle on the standing creature
  await page.screenshot({ path: join(OUT, "0-first-sighting.png") });

  // ---- jumpscare: catch the red damage flash + camera jolt on a still-lit frame ----
  await beginRun(page, URL);
  await page.evaluate(() => {
    const g = window.__game;
    g.player.x = 8 * 2 + 1; g.player.z = 17 * 2 + 1; g.player.yaw = 0;  // maintenance, where fuse A lives
    g.player.lightOn = true; g.player.battery = 1;
    g.director.interact({ type: "item", id: "fuse_a" }); // fuse-A pickup -> jumpscare (red flash + shake)
  });
  await sleep(120); // catch the damage-flash overlay before it fades (1.4s)
  const flashOpacity = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById("damage")).opacity) || 0);
  await page.screenshot({ path: join(OUT, "1-jumpscare-flash.png") });
  console.log("jumpscare damage-overlay opacity:", flashOpacity.toFixed(2));
} catch (e) { errors.push(String(e.message || e)); }
finally { await browser.close(); }
console.log("scare-shots done", errors.length ? "ERRORS: " + errors.slice(0,3).join("; ") : "(0 errors)");
