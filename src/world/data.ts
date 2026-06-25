/**
 * DEAD AIR — rebuilt level: "Repeater 4 Substation".
 * Hub-and-spoke VERTICAL DESCENT, authored as carved rectangles on a cell grid
 * (1 cell = 2 m). Row 0 is north (-Z); the map reads top→bottom = the descent.
 * World position of a cell centre = (cx*2+1, cy*2+1)  i.e. world = cx*CELL + CELL/2.
 *
 * The shape teaches itself: you arrive at the top, walk a real ARRIVAL sequence
 * (lift → hall with lockers + a break room → lobby) before you ever reach the
 * central CONCOURSE hub. Three spokes lead off the hub (Maintenance W, Platform E,
 * Generator NE); the Service Stair drops S into the sub-level (Intake archive +
 * Repeater core). You always return to the hub, so a big map stays legible.
 *
 *                    [ SHAFT HEAD / LIFT ]   arrive + escape (hatch)
 *                            | fire
 *        [LOCKER BAY]--[ ARRIVAL HALL ]--[ BREAK ROOM ]
 *                            | fire
 *                       [ ARRIVALS LOBBY ]
 *                            |
 *  [MAINT]--[corrW]--[ LOWER CONCOURSE (HUB) ]--[corrE]--[ PLATFORM 2 ]--[GEN HALL]
 *   fuse A                   | locked: power           fuse B + sighting   breakers
 *   +closet(scare)           |
 *                       [ SERVICE STAIR ]  (scare on the descent)
 *                            |
 *                       [ SUB LANDING ]
 *                            |
 *             [ INTAKE / ARCHIVE ]   wall of faces, ledger
 *                  |          |
 *            [REPEATER CORE]  [PUMP]
 *             console: re-arm broadcast
 */

export const CELL = 2;
export const GRID_W = 64;
export const GRID_H = 84;
export const WALL_H = 3;

export interface RectDef { x: number; y: number; w: number; h: number; name?: string }

export const ROOMS: RectDef[] = [
  // --- Act I: arrival (north) ---
  { x: 26, y: 3, w: 12, h: 5, name: "shaft" },        // shaft head / lift (entry + exit)
  { x: 30, y: 9, w: 4, h: 10, name: "arrivalHall" },  // long arrival corridor (lockers, signage)
  { x: 24, y: 10, w: 5, h: 4, name: "lockerBay" },    // dead-end nook off the hall (W)
  { x: 35, y: 10, w: 7, h: 7, name: "breakRoom" },    // break room (E) — environmental story
  { x: 26, y: 20, w: 12, h: 4, name: "lobby" },       // arrivals lobby
  // --- hub ---
  { x: 18, y: 25, w: 26, h: 15, name: "concourse" },  // central hub
  // --- west spoke: maintenance ---
  { x: 12, y: 31, w: 5, h: 3, name: "corrW" },        // west spoke corridor
  { x: 3, y: 27, w: 8, h: 10, name: "maint" },        // maintenance wing (fuse A)
  { x: 4, y: 38, w: 4, h: 3, name: "toolCloset" },    // dark dead-end (scare: hang)
  // --- east spoke: platform + generator ---
  { x: 45, y: 31, w: 7, h: 3, name: "corrE" },        // long east approach (scare: dart sightline)
  { x: 53, y: 24, w: 9, h: 17, name: "platform" },    // platform 2 (fuse B, first sighting)
  { x: 53, y: 17, w: 9, h: 6, name: "genHall" },      // generator hall (breaker rack), N of platform
  // --- down: service stair + sub-level ---
  { x: 28, y: 41, w: 5, h: 12, name: "serviceStair" },// stair down (locked until power)
  { x: 26, y: 54, w: 9, h: 4, name: "subLanding" },   // sub-level landing
  { x: 14, y: 59, w: 28, h: 9, name: "intake" },      // intake / archive hall (the wall of faces)
  { x: 16, y: 69, w: 12, h: 7, name: "core" },        // repeater core (console)
  { x: 32, y: 69, w: 7, h: 6, name: "pump" }          // side pump room
];

export type DoorKind = "normal" | "fire";

export interface DoorDef {
  id: string;
  cx: number;
  cy: number;
  /** travel axis through the doorway */
  axis: "x" | "z";
  kind: DoorKind;
  open?: boolean;
  locked?: boolean;
  lockedText?: string;
}

