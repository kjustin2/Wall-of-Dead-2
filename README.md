# DEAD AIR

A first-person stealth-horror short, built with **Three.js + Vite + TypeScript**.
No guns, no score — your flashlight is both your lifeline and the thing that
gets you killed. It is told through a strong four-act story, in-engine cutscenes,
and clear wayfinding so you always know where the dread is pointing you.

> Repeater 4 went silent nine days ago, but the surface feed still loops the same
> survivor count: 312. Two breaker fuses were pulled from the generator rack —
> pulled, not blown. You are the line tech they sent down to put them back.
> Control says it's a routine repair.

## Play

```powershell
npm install
npm run assets   # one-time: fetch the CC0 textures + models (see "Assets" below)
```

### Standalone desktop app (no browser)

```powershell
npm run standalone
```

Builds the game and launches it in its own **desktop window** (Electron).

### In a browser (dev server, with hot-reload)

```powershell
npm run dev
```

Open the printed URL. Click **DESCEND**. Headphones strongly recommended — every
sound is procedural WebAudio and the audio *is* the threat-detection UI. Cutscenes
are skippable with any key. Graphics auto-tune; override the tier from the pause
menu (**Esc → GRAPHICS**), and it's remembered.

The game **auto-saves at every story beat** (you'll see a brief *✓ checkpoint*).
The title screen offers **CONTINUE**; death drops you straight back to the last
checkpoint. Saves and your graphics choice persist in the browser.

## The story (four acts)

You are **Cass Reyes**, a line technician. **Vesna**, the surface dispatcher,
rides along on the radio.

1. **Descent (Duty).** The lift drops you into the lower concourse. Vesna briefs
   you: refit two breaker fuses, restart the broadcast, ride up. Routine.
2. **Doubt.** The station is wrong. The third-shift log says it hunts light. On
   the platform you *see it* for the first time. Refit the fuses — power floods
   back, then dies. The feed was never coming from the surface. The only new way
   is *down*.
3. **Revelation.** Below: the **intake archive** — a wall of faces, a ledger of
   everyone sent down, each line ending *did not return*, the last one already
   filled in with your name. At the **repeater core**, re-arm the broadcast: the
   lure goes back out, and it stops pretending to be far away.
4. **Flight.** The hatch only releases once the signal is live again — to leave,
   you must first call your replacement. Run all the way back up, slamming the
   fire doors behind you.

The broadcast is not a survivor count. It is the count of the consumed, and a
lure to bring the next one down. See `DESIGN.md` for the full design.

## What hunts you

One creature — **the Tallyman**. It roams, it listens, and above all it **watches
for light**:

- Your **torch (F)** is visible from very far away, from any direction.
- **Sprinting** is loud; **crouching (CTRL)** in the dark makes you near-invisible.
- **Thrown bottles (Q)** smash loudly — a sound can stand where you are not.
- Doors slow it; **fire doors** hold for a few seconds before it bashes through.
- If it locks on, break line of sight and outrun it (you're slightly faster).

## Wayfinding

You should never be lost, only afraid. A **compass pip** shows the bearing to
your objective; an on-screen **diamond marker** becomes an **edge arrow** when
the objective is off-screen; a faint **diegetic beacon** glints at the goal; and
the **signage** at the concourse hub points down each spoke. Wayfinding fades
during the final chase — by then you already know where you're going: out.

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
| Skip cutscene | any key |
| Pause / graphics | Esc |

## Assets

The look is driven by **CC0 (public-domain) assets**, fetched on demand and
git-ignored (`npm run assets`). PBR materials from **ambientCG**, props from
**Poly Haven**, a rigged humanoid creature. Sources are in `CREDITS.md`. If the
assets are absent the game still runs on flat-colour materials and a procedural
primitive creature (so CI never depends on the download).

## Verify

```powershell
npm run typecheck
npm run build
node scripts/map.mjs   # render + connectivity-check the level (no server needed)
# with the dev server running in another terminal:
npm run smoke      # boots headless, plays the intro + a few seconds, screenshots
npm run test:e2e   # scripted playthrough: fuses -> power -> core -> chase -> escape, + death
npm run tour       # screenshots key locations for visual review (scripts/shots/)
```

Headless scripts drive system Edge via `puppeteer-core` (no browser download) and
run at `?lowfx` by default — the full post stack is too heavy for headless
software GL. Note the dt-capped game clock advances slower than wall-time under
headless GL, so cutscene-dependent assertions use generous real-time timeouts.

## Architecture

- `src/world/data.ts` — the whole level as data: a hub-and-spoke map of carved
  room rects, doors, items, lights, signs, AI waypoints, and `NAV` anchors.
- `src/world/Level.ts` — grid model: collision, line-of-sight, BFS pathfinding,
  doors, noise events.
- `src/world/Builder.ts` — builds the Three.js scene from data (PBR materials,
  GLB props, lift cage, pipes, signage).
- `src/core/Assets.ts` — loads CC0 PBR materials + GLB models; fallbacks if absent.
- `src/core/Save.ts` — checkpoint save system + persisted settings (localStorage).
- `src/core/Post.ts` — post stack: GTAO, bloom, DoF, tone-map, AA, grade, grain.
- `src/core/AudioFX.ts` — 100% procedural WebAudio: drones, footsteps, heartbeat,
  door slams, the broadcast voice, the lift.
- `src/game/Player.ts` — movement, stamina, crouch, head-bob, battery, noise.
- `src/game/Stalker.ts` — the creature: dormant/roam/investigate/search/chase,
  light-first perception, door bashing, and a cutscene "reveal" hold.
- `src/game/Cinematic.ts` — the cutscene system: a rail camera (keyframed,
  smoothstepped) with letterbox + timed events.
- `src/game/Director.ts` — the story state machine: acts, the six cutscene beats,
  objectives, the Vesna radio character, win/death.
- `src/ui/Wayfinder.ts` — compass pip + on-screen marker / off-screen edge arrow.
- `src/ui/Hud.ts` — meters, prompts, subtitles, cinematic captions, letterbox.
- `scripts/map.mjs` — ASCII map renderer + connectivity verifier for `data.ts`.

## Design rules

- A light should feel useful and costly. This threat can't be killed at all.
- Darkness creates tension but never makes interaction unreadable: pickups glint,
  exit signage glows, the beacon marks the goal.
- The story is told by the place — broadcasts, a wall of intake photographs, an
  operator's chair at a dead mic — as much as by the cutscenes.
- You may be afraid, but you are never lost.
