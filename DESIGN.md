# DEAD AIR — rebuild design (source of truth)

Same principles as the original: first-person stealth-horror, no combat, one
creature that **hunts light first, sound second**, 100% procedural audio,
flashlight as lifeline-and-liability. Engine substrate (renderer, post-FX,
audio, player, Stalker AI, Level grid) is **kept**. Everything below — story,
map, cutscenes, wayfinding — is **rebuilt**.

The four goals driving this rebuild:
1. **Strong story** — a named protagonist with an arc, a radio character, a
   real mid-game revelation. Not just ambient subtitles.
2. **Clear pathing** — a wayfinding system: HUD compass + off-screen objective
   marker, a diegetic guiding glow, and signage that points.
3. **Cool cutscenes** — an in-engine cinematic system (rail camera, letterbox,
   timed dialogue) with ~6 set-piece beats.
4. **Good maps** — a larger, legible hub-and-spoke level you can map mentally.

---

## Characters

- **Cass Reyes** — you. A line technician for the Mesa Relay Authority. Silent;
  reacts through first-person "thought" subtitles. Believes this is a routine
  repair.
- **Vesna** — surface dispatcher ("Control"), heard over the radio. Warm and
  procedural at first; her signal degrades as you descend. Her last transmission
  is the knife: she reads the survivor count the way you'd read a name into a
  ledger. (Was Control ever really up there?)
- **The Tallyman** — the creature. Unnamed in dialogue; the notes call it
  different things. It is the station's mechanism for keeping the count. It does
  not chase at first — it **watches** your light.

## Premise & theme

Repeater 4 rebroadcasts the regional survivor count to the surface. It went
silent nine days ago, but the surface feed still loops **"SURVIVORS BELOW: 312."**
You're sent down to refit two pulled breaker fuses and restart the broadcast.

The truth, revealed across the acts: the station was built over something, and
the count never changes because **the place does not let anyone leave**. Every
technician sent down is added to "below" and subtracted from nothing. The
broadcast is not a report — it is a **lure**, looping to call the next one down.
Restarting it doesn't save anyone; it rings the dinner bell. And the hatch is
wired to the broadcast: to climb out, you must first re-arm the thing that will
summon your replacement.

## Acts & the player's arc

- **Act I — Descent (Duty).** Arrive by lift. Vesna briefs you. Objective:
  restore main power — find the two breaker fuses. Hope: fix it, go home.
- **Act II — Doubt.** The station is wrong. The third-shift log says it hunts
  light. On the platform you **see it** for the first time (cutscene). Refit the
  fuses; power floods back — then dies; the speakers cough static. The feed
  isn't coming from the surface. The way out is sealed; the only new path is
  *down*.
- **Act III — Revelation.** Below: the **intake archive** — a wall of faces,
  the ledger of everyone sent down, each line ending *did not return*, and the
  last entry already filled in with your name (cutscene). At the **repeater
  core**, re-arm the broadcast (cutscene): the lure goes back out, and it stops
  pretending to be far away.
- **Act IV — Flight.** The hatch releases. Run all the way back up — core →
  stair → concourse → lobby → shaft — slamming fire doors behind you, the
  Tallyman in full pursuit.

## Endings

- **Escape.** You climb out into grey surface light. Behind you the repeater is
  broadcasting again, clear and calm. The feed updates: **"SURVIVORS BELOW:
  313."** You got out. The count did not. You do not ask who it just added.
- **Death.** Forced eye contact, then dark. The feed keeps looping 312. The
  number does not change — it never had to.

---

## Map — hub-and-spoke vertical descent (1 cell = 2 m)

Legible by design: everything radiates from the central **Concourse**. Signage
and the wayfinder point along each spoke; you always return to the hub.

```
UPPER STATION
                 [SHAFT HEAD / LIFT]      <- arrive here; escape here (hatch)
                        | (fire)
                    [ARRIVALS LOBBY]
                        | (fire)
   [MAINTENANCE]---[ LOWER CONCOURSE ]---[ PLATFORM 2 ]      [GENERATOR HALL]
     fuse A          (HUB)                 fuse B  -------------+ breaker rack
                        | (locked: power)        (genAccess)
                   [SERVICE STAIR]  (down)
SUB-LEVEL               |
                  [ INTAKE ARCHIVE ]---[PUMP ROOM]
                        |  (wall of faces, ledger)
                   [REPEATER CORE]   console: re-arm broadcast
```

Spokes from the Concourse: **◄ MAINTENANCE** (W, fuse A), **PLATFORM ►** (E,
fuse B + first sighting), **GENERATOR ▲** (NE, breaker rack), **SERVICE STAIR ▼**
(S, unlocks on power). The escape is a clean vertical sprint with three fire-door
chokes: stair → concourse → lobby → shaft → hatch.

Zone identity (so players build a mental map): Concourse = warm amber; Platform
= cold blue; Generator = amber (lit on power); Sub-level = sickly grey-green,
failing; Exit/Shaft = green glow.

## Cutscenes (cinematic system: rail camera + letterbox + timed dialogue)

- **C1 Descent** (title → game): the lift cage descends the shaft, Vesna's
  briefing crackles in, the cage clanks to a stop, doors open into the dark.
  Hands control in the shaft head. Sets tone + first objective.
- **C2 First sighting** (enter platform): forced slow pan to the far end where
  something sitting very still stands up and faces your light. Snaps back to
  control. Always lands.
- **C3 Power-on** (refit fuses): station lights surge then brown out, speakers
  cough static and die, the service-stair seal releases; camera tilts *down*
  toward the new way — reframes the goal downward.
- **C4 Archive** (enter intake): camera drifts along the wall of photographs,
  settles on the ledger and your own pre-filled name. Held, quiet dread.
- **C5 Re-arm** (core console): push into the screen as the broadcast goes back
  out, every speaker at once; a one-frame cut to the creature's vantage; the
  chase begins.
- **C6 Escape / Death**: rise out of the hatch into surface light, Vesna's last
  line, the count updates. Death = the existing kill-cam, enhanced with
  letterbox + the looping count.

## Wayfinding

- **Compass strip** (top HUD): cardinal ticks + a marker at the current
  objective's bearing; fades as you arrive.
- **Off-screen objective arrow**: when the objective beacon isn't on screen, an
  arrow at the screen edge points to it.
- **Diegetic beacon**: a soft vertical glint at the active objective (subtle,
  horror-appropriate — "the torch knows where to look").
- **Signage that points** at the hub; objective text crisp and tied to a marker.
- Wayfinder dims/hides during chase (you already know where you're going: out).

## Build order

1. ✅ Design spine (this file).
2. New map data (`data.ts`) + connectivity verify (`scripts/map.mjs`).
3. Cinematic system (`Cutscene.ts`) + letterbox + main-loop cinematic state.
4. Wayfinding (`Wayfinder.ts`, compass + marker + beacon) + HUD.
5. New `Director.ts` — story state machine wiring acts ↔ cutscenes ↔ objectives.
6. Audio additions (radio dialogue cues, cinematic stingers).
7. Polish, typecheck, build, smoke/e2e, commit.