export const DOOR_DEFS: DoorDef[] = [
  // vertical escape spine (fire-door chokes), top to bottom
  { id: "d_lift", cx: 31, cy: 8, axis: "z", kind: "fire", open: true },
  { id: "d_lobby", cx: 31, cy: 19, axis: "z", kind: "fire", open: true },
  // arrival side rooms
  { id: "d_locker", cx: 29, cy: 11, axis: "x", kind: "normal", open: true },
  { id: "d_break", cx: 34, cy: 12, axis: "x", kind: "normal" },
  // hub spokes
  { id: "d_concN", cx: 31, cy: 24, axis: "z", kind: "normal", open: true },
  { id: "d_concW", cx: 17, cy: 32, axis: "x", kind: "normal", open: true },
  { id: "d_maint", cx: 11, cy: 32, axis: "x", kind: "normal" },
  { id: "d_closet", cx: 5, cy: 37, axis: "z", kind: "normal" },
  { id: "d_concE", cx: 44, cy: 32, axis: "x", kind: "normal", open: true },
  { id: "d_plat", cx: 52, cy: 32, axis: "x", kind: "normal" },
  { id: "d_gen", cx: 57, cy: 23, axis: "z", kind: "normal" },
  // service stair: sealed until the main grid is live
  {
    id: "d_stair", cx: 30, cy: 40, axis: "z", kind: "normal", locked: true,
    lockedText: "SERVICE STAIR — sealed until the main grid is live."
  },
  { id: "d_subLand", cx: 30, cy: 53, axis: "z", kind: "normal", open: true },
  { id: "d_intake", cx: 30, cy: 58, axis: "z", kind: "normal", open: true },
  { id: "d_core", cx: 22, cy: 68, axis: "z", kind: "normal", open: true },
  { id: "d_pump", cx: 34, cy: 68, axis: "z", kind: "normal" }
];

export const PILLARS: Array<[number, number]> = [
  [22, 29], [38, 29], [22, 36], [38, 36],                       // concourse
  [55, 28], [60, 28], [55, 37], [60, 37],                       // platform
  [20, 62], [28, 62], [37, 62]                                  // intake hall
];

export interface PropDef { kind: "desk" | "bench" | "crates" | "barrel"; cx: number; cy: number; rot?: number }

export const PROPS: PropDef[] = [
  // arrival
  { kind: "crates", cx: 25, cy: 13 },                  // locker bay
  { kind: "desk", cx: 39, cy: 14 },                    // break room
  { kind: "bench", cx: 36, cy: 11, rot: Math.PI / 2 },
  { kind: "bench", cx: 28, cy: 21, rot: Math.PI / 2 }, // lobby
  // maintenance
  { kind: "desk", cx: 5, cy: 28 },
  { kind: "crates", cx: 4, cy: 34 },
  { kind: "barrel", cx: 9, cy: 28 },
  // concourse
  { kind: "crates", cx: 21, cy: 27 },
  { kind: "bench", cx: 34, cy: 38, rot: Math.PI / 2 },
  { kind: "barrel", cx: 39, cy: 27 },
  // platform
  { kind: "bench", cx: 56, cy: 26, rot: Math.PI / 2 },
  { kind: "bench", cx: 59, cy: 38, rot: Math.PI / 2 },
  { kind: "crates", cx: 57, cy: 31 },
  { kind: "barrel", cx: 54, cy: 25 },
  // generator hall
  { kind: "barrel", cx: 54, cy: 18 },
  { kind: "crates", cx: 55, cy: 19 },
  // intake archive — the operator's desk faces the core
  { kind: "desk", cx: 24, cy: 64 },
  { kind: "bench", cx: 36, cy: 61, rot: Math.PI / 2 },
  { kind: "crates", cx: 18, cy: 65 },
  { kind: "barrel", cx: 15, cy: 66 },
  // repeater core
  { kind: "desk", cx: 24, cy: 73 }
];

export type ItemKind = "fuse" | "battery" | "bottles" | "note" | "panel" | "hatch" | "console";

export interface ItemDef {
  id: string;
  kind: ItemKind;
  cx: number;
  cy: number;
  label: string;
  noteTitle?: string;
  noteBody?: string;
}

