# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

DEAD AIR is a first-person stealth-horror short built with **Three.js + Vite + TypeScript** (no UI framework, no test framework). `README.md` is the player/feature reference; `DESIGN.md` is the design source-of-truth for story, map, cutscenes, and wayfinding. Read those for *what* the game is; this file is *how the code is wired*.

## Commands

```powershell
npm run dev          # Vite dev server (default port 5173) with hot-reload
npm run typecheck    # tsc --noEmit — the only static gate; run after any TS change
npm run build        # typecheck + vite build → dist/
npm run standalone   # build, then launch in an Electron desktop window
npm run exe          # build, then package a single shareable portable .exe → release/DEAD-AIR-<ver>.exe
npm run assets       # one-time: fetch CC0 textures/models (git-ignored; game works without them)
node scripts/map.mjs # render + flood-fill connectivity-check the level — NO server/build needed
```

Headless integration tests (drive system **Edge** via `puppeteer-core`, no browser download). They need a running server — start `npm run dev` (or `vite preview`) in another terminal, then pass its URL as the first arg if it differs from the script's default port:

```powershell
npm run smoke -- http://localhost:5173   # boots, plays intro + a few seconds, screenshots, fails on console/page errors
npm run test:e2e -- http://localhost:5173 # scripted playthrough: fuses→power→core→chase→escape, plus death + save paths
npm run tour                              # screenshots key locations → scripts/shots/
npm run perf                              # profile every beat (draw calls/tris/cpu/render + health) vs perf-baseline.json
npm run perf:baseline                     # record the current run AS the perf baseline
npm run diff -- <before-dir> <after-dir>  # perceptual visual-diff between two capture runs → magenta heatmaps
```

`agent/perf.mjs` is the **performance + health gate**: it cuts to every debug
scenario, samples the `window.__game.perf` instrument (real frame time, a CPU-vs-
render split, `renderer.info` draw calls/tris/geo/tex/programs counted across all
post passes, JS heap), runs a NaN/out-of-bounds/runaway-draw **health probe**, and
flags ▲ regressions / ▼ optimisations vs the baseline. Headless fps/ms are software-
bound (compare to themselves); the deterministic cross-run signals are
`renderer.info` + CPU ms. The in-game overlay toggles with `` ` `` / **F3** (or
`?perf`) so a screenshot shows the numbers. See `agent/README.md` for the full
performance + visual-diff workflow.

There is **no unit-test runner and no linter**. `scripts/e2e.mjs` is the closest thing to a test suite — it's a sequence of labelled `check(name, ok)` assertions across several runs. To run "one test," temporarily comment out the other runs in that file, or drive `window.__game` manually in a browser console (see below).

## Test-harness constraints (important, easy to get wrong)

- Headless scripts default to **`?lowfx`** — the full post stack (GTAO/SMAA/DoF) is too slow under headless SwiftShader and stalls the game clock. `?lowfx` still drives the real composer so shader/runtime errors surface; `?nofx` disables post entirely. A persisted graphics tier is ignored when either param is present.
- Smokes must **never steal OS focus** — keep test browsers/windows headless or hidden (`show: false` / `showInactive()`); never foreground one.
- **Stop dev servers before ending the turn** — the owner only tests via the standalone build (`npm run standalone` / the `.exe`). Never hand back with `npm run dev`/`vite preview` running; kill the process tree (`taskkill /T`) so no orphan squats the port or serves stale code to the next smoke.
- The dt-capped game clock advances **slower than wall-time** under headless GL (~3×). Any assertion that waits on cutscene/game-time progress must use **generous real-time timeouts** and **poll on an interval (`polling: 100`), never on rAF**.
- Tests assert against game state, not pixels, through the `window.__game` hook.

## The `window.__game` debug/test hook

`src/main.ts` exposes the entire live object graph on `window.__game` (`player, stalker, director, level, world, fx, hud, post, perf, cine, wayfinder, newGame, continueGame, quitToTitle, debug`). `perf` is the performance instrument (`perf.summary()` / `perf.reset()` / `perf.setOverlay(bool)`), driven by `agent/perf.mjs`. This is the seam every headless test and manual debug session drives — e.g. `__game.director.interact({type:"item", id:"fuse_a"})`, `__game.player.x = ...`, `__game.level.findPath(...)`. When changing public fields/methods on those classes, expect to update `scripts/e2e.mjs`.

### Debug scenario system — cut to any beat

`window.__game.debug` lets tests/manual sessions **cut straight to a named scenario** (no playthrough): `__game.debug.list()` returns the names; `__game.debug.scenario("chase")` sets up that beat's world state for a screenshot/assertion. Scenarios: `arrival, maintenance, first-sighting, power-on, archive, core, chase, creature, escape, death` plus the four place-gated false-scares `scare-hang, scare-dart, scare-face, scare-drop`. Defined in `main.ts` (`SCENARIOS` map), backed by public debug hooks on Director (`debugPower`/`debugArmChase`/`debugEscape`/`debugScare`) and Stalker (`faceToward`/`setCrouchPose`). **You must start the app first** (click `#btn-start`, i.e. `beginRun`) — the WebGL canvas only composites after the DESCEND gesture in headless; `dbgPlay` then clears overlays so the cut renders clean. Driver: `node agent/scenarios.mjs` → contact sheet of every beat in `agent/runs/scenarios/`.

