/** stand in front of pickups/notes/fixtures to inspect grounding + detail */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle, beginRun } from "./lib.mjs";
const OUT = join(ROOT, "agent", "runs", process.argv[3] ?? "items-before");
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch();
// dist = metres south of the cell; pitch<0 looks down (pickups), ~0 level (fixtures)
const items = [
  { name: "fuse_a", cx: 9, cy: 16, dist: 1.2, pitch: -0.5 },
  { name: "note_workorder", cx: 27, cy: 13, dist: 1.1, pitch: -0.62 },
  { name: "battery_conc", cx: 31, cy: 16, dist: 1.1, pitch: -0.5 },
  { name: "bottles_maint", cx: 8, cy: 20, dist: 1.2, pitch: -0.46 },
  { name: "note_ledger", cx: 20, cy: 37, dist: 1.1, pitch: -0.62 },
  { name: "panel", cx: 46, cy: 4, dist: 2.4, pitch: 0.05 },
  { name: "console", cx: 20, cy: 46, dist: 2.2, pitch: -0.12 },
];
try {
  await beginRun(page, process.argv[2] ?? DEFAULT_URL);
  let i = 0;
  for (const it of items) {
    await page.evaluate((it) => {
      const g = window.__game;
      g.player.x = it.cx * 2 + 1;
      g.player.z = it.cy * 2 + 1 + it.dist;
      g.player.yaw = 0; g.player.pitch = it.pitch;
      g.player.lightOn = true; g.player.battery = 1; g.player.frozen = true;
    }, it);
    await sleep(550);
    await page.screenshot({ path: join(OUT, `${String(i++).padStart(2, "0")}-${it.name}.png`) });
  }
} catch (e) { errors.push(String(e.message || e)); }
finally { await browser.close(); }
console.log("item-shots done", errors.length ? "ERR " + errors.slice(0, 2) : "(0 err)");
