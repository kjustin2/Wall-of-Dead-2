# DEAD AIR — Improvement Ideas

Audit date: 2026-06-24. Grounded in the current working tree (which already has
uncommitted changes to `main.ts`, `Save.ts`, `Director.ts`, `Player.ts`, `Hud.ts`,
`AudioFX.ts`, `Post.ts`, `index.html`, `style.css`). No code changed yet — this is a plan.

Four areas were audited against your goal: (1) Escape/fullscreen, (2) save persistence,
(3) bugs + performance, (4) sound design. Findings below are ordered by impact, with
file:line evidence so each item is actionable.

---

## TL;DR — recommended order of work

1. **Verify the two "already done" features actually work in a real browser** (Escape-in-fullscreen, save-on-exit). They're in code but unproven on-screen. *Cheap, high-confidence.*
2. **Fix the handful of real bugs** — pause-during-kill-cam, one-time event flags not persisted. *Small, player-visible.*
3. **Two genuine perf/memory fixes** — Wayfinder per-frame allocation, post-composer render-target disposal. *Small, measurable.*
4. **Sound design pass** — per-category volume, convolution reverb, surface-aware footsteps, threat-driven mix, optional CC0 sample pipeline. *Biggest perceived-quality lift.*

---

## 1. Escape key / fullscreen (Goal #1)

**Status: appears already implemented in the working tree — verify, don't rebuild.**

- The Keyboard Lock API is wired so Escape no longer drops fullscreen; it's delivered to
  the in-game handler instead, which pauses/resumes. `syncKeyboardLock()` locks `["Escape"]`
  on entering fullscreen and unlocks on exit, re-run on every `fullscreenchange`.
  Evidence: `src/main.ts:628-642`, `src/main.ts:739-743`, Escape handler `src/main.ts:531-535`.
- Pointer-lock ↔ pause coupling and involuntary-unlock (alt-tab) handling look correct and
  well-separated. Evidence: `src/main.ts:517-548`.

**What to actually do:**
- [ ] **Prove it on-screen** (per our verification rule): in a real Chromium/Electron build,
  go fullscreen, press Escape, confirm the pause menu opens and fullscreen is *retained*.
  Keyboard Lock is Chromium/Electron-only — confirm the intended ship target matches.
- [ ] **Graceful fallback messaging** for browsers without Keyboard Lock (Firefox/Safari):
  there Escape *will* exit fullscreen natively. Decide whether to (a) accept it, or (b) bind
  the pause menu to a second key (e.g. `Tab` or `P`) as a documented alternative so the menu
  is still reachable.
- [ ] **Minor UX gap:** there's no fullscreen toggle inside the *pause* menu — only in Options.
  Consider adding one so players can go fullscreen without quitting to title. (`src/main.ts:693`
  has the Options toggle to mirror.)

---

## 2. Save persistence on exit (Goal #2)

**Status: appears already implemented — verify the exit paths.**

- Save-on-exit is wired via `pagehide`, `beforeunload`, and `visibilitychange`, all calling
  `flushSave()`. Evidence: `src/main.ts:484-496`.
- A silent 25-second autosave fills the gaps between sparse story checkpoints. Evidence:
  `src/main.ts:821-827`.
- `quitToTitle()` and `exitGame()` both flush before tearing down. Evidence: `src/main.ts:446-459`,
  `src/main.ts:465-479`.
- `snapshot()` correctly refuses to write during death/chase/over so you can't persist an
  unwinnable mid-death state. Evidence: `src/game/Director.ts:132-134`.
- Storage is versioned (`deadair.save.v1`) and try/catch-guarded. Evidence: `src/core/Save.ts:7-69`.

**What to actually do:**
- [ ] **Verify each exit path writes**: tab-close mid-run, alt-tab/minimize, OS sleep, and the
  in-game EXIT button. Open DevTools → Application → localStorage and confirm `deadair.save.v1`
  updates. `beforeunload` is unreliable on mobile; `pagehide`/`visibilitychange` are the load-bearing
  ones — keep them.
- [ ] **One real gap (see Bugs §3.2):** only `cs_`-prefixed cutscene flags are persisted, so some
  one-time events replay after a reload. Fold that fix in here.
- [ ] **Optional clarity cleanup:** the `flushSave()` guard is a confusing double-negative
  (`if (state !== "playing" && state !== "paused") return;`, `src/main.ts:485`). Rewrite as the
  positive form. Logic is correct today; this is readability only.

