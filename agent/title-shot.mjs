/**
 * Visual check for the redesigned main-menu backdrop + the new EXIT GAME button.
 *  1. title screen — creepy "dead signal" backdrop, EXIT GAME present in the menu
 *  2. EXIT (browser fallback) — the "signal lost" farewell screen
 */
import { launch, DEFAULT_URL, sleep, withFx } from "./lib.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { HERE } from "./lib.mjs";

const URL = process.argv[2] || DEFAULT_URL;
const OUT = join(HERE, "runs", "title");
mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch();
const shot = (name) => page.screenshot({ path: join(OUT, name) });

await page.goto(withFx(URL), { waitUntil: "networkidle0" });
await page.waitForFunction(() => !!window.__game, { timeout: 15000, polling: 100 });
await sleep(1200); // let the haze/sweep/flicker settle into a representative frame

const menu = await page.evaluate(() => {
  const btn = document.getElementById("btn-exit");
  return {
    exitBtnText: btn?.textContent ?? null,
    exitVisible: !!btn && !btn.classList.contains("hidden"),
    buttons: [...document.querySelectorAll("#title .menu button")]
      .filter((b) => !b.classList.contains("hidden"))
      .map((b) => b.textContent)
  };
});
await shot("01-title.png");

// click EXIT — in headless Edge this is NOT Electron, so we expect the farewell
await page.click("#btn-exit");
await sleep(700);
const exited = await page.evaluate(() => ({
  exitShown: !document.getElementById("exit").classList.contains("hidden"),
  titleHidden: document.getElementById("title").classList.contains("hidden")
}));
await shot("02-exit-farewell.png");

console.log("menu:", JSON.stringify(menu, null, 2));
console.log("after exit:", JSON.stringify(exited, null, 2));
console.log("page/console errors:", errors.length ? errors : "none");

await browser.close();
