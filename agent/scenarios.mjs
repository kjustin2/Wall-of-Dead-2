/**
 * Drives the in-game debug scenario system (window.__game.debug) to "cut to" each
 * named scenario and screenshot it — no playthrough needed. Demonstrates the debug
 * API and gives a contact sheet of every key beat for visual verification.
 *
 *   node agent/scenarios.mjs [url] [outDir]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, beginRun } from "./lib.mjs";
const URL = process.argv[2] ?? DEFAULT_URL;
const OUT = join(ROOT, "agent", "runs", process.argv[3] ?? "scenarios");
mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await launch();
// cutscene scenarios need longer (dt-capped clock runs ~3x slow headless)
const WAIT = { "first-sighting": 6500, escape: 4000, death: 3500 };
try {
  // start the app once (the DESCEND gesture activates the WebGL canvas in headless),
  // then cut straight to scenarios via the debug API — no playthrough needed.
  await beginRun(page, URL);
  await page.waitForFunction(() => !!(window.__game && window.__game.debug), { timeout: 15000, polling: 100 });
  await page.waitForFunction(() => window.__game.stalker.mixer != null, { timeout: 20000, polling: 200 }).catch(() => {});
  await sleep(1500); // let the WebGL canvas paint its first composited frame
  const names = await page.evaluate(() => window.__game.debug.list());
  console.log("scenarios:", names.join(", "));
  let i = 0;
  for (const name of names) {
    const res = await page.evaluate((n) => window.__game.debug.scenario(n), name);
    await sleep(WAIT[name] ?? 800);
    const file = `${String(i++).padStart(2, "0")}-${name}.png`;
    await page.screenshot({ path: join(OUT, file) });
    console.log(`  ${file}  ok=${res.ok}`);
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), names, errors }, null, 2));
} catch (e) { errors.push(String(e.message || e)); }
finally { await browser.close(); }
console.log("scenarios done", errors.length ? "ERRORS: " + errors.slice(0, 3).join("; ") : "(0 errors)");
