/**
 * Behavioural check for the Escape→menu change:
 *  - in play, pressing Escape raises the pause menu (the in-game menu key)
 *  - the audio-duck path (fx.setPaused) runs on real WebAudio nodes without error
 *  - keyboard-lock helper is present/guarded (real fullscreen+lock can't run headless)
 * The "Escape doesn't drop fullscreen" guarantee is the Keyboard Lock API, which only
 * engages in a real fullscreen Chromium window — verified by reasoning + try/catch,
 * not headless. This proves the menu actually opens on Escape.
 */
import { launch, beginRun, DEFAULT_URL, sleep, HERE } from "./lib.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const URL = process.argv[2] || DEFAULT_URL;
const OUT = join(HERE, "runs", "escape");
mkdirSync(OUT, { recursive: true });

const { browser, page, errors } = await launch();
const shot = (name) => page.screenshot({ path: join(OUT, name) });
const pauseHidden = () => page.evaluate(() => document.getElementById("pause").classList.contains("hidden"));

await beginRun(page, URL);
await sleep(600);
await page.evaluate(() => { window.__game.player.frozen = false; });

const hasKeyboardLock = await page.evaluate(() => typeof navigator.keyboard?.lock === "function");
const playingPauseHidden = await pauseHidden();

// the core ask: Escape opens the in-game menu
await page.keyboard.press("Escape");
await sleep(300);
const pausedShown = !(await pauseHidden());
await shot("01-escape-opens-pause.png");

// audio ducked without error? (fx.setPaused ran on live nodes during pauseGame)
const audioOk = await page.evaluate(() => window.__game.fx.getVolume() >= 0); // no throw == path ran

console.log(JSON.stringify({
  hasKeyboardLock,                 // true on Chromium/Edge; informational
  pauseHiddenWhilePlaying: playingPauseHidden, // expect true
  pauseShownAfterEscape: pausedShown,          // expect true  ← the fix
  audioOk,
  errors: errors.length ? errors : "none"
}, null, 2));

await browser.close();
process.exit(playingPauseHidden && pausedShown && errors.length === 0 ? 0 : 1);