export const ITEMS: ItemDef[] = [
  // ---- notes (environmental story) — placed ON the critical path so the premise
  // ---- is never missed, with a couple of optional ones rewarding exploration ----
  {
    id: "note_workorder", kind: "note", cx: 31, cy: 16, label: "work order",
    noteTitle: "Work order 7741 — Repeater 4",
    noteBody:
      "Repeater 4 went quiet nine days ago. The surface feed still loops the same survivor count: 312.\n\n" +
      "Power section says two breaker fuses were pulled from the generator rack. Pulled. Not blown.\n\n" +
      "Go down, refit them, restart the broadcast. Do not stay past one battery. Do not answer anything that knocks."
  },
  {
    id: "note_roster", kind: "note", cx: 40, cy: 12, label: "shift roster",
    noteTitle: "Break-room roster — taped to the locker",
    noteBody:
      "The roster lists three on shift. All three are crossed out in the same red grease pencil.\n\n" +
      "Below it, in a shakier hand: 'don't sign for the next rotation. there is no next rotation.'\n\n" +
      "A mug of coffee on the table grew a skin and then grew fur. Nobody clocked out."
  },
  {
    id: "note_shift", kind: "note", cx: 5, cy: 30, label: "third shift log",
    noteTitle: "Third shift log — final page",
    noteBody:
      "Mara swears it doesn't hunt sound first. It hunts light.\n\n" +
      "It stood at the end of the platform all shift, facing her torch. Not moving. When she finally switched it off, she could hear it coming closer to look.\n\n" +
      "We keep the lights broken now. Sign the log in the dark."
  },
  {
    id: "note_chalk", kind: "note", cx: 58, cy: 27, label: "chalk tally",
    noteTitle: "Chalk on the platform wall",
    noteBody:
      "Tally marks cover the tiles floor to higher than a man can reach. Four strokes and a slash, hundreds of times.\n\n" +
      "Under the count, scratched deep enough to crack the glaze:\n\n" +
      "THE COUNT STAYS AT 312 BECAUSE NOBODY LEAVES."
  },
  {
    id: "note_ledger", kind: "note", cx: 24, cy: 62, label: "intake ledger",
    noteTitle: "Intake ledger — last entries",
    noteBody:
      "The ledger lists every name sent down to fix Repeater 4. The handwriting changes a dozen times. The dates do not stop.\n\n" +
      "Each line ends the same way, in a different hand: did not return.\n\n" +
      "The final entry is yours. Someone has already filled in the last column."
  },
  {
    id: "note_core", kind: "note", cx: 22, cy: 72, label: "operator's note",
    noteTitle: "Taped to the dead mic",
    noteBody:
      "It is not a survivor count. I worked it out my last clear night.\n\n" +
      "It is the count of us. Every name the broadcast brings down is added below and taken from nothing. The signal is not a report. It is the bait.\n\n" +
      "If you restart it the way they're telling you to, you are calling the next one. I'm sorry. The hatch won't open any other way."
  },
  // ---- objective items ----
  { id: "fuse_a", kind: "fuse", cx: 6, cy: 33, label: "breaker fuse" },
  { id: "fuse_b", kind: "fuse", cx: 58, cy: 38, label: "breaker fuse" },
  { id: "panel", kind: "panel", cx: 60, cy: 18, label: "breaker rack" },
  { id: "console", kind: "console", cx: 20, cy: 71, label: "repeater core" },
  { id: "hatch", kind: "hatch", cx: 28, cy: 4, label: "surface hatch" },
  // ---- consumables ----
  { id: "bat_locker", kind: "battery", cx: 26, cy: 11, label: "torch battery" },
  { id: "bat_conc", kind: "battery", cx: 35, cy: 28, label: "torch battery" },
  { id: "bat_plat", kind: "battery", cx: 54, cy: 27, label: "torch battery" },
  { id: "bat_sub", kind: "battery", cx: 25, cy: 72, label: "torch battery" },
  { id: "bot_maint", kind: "bottles", cx: 8, cy: 35, label: "glass bottles" },
  { id: "bot_plat", kind: "bottles", cx: 60, cy: 36, label: "glass bottles" }
];

export interface LightDef {
  id: string;
  cx: number;
  cy: number;
  color: number;
  intensity: number;
  flicker?: boolean;
  off?: boolean;
}