---

## 3. Bugs to fix

### 3.1 Pause menu can appear during the kill-cam (Low, player-visible)
`pauseGame()` only guards on `state !== "playing"`, not `director.dying`. During the ~2.1s kill-cam,
state is still `"playing"`, so pressing Escape pops the pause menu on top of the death animation
before the death screen replaces it. Evidence: `src/main.ts:517-526`, kill timer `Director.kill()`.
**Fix:** `if (state !== "playing" || director.dying) return;`

### 3.2 One-time event flags don't survive save/restore (Low, immersion)
Only flags starting with `cs_` are persisted; `firstslam`, `gotbottles`, `lowbat`, `maint_scare`,
etc. are dropped. Reach one of those, reload before the next checkpoint, and its subtitle/stinger
fires again. Evidence: `src/core/Save.ts:115` / `src/game/Director.ts:115`
(`seen: [...this.flags].filter(f => f.startsWith("cs_"))`).
**Fix:** persist the full one-shot flag set (or an explicit allow-list), restore it on load.

### 3.3 Redundant `exitPointerLock()` when already unlocked (Very low, cleanup)
When pointer-lock is lost involuntarily, the handler calls `pauseGame()`, which calls
`document.exitPointerLock()` again though the lock is already gone. Harmless but fragile.
Evidence: `src/main.ts:524` + `src/main.ts:540`.
**Fix:** guard with `if (input.locked) ...`.

### 3.4 Save-position-vs-changed-world edge case (Very low, watch only)
Restore snaps the player to a cell center; if the world changed since the snapshot (a door that
locked after power), they could spawn just inside geometry and get pushed out by collision next
frame. No crash, possible one-frame jitter. Worth a regression probe, not an urgent fix.

> No game-breaking logic bugs were found in the state machine, cutscene interrupts, creature FSM,
> or save/restore — the architecture is sound. These are all polish-tier.

---

## 4. Performance & memory

Headless baseline is healthy (draw calls 34–243 vs 420 budget; tris 106k–133k vs 1.6M; CPU
0.15–0.43 ms/frame). Real-device cost is dominated by the two items below; the rest is micro.

### 4.1 Per-frame Vector3 allocation in Wayfinder (High value, 5-min fix)
`const toTarget = this.target.clone().sub(camera.position);` allocates a Vector3 **every frame**
even though the class already holds a reusable `tmpV`. Steady GC pressure on the hottest path.
Evidence: `src/ui/Wayfinder.ts:66`.
**Fix:** `this.tmpV.copy(this.target).sub(camera.position);`

### 4.2 Post composer render targets not disposed on quality change (High value, memory)
`Post.applyScale()` calls `composer.setSize()` on tier/scale changes without disposing the old
internal render targets — a leak that accumulates across auto-tune and pause-menu quality toggles.
The flashlight shadow map *does* dispose correctly (`src/main.ts:172-178`); mirror that here.
Evidence: `src/core/Post.ts:158-174`.
**Fix:** dispose prior composer render targets before resizing; verify with `renderer.info.memory`.

### 4.3 Canvas textures not disposed on scene reset (Medium, leak on repeated runs)
Sign/portrait/note/flesh/glow `CanvasTexture`s are created but never explicitly disposed. Currently
masked because "NEW GAME" does a full `location.reload()`. If we ever switch to in-place restart,
this leaks. Evidence: `src/world/Builder.ts:59-76`.
**Fix:** track and dispose on world teardown — or keep relying on reload and document that.

### 4.4 Throwaway vectors in `throwBottle()` (Low)
Two Vector3 allocations per throw. On user action, not per-frame — low priority. Evidence:
`src/main.ts:273-275`.

### 4.5 Scattered `Math.random()` flicker (Low)
Multiple `Math.random()` calls per frame across light/item updates. Cheap individually; could be
a single seeded-noise value for determinism (and easier visual-diffing). Evidence: `src/main.ts:354-355`.

> LOS ray-march (~85 steps/check) and chase repathing (BFS every 0.35s) were reviewed and are
> **fine as designed** — measured CPU is low. Leave them.

---

## 5. Sound design & effects (Goal #4)

This is the area with the most headroom. The synthesis is genuinely good (drones, heartbeat,
chase pulse, lift, radio voice, kill-scream — all procedural, see `src/core/AudioFX.ts`), and the
working tree already adds a master limiter, pause-duck, and a cheap feedback-delay reverb
(`AudioFX.ts:40-73`). Master volume exists in Options. The gaps are about *mix control*,
*spatial realism*, and *variation*.

