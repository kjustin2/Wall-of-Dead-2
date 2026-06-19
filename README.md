# DEAD AIR

A first-person stealth-horror short, built with **Three.js + Vite + TypeScript**. No guns, no score — your flashlight is both your lifeline and the thing that gets you killed.

> Repeater 4 went silent nine days ago, but the surface feed still loops the same
> survivor count: 312. Two breaker fuses were pulled from the generator rack —
> pulled, not blown. You are the one they sent down to put them back.

## Play

```powershell
npm install
npm run assets   # one-time: fetch the CC0 textures + models (see "Assets" below)
```

### Standalone desktop app (no browser)

```powershell
npm run standalone
```

Builds the game and launches it in its own **desktop window** (Electron) — no browser, no dev server to open by hand. Close the window to quit.

### In a browser (dev server, with hot-reload)

```powershell
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

Either way: click **DESCEND**. Headphones strongly recommended — every sound is procedural WebAudio and the audio *is* the threat-detection UI. Graphics auto-tune for your machine; override the tier any time from the pause menu (**Esc → GRAPHICS**).

## The story (≈4 acts)

1. **Arrival.** You came down the access shaft; the lift and the surface hatch are dead until the grid is live.
2. **The station.** Explore the dark substation and find **two breaker fuses**; refit them at the generator rack to bring the grid up.
3. **The truth, below.** Power unlocks the **service stair**. The broadcast was never coming from the surface — it comes from a sub-level the station was built to hide. Find what's down there, and restore the signal at the **repeater core**.
4. **Get out.** The signal goes back out, the way up unlocks, and it stops pretending to be far away. Run all the way back to the surface hatch — **slam the fire doors behind you**.

## What hunts you

One creature. It roams, it listens, and above all it **watches for light**:

- Your **torch (F)** is visible to it from very far away, from any direction. Battery is scarce.
- **Sprinting** is loud; **crouching (CTRL)** in the dark makes you nearly invisible.
- **Thrown bottles (Q)** smash loudly — a sound can stand somewhere you are not.
- Doors can be closed in its face. Ordinary doors barely slow it. Fire doors hold for a few seconds.
- If it locks on, outrun it (you are slightly faster at full sprint) and break line of sight.

When its eyes catch the light, it is looking at you.

## Controls

| Action | Input |
| --- | --- |
| Move | WASD / arrows |
| Look | Mouse |
| Sprint | Shift (stamina) |
| Crouch | Ctrl or C |
| Torch | F |
| Interact / read | E |
| Throw bottle | Q |
| Pause / graphics | Esc |

## Assets

The look is driven by **CC0 (public-domain) assets**, fetched on demand and git-ignored:

```powershell
npm run assets            # download everything (idempotent)
npm run assets -- --force # re-download
```

- PBR materials (concrete / metal / rust / wood / tile) from **ambientCG**.
- Props (crate, drum, desk, bench) from **Poly Haven**.
- The creature is a rigged humanoid (Mixamo "Xbot" via the three.js examples), redressed in-engine.

Sources are listed in `CREDITS.md`. If the assets are absent the game still runs on flat-colour materials and the procedural primitive creature (so CI never depends on the download).

## Verify

```powershell
npm run typecheck
npm run build
# with the dev server running in another terminal:
npm run smoke      # boots the game headless, plays a few seconds, screenshots
npm run test:e2e   # scripted full playthrough: fuses -> power -> core -> chase -> escape, plus death path
npm run tour       # screenshots key locations for visual review (scripts/shots/)
```

The headless scripts drive the system Microsoft Edge via `puppeteer-core` (no browser download). They run at `?lowfx` by default — the full post-processing stack is too heavy for headless software GL; `?lowfx` still exercises the real composer, while `tour` runs at full quality for visuals.

## Architecture

- `src/world/data.ts` — the whole level as data: carved room rects, doors, items, lights, signs, AI waypoints. 1 cell = 2 m.
- `src/world/Level.ts` — grid model: collision, line-of-sight, BFS pathfinding, doors, noise events (regenerates from `data.ts`).
- `src/world/Builder.ts` — builds the Three.js scene from data, using the loaded PBR materials and GLB props.
- `src/core/Assets.ts` — loads the CC0 PBR materials + GLB models; flat-colour / primitive fallbacks when absent.
- `src/core/Post.ts` — post-processing: GTAO, bloom, depth-of-field, tone-mapping, AA, chromatic-aberration + vignette + cold film grade, grain. Quality tiers + auto-tune.
- `src/game/Player.ts` — movement, stamina, crouch, head-bob, battery, footstep noise.
- `src/game/Stalker.ts` — the creature: dormant / roam / investigate / search / chase, light-first perception, door bashing; rigged GLB driven by the state machine.
- `src/game/Director.ts` — pacing: act beats, zone scares, objectives, power-on, the core/broadcast, the final chase, win/death.
- `src/core/AudioFX.ts` — 100% procedural WebAudio: drones, footsteps, heartbeat keyed to threat, door slams, the broadcast voice.
- `scripts/fetch-assets.mjs` — reproducible CC0 asset download.
- `electron/main.cjs` — standalone desktop launcher: serves the built `dist/` over localhost and opens it in an Electron window.

## Design rules

- A light should feel useful and costly. Some threats are better escaped than killed — this one can't be killed at all.
- Darkness creates tension but never makes interaction unreadable: pickups glint faintly, exit signage glows.
- The story is told by the place — broadcasts, a wall of intake photographs, an operator's chair at a dead mic — more than by notes.