export const LIGHT_DEFS: LightDef[] = [
  // shaft / exit: green glow
  { id: "l_shaft", cx: 31, cy: 4, color: 0x5dff8a, intensity: 6 },
  // arrival: warm, lived-in
  { id: "l_hall", cx: 31, cy: 13, color: 0xffce8e, intensity: 8, flicker: true },
  { id: "l_locker", cx: 26, cy: 12, color: 0xffd9a0, intensity: 6 },
  { id: "l_break", cx: 38, cy: 13, color: 0xffce8e, intensity: 8 },
  { id: "l_lobby", cx: 31, cy: 21, color: 0xffce8e, intensity: 7 },
  // hub: warm amber
  { id: "l_conc_a", cx: 24, cy: 29, color: 0xffc070, intensity: 14, flicker: true },
  { id: "l_conc_b", cx: 36, cy: 35, color: 0xffb060, intensity: 8 },
  // maintenance: warm
  { id: "l_maint", cx: 6, cy: 30, color: 0xffd9a0, intensity: 10 },
  // tool closet: dead (the hang sits in the dark, found by torch)
  { id: "l_closet", cx: 5, cy: 39, color: 0x9a8e7a, intensity: 0, off: true },
  // east approach + platform: cold blue
  { id: "l_corrE", cx: 48, cy: 32, color: 0xbcd0ea, intensity: 5, flicker: true },
  { id: "l_plat_n", cx: 56, cy: 27, color: 0xbcd0ea, intensity: 11, flicker: true },
  { id: "l_plat_s", cx: 58, cy: 38, color: 0xb0c4dd, intensity: 6 },
  // generator: dark until power
  { id: "l_gen", cx: 57, cy: 19, color: 0xffc070, intensity: 0, off: true },
  // service stair: cold, failing
  { id: "l_stair", cx: 30, cy: 46, color: 0xbfc6cc, intensity: 6, flicker: true },
  { id: "l_land", cx: 30, cy: 55, color: 0x9fb0a8, intensity: 5, flicker: true },
  // sub-level: sickly grey-green, dying
  { id: "l_intake_a", cx: 22, cy: 63, color: 0x9fb0a8, intensity: 6, flicker: true },
  { id: "l_intake_b", cx: 34, cy: 63, color: 0x8ea0a0, intensity: 4, flicker: true },
  { id: "l_core", cx: 20, cy: 72, color: 0x88bb99, intensity: 7 },
  { id: "l_pump", cx: 35, cy: 72, color: 0x7f9080, intensity: 4, flicker: true },
  // emergency circuit along the escape spine — off until the final run
  { id: "l_em_lobby", cx: 29, cy: 21, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_conc", cx: 33, cy: 31, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_stair", cx: 31, cy: 48, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_intake", cx: 27, cy: 61, color: 0xff3a22, intensity: 0, off: true }
];

export const WAYPOINTS: Array<[number, number]> = [
  // upper
  [31, 13], [26, 12], [38, 13], [31, 21],
  [24, 29], [30, 32], [38, 35], [21, 33], [40, 33],
  // spokes
  [6, 30], [8, 34], [5, 39], [48, 32], [56, 27], [58, 38], [57, 19],
  // sub-level
  [30, 46], [30, 55], [22, 63], [34, 63], [20, 73], [35, 73]
];

export interface SignDef { text: string; cx: number; cy: number; face: "n" | "s" | "e" | "w"; color?: string }

const GREEN = "#56d877";
const BLUE = "#7da0c0";
const RED = "#b0543c";

export const SIGNS: SignDef[] = [
  // arrival / exit
  { text: "SURFACE HATCH", cx: 28, cy: 3, face: "s", color: GREEN },
  { text: "◄ EXIT", cx: 31, cy: 9, face: "n", color: GREEN },
  { text: "ARRIVALS", cx: 31, cy: 23, face: "s" },
  { text: "BREAK ROOM ►", cx: 34, cy: 11, face: "e" },
  // hub wayfinding (readable from the concourse)
  { text: "◄ MAINTENANCE", cx: 18, cy: 30, face: "w" },
  { text: "PLATFORM 2 ►", cx: 43, cy: 30, face: "e" },
  { text: "LIFT ▲ SURFACE", cx: 31, cy: 25, face: "n", color: GREEN },
  { text: "SERVICE STAIR ▼", cx: 30, cy: 39, face: "s", color: RED },
  { text: "REPEATER 4", cx: 36, cy: 25, face: "n", color: BLUE },
  // spokes
  { text: "MAINTENANCE", cx: 3, cy: 27, face: "e" },
  { text: "PLATFORM 2", cx: 54, cy: 24, face: "n" },
  { text: "BREAKERS ▲", cx: 57, cy: 24, face: "n", color: RED },
  { text: "GENERATOR HALL", cx: 57, cy: 17, face: "s" },
  { text: "DO NOT ENTER", cx: 61, cy: 30, face: "e", color: RED },
  // sub-level
  { text: "SUB-LEVEL 2", cx: 30, cy: 57, face: "s", color: RED },
  { text: "INTAKE / ARCHIVE", cx: 22, cy: 58, face: "s" },
  { text: "REPEATER CORE", cx: 22, cy: 67, face: "s", color: BLUE },
  { text: "PUMP", cx: 34, cy: 67, face: "s" }
];

export const PLAYER_START = { cx: 31, cy: 6, yaw: Math.PI }; // shaft head, facing south into the station
// dormant + hidden in the sealed sub-level until the scripted first sighting brings
// it up to the platform — so the player never stumbles on the creature too early
export const STALKER_START = { cx: 36, cy: 73 };

export interface ZoneDef { id: string; x: number; y: number; w: number; h: number }

export const ZONES: ZoneDef[] = [
  { id: "shaft", x: 26, y: 3, w: 12, h: 5 },
  { id: "arrivalHall", x: 30, y: 9, w: 4, h: 10 },
  { id: "lockerBay", x: 24, y: 10, w: 5, h: 4 },
  { id: "breakRoom", x: 35, y: 10, w: 7, h: 7 },
  { id: "lobby", x: 26, y: 20, w: 12, h: 4 },
  { id: "concourse", x: 18, y: 25, w: 26, h: 15 },
  { id: "maint", x: 3, y: 27, w: 8, h: 10 },
  { id: "toolCloset", x: 4, y: 38, w: 4, h: 3 },
  { id: "corrE", x: 45, y: 31, w: 7, h: 3 },
  { id: "platform", x: 53, y: 24, w: 9, h: 17 },
  { id: "genHall", x: 53, y: 17, w: 9, h: 6 },
  { id: "serviceStair", x: 28, y: 41, w: 5, h: 12 },
  { id: "intake", x: 14, y: 59, w: 28, h: 9 },
  { id: "core", x: 16, y: 69, w: 12, h: 7 }
];

/** Named navigation anchors (cell coords) for the wayfinder + director beats. */
export const NAV: Record<string, [number, number]> = {
  fuseA: [6, 33],
  fuseB: [58, 38],
  rack: [60, 18],
  stairDown: [30, 40],
  core: [20, 71],
  hatch: [28, 4]
};

export type ScareKind = "hang" | "dart" | "drop" | "face";

/**
 * Place-gated VISUAL false-scares — a real thing on-screen *before* the creature
 * ever chases (the old build-up was all off-screen audio). Each prop is built
 * hidden by Builder; the Director reveals + animates it for ~1s with a sting when
 * the player crosses `trigger` (radius in metres), then hides it again.
 *  - hang: a technician's body swings into the torch beam in a dark closet.
 *  - dart: a humanoid silhouette sprints across a far doorway and is gone.
 *  - drop: a body/rack falls from above with a slam as you pass.
 *  - face: a pale face at a porthole, gone the instant the torch sweeps over it.
 */
export interface ScareDef {
  id: string;
  kind: ScareKind;
  cx: number;
  cy: number;
  face: "n" | "s" | "e" | "w";
  triggerCx: number;
  triggerCy: number;
  radius?: number;
}

export const SCARES: ScareDef[] = [
  // 1. swinging body — deep in the maintenance tool closet (you go in for nothing)
  { id: "sc_hang", kind: "hang", cx: 5, cy: 39, face: "n", triggerCx: 5, triggerCy: 38, radius: 3 },
  // 2. darting figure — across the far end of the long east approach corridor
  { id: "sc_dart", kind: "dart", cx: 52, cy: 32, face: "n", triggerCx: 47, triggerCy: 32, radius: 3 },
  // 3. face at the glass — a porthole on the platform's east wall
  { id: "sc_face", kind: "face", cx: 61, cy: 30, face: "w", triggerCx: 58, triggerCy: 30, radius: 3 },
  // 4. falling body — drops onto the service stair as you descend toward the sub-level
  { id: "sc_drop", kind: "drop", cx: 30, cy: 47, face: "n", triggerCx: 30, triggerCy: 45, radius: 2.5 }
];