### 5.1 Per-category volume buses (High ROI, quick)
Today there's only a master gain. Creature clicks/growls can bury the radio-voice story beats.
**Add** separate `GainNode` buses for **Ambient / Creature / Voice / UI**, each with an Options
slider, persisted alongside the existing master volume. Evidence: single bus today, master slider
`index.html:159-163`, `src/main.ts:730-735`.

### 5.2 Convolution reverb per space (High ROI, transforms immersion)
The current "reverb" is one global feedback delay, so every room sounds identical. Swap in a
`ConvolverNode` keyed off the current room/zone (`Level.worldToCell()` already gives us the room).
Needs 2–3 short CC0 impulse responses (bunker hall, metal room, confined space). Evidence:
`src/core/AudioFX.ts:56-73`.

### 5.3 Surface-aware footsteps (Medium, data-driven)
`stepPlayer()`/`stepStalker()` use one filtered-noise template regardless of surface; crouch only
changes gain, not timbre. Drive filter profiles (metal grating / concrete / tile) from level cell
data — no new synthesis, just different filter curves. Evidence: `src/core/AudioFX.ts:300-314`.

### 5.4 Threat-driven mix (Medium, big atmosphere win)
Threat level currently only changes heartbeat interval. Extend it to bend drone pitch, shift
ambient filter center, vary chase-pulse fill density, and emit different cues per Stalker state
(`dormant`/`roam`/`investigate`/`search`/`chase`). Evidence: `src/core/AudioFX.ts:196-276`,
state machine `src/game/Stalker.ts`.

### 5.5 Spatial polish (Medium)
`spat()` only pans L/R by yaw. Add **distance-based low-pass** (far creatures lose highs),
optional **obstruction attenuation** through closed doors, and inverse-square (not linear)
distance falloff. Big believability gain for the creature audio. Evidence: `src/core/AudioFX.ts`
`spat()` and `creatureNear()` 316-334.

### 5.6 Dialogue ducking (Low, easy)
Duck heartbeat/ambient ~0.5× while `radioVoice()` / cutscene captions play, then restore. Pure gain
automation on existing layers. Evidence: `src/core/AudioFX.ts:431-461`.

### 5.7 Optional: CC0 sample pipeline (Medium effort, unblocks fast iteration)
Everything is synthesized today — fast boot, tiny footprint, but a synth bug hits *every* instance
and you can't quickly drop in a better recording. Extend the existing CC0 fetch pattern
(`fetch-assets.mjs` already pulls ambientCG/Poly Haven textures+models with graceful fallback) to
an optional `public/audio/` + manifest. Keep procedural as the guaranteed fallback so dev/CI never
depend on the download.
- **Keep files small:** mono, short, `.webm`/Opus (~10–30 KB each). A handful of footstep variants
  per surface + 2–3 impulse responses is plenty.
- **Good CC0 sources:** Freesound (filter to CC0), OpenGameArt, Sonniss GDC packs. Verify each
  clip is genuinely CC0/public-domain before committing.
- **Where it pays off first:** footstep variation (4 samples per surface kills the "machine-gun"
  repetition) and the room impulse responses for §5.2.

---

## 6. Test/regression coverage to add alongside the fixes

Per our "regression probe for every bug" rule:
- [ ] e2e/`check()` asserting Escape in fullscreen → state becomes `paused` and `document.fullscreenElement` is still set.
- [ ] e2e asserting `flushSave()` writes `deadair.save.v1` on a simulated `visibilitychange`/`pagehide`.
- [ ] e2e asserting one-time flags (e.g. `gotbottles`) are present after restore.
- [ ] perf probe asserting `renderer.info.memory.textures` doesn't grow across repeated quality toggles (catches §4.2).
- [ ] An audio-state assertion (or `agent/options-shot.mjs` extension) that per-category volumes persist and apply.

---

## Appendix — what's already solid (don't touch)

- GameState machine, cutscene interrupts, pointer-lock/pause separation, creature FSM.
- Save versioning, autosave cadence, death/win refusing to overwrite a good checkpoint.
- Procedural audio synthesis quality and the new limiter/pause-duck mixing chain.
- Headless perf budgets — all green; LOS and chase repathing are correctly tuned.
