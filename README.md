# DEAD AIR

A first-person stealth-horror vertical slice, built with **Three.js + Vite + TypeScript**. No guns, no score — your flashlight is both your lifeline and the thing that gets you killed.

> Repeater 4 went silent nine days ago, but the surface feed still loops the same
> survivor count: 312. Two breaker fuses were pulled from the generator rack —
> pulled, not blown. You are the one they sent down to put them back.

## Play

```powershell
npm install
npm run dev
```

Open the printed URL (default `http://localhost:5173`), click **DESCEND**. Headphones strongly recommended — every sound is procedural WebAudio and the audio *is* the threat-detection UI.

## The loop

1. Explore the dark substation and find **two breaker fuses**.
2. Refit them at the generator rack to restore power and restart the broadcast.
3. Survive the escape: sprint the emergency corridor and **slam the fire doors behind you** — each one buys seconds while it bashes through.

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
| Pause | Esc |

## Verify

```powershell
npm run typecheck
npm run build
# with the dev server running in another terminal:
npm run smoke      # boots the game headless, plays a few seconds, screenshots
npm run test:e2e   # scripted full playthrough: fuses -> power -> chase -> win, plus death path
npm run tour       # screenshots key locations for visual review (scripts/shots/)
```

The headless scripts use `puppeteer-core` driving the system Microsoft Edge — no browser download needed.

## Architecture

- `src/world/data.ts` — the whole level as data: carved room rects, doors, items, lights, signs, AI waypoints. 1 cell = 2 m.
- `src/world/Level.ts` — grid model: collision, line-of-sight, BFS pathfinding, doors, noise events.
- `src/world/Builder.ts` — builds the Three.js scene from data; all textures are canvas-generated, no asset files.
- `src/game/Player.ts` — movement, stamina, crouch, head-bob, battery, footstep noise.
- `src/game/Stalker.ts` — the creature: dormant / roam / investigate / search / chase, light-first perception, door bashing.
- `src/game/Director.ts` — pacing: zone scares, objectives, the power-on sequence, the final chase, win/death.
- `src/core/AudioFX.ts` — 100% procedural WebAudio: drones, footsteps, heartbeat keyed to threat, door slams, the broadcast voice.

## Design rules carried into this slice

- A light should feel useful and costly. Some threats are better escaped than killed — this one can't be killed at all.
- Darkness creates tension but never makes interaction unreadable: pickups glint faintly, exit signage glows.
- Narrative is short and unsettling: three notes, one broadcast, no cutscenes.