## Architecture

### Ownership: main.ts owns the loop and the state machine; Director owns the story

- `src/main.ts` — bootstraps renderer/scene/camera/post, builds the world, runs the single `requestAnimationFrame` loop, and **owns the `GameState` machine** (`title | playing | cinematic | paused | over`). It wires DOM buttons, pointer-lock → pause, the kill-cam, flashlight rig, beacon, dust, and thrown bottles.
- `src/game/Director.ts` — the **story orchestrator / state machine**. Tracks act flags (`fuses`, `power`, `broadcast`, `chase`, `over`, `dying`), fires zone-entry triggers and the six cutscene beats, computes the current objective (`objectiveTarget`/`objectiveLabel`, read by main each frame), handles all item/door `interact()`, and owns save/restore.
- main injects a **`playCut(cut, onDone)`** callback into the Director. The Director never touches the game-state machine, camera handoff, pointer lock, or wayfinder directly — it *requests* a cutscene and main does the rest. During a cutscene main freezes `player` and `stalker` and hides gameplay HUD; "reveal" beats (e.g. first sighting) re-arm the creature mid-cutscene via `stalker.beginReveal()` / `endReveal()`.

### Level-as-data: data.ts → Level (logic) + Builder (visuals)

- `src/world/data.ts` — the **entire level as pure array/object literals**: room rects, doors, items, lights, signs, pillars/props, zones, and `NAV` anchors. `CELL = 2` (1 grid cell = 2 m).
- `src/world/Level.ts` — the **grid logic model** built from `data.ts`: solid/obstacle grids, doors, collision, line-of-sight (`los`), BFS pathfinding (`findPath`), and the per-frame noise-event list (`noises`, cleared each frame after the stalker reads it).
- `src/world/Builder.ts` — builds the **Three.js scene** (`BuiltWorld`: groups, material handles, light handles, item/door handles) from the same data.
- **Coordinate convention:** grid cell ↔ world is `world = cx * CELL + CELL/2` (cell center). Use `level.cellCenter(cx,cy)` / `level.worldToCell(x,z)` / `director.cellWorld(cx,cy)` — don't hand-roll the `*2+1` arithmetic.
- `scripts/map.mjs` parses these literals out of `data.ts` directly (no build) and flood-fills to verify connectivity. **Run it after any map edit** — it catches unreachable rooms/objectives that won't surface until playtime.

### The creature: light-first perception

`src/game/Stalker.ts` is a state machine (`dormant → roam → investigate → search → chase`). It perceives **light first, sound second**: the torch is visible far/omnidirectionally, sprinting is loud, crouching in dark hides you. Doors slow it; fire doors hold a few seconds before it bashes through (`onBash`). It is unkillable by design — the whole game is evasion.

### Other subsystems

- `src/core/AudioFX.ts` — procedural WebAudio synthesis (drones, footsteps, heartbeat, slams, radio voice, lift) **plus a small set of sourced CC0 clips** (`public/audio/*.mp3` one-shots, `public/music/*.mp3` looping act-cued score; manifest in `src/core/audio-manifest.ts`, licenses in `public/audio/LICENSES.md`). Samples layer *over* the synth and **silently skip on load failure — the synth path is the guaranteed fallback, so the game must always run with the audio dirs empty**. Keep clips small. Audio *is* the threat-detection UI. Must be `init()`-ed inside a user gesture (done in `newGame`/`continueGame`).
- `src/core/Post.ts` — post stack with auto-tuning quality tiers (`low|medium|high`), overridable via the pause menu (persisted) or `?lowfx`/`?nofx`.
- `src/core/Save.ts` — checkpoint saves + settings in `localStorage` (key `deadair.save.v1`). `Director.checkpoint()` writes at each story beat; `Director.restore()` rebuilds *all* act/world/creature state from a `SaveData` so it works both from the title (CONTINUE) and in-place after death (one-click retry) without leaving stale state. The Electron standalone (`electron/main.cjs`) serves `dist/` over the **custom fixed-origin `app://dead-air` scheme** — localStorage is origin-keyed, so changing the scheme/host (or regressing to an ephemeral-port server) **silently wipes saves**.
- **Escape opens the pause menu and must NEVER drop fullscreen.** The Keyboard Lock API captures Escape while fullscreen (acquired/released in the `fullscreenchange` handler in `main.ts` so every entry path — button, F11, saved pref — is covered); keep new fullscreen paths inside that handler.
- `src/core/Assets.ts` — loads CC0 PBR materials + GLB models with **flat-color / procedural fallbacks** if the `npm run assets` download is absent, so dev and CI never depend on it.
- `src/ui/Wayfinder.ts` + `src/ui/Hud.ts` — compass pip, on-screen/edge objective marker, meters, prompts, subtitles, cinematic captions, letterbox. Wayfinding dims during the final chase.

### Adding content — where things live

- New room/door/item/light/sign/prop → edit `src/world/data.ts`, then `node scripts/map.mjs` to verify connectivity.
- New interactable behavior or story beat → `Director.interact()` / `promptFor()` and the cutscene methods in `Director.ts`.
- New cutscene → build a `Cutscene` (keyframed `keys` + timed `events`) and route it through `playCut`; the rail-camera/letterbox machinery is in `src/game/Cinematic.ts`.
