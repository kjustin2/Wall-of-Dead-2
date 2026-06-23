/**
 * DEAD AIR — rebuilt level: "Repeater 4 Substation".
 * Hub-and-spoke vertical descent, authored as carved rectangles on a cell grid
 * (1 cell = 2 m). Row 0 is north (-Z). World position = (col*2+1, row*2+1).
 *
 * Layout (see DESIGN.md):
 *
 *                       [SHAFT HEAD]  arrive + escape (hatch)
 *                            | fire
 *                        [LOBBY]
 *                            | fire
 *   [MAINTENANCE]--[ LOWER CONCOURSE ]--[ PLATFORM ]   [GENERATOR]
 *     fuse A           (HUB)              fuse B ---------+ breaker rack
 *                            | locked:power
 *                       [SERVICE STAIR]
 *                            |
 *                      [ INTAKE ARCHIVE ]--[PUMP]
 *                            |
 *                       [REPEATER CORE]  console: re-arm broadcast
 */

export const CELL = 2;
export const GRID_W = 54;
export const GRID_H = 54;
export const WALL_H = 3;

export interface RectDef { x: number; y: number; w: number; h: number; name?: string }

export const ROOMS: RectDef[] = [
  // --- upper station ---
  { x: 23, y: 3, w: 8, h: 4, name: "shaft" },         // shaft head / lift (entry + exit)
  { x: 25, y: 8, w: 4, h: 3, name: "lobby" },         // arrivals lobby
  { x: 18, y: 12, w: 17, h: 11, name: "concourse" },  // central hub
  { x: 4, y: 13, w: 9, h: 9, name: "maint" },         // maintenance wing (fuse A), W
  { x: 14, y: 17, w: 3, h: 1, name: "corrW" },        // west spoke corridor
  { x: 39, y: 11, w: 11, h: 16, name: "platform" },   // platform 2 (fuse B), E
  { x: 36, y: 16, w: 2, h: 4, name: "corrE" },        // east spoke antechamber
  { x: 39, y: 3, w: 9, h: 5, name: "genHall" },       // generator hall (breaker rack), NE
  { x: 43, y: 9, w: 1, h: 1, name: "genAccess" },     // generator <-> platform link
  // --- service stair + sub-level ---
  { x: 25, y: 24, w: 4, h: 10, name: "serviceStair" },// stair down (locked until power)
  { x: 14, y: 35, w: 20, h: 8, name: "intake" },      // intake / archive hall (the wall of faces)
  { x: 16, y: 44, w: 10, h: 6, name: "core" },        // repeater core (console)
  { x: 28, y: 44, w: 6, h: 5, name: "pump" }          // side pump room
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
  { id: "d_lift", cx: 26, cy: 7, axis: "z", kind: "fire", open: true },
  { id: "d_lobby", cx: 26, cy: 11, axis: "z", kind: "fire", open: true },
  // hub spokes
  { id: "d_concW", cx: 17, cy: 17, axis: "x", kind: "normal", open: true },
  { id: "d_maintW", cx: 13, cy: 17, axis: "x", kind: "normal" },
  { id: "d_concE", cx: 35, cy: 17, axis: "x", kind: "normal", open: true },
  { id: "d_platW", cx: 38, cy: 17, axis: "x", kind: "normal" },
  { id: "d_gen", cx: 43, cy: 8, axis: "z", kind: "normal" },
  { id: "d_genPlat", cx: 43, cy: 10, axis: "z", kind: "normal", open: true },
  // service stair: sealed until the main grid is live
  {
    id: "d_stair", cx: 26, cy: 23, axis: "z", kind: "normal", locked: true,
    lockedText: "SERVICE STAIR — sealed until the main grid is live."
  },
  { id: "d_subLand", cx: 26, cy: 34, axis: "z", kind: "normal", open: true },
  { id: "d_core", cx: 20, cy: 43, axis: "z", kind: "normal", open: true },
  { id: "d_pump", cx: 30, cy: 43, axis: "z", kind: "normal" }
];

export const PILLARS: Array<[number, number]> = [
  [22, 15], [31, 15], [22, 20], [31, 20],                       // concourse
  [42, 14], [47, 14], [42, 19], [47, 19], [42, 23],             // platform
  [19, 38], [28, 38]                                            // intake hall
];

export interface PropDef { kind: "desk" | "bench" | "crates" | "barrel"; cx: number; cy: number; rot?: number }

export const PROPS: PropDef[] = [
  // maintenance
  { kind: "desk", cx: 6, cy: 15 },
  { kind: "crates", cx: 5, cy: 20 },
  { kind: "barrel", cx: 11, cy: 14 },
  // concourse
  { kind: "crates", cx: 28, cy: 13 },
  { kind: "bench", cx: 20, cy: 19, rot: Math.PI / 2 },
  { kind: "barrel", cx: 33, cy: 21 },
  // platform
  { kind: "bench", cx: 41, cy: 16, rot: Math.PI / 2 },
  { kind: "bench", cx: 48, cy: 20, rot: Math.PI / 2 },
  { kind: "crates", cx: 44, cy: 25 },
  { kind: "barrel", cx: 40, cy: 12 },
  // generator hall
  { kind: "barrel", cx: 40, cy: 4 },
  { kind: "crates", cx: 41, cy: 6 },
  // intake archive — the operator's desk faces the core
  { kind: "desk", cx: 17, cy: 40 },
  { kind: "bench", cx: 24, cy: 36, rot: Math.PI / 2 },
  { kind: "crates", cx: 31, cy: 40 },
  { kind: "barrel", cx: 15, cy: 41 },
  // repeater core
  { kind: "desk", cx: 23, cy: 47 }
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
  // ---- notes (environmental story) ----
  {
    id: "note_workorder", kind: "note", cx: 27, cy: 13, label: "work order",
    noteTitle: "Work order 7741 — Repeater 4",
    noteBody:
      "Repeater 4 went quiet nine days ago. The surface feed still loops the same survivor count: 312.\n\n" +
      "Power section says two breaker fuses were pulled from the generator rack. Pulled. Not blown.\n\n" +
      "Go down, refit them, restart the broadcast. Do not stay past one battery. Do not answer anything that knocks."
  },
  {
    id: "note_shift", kind: "note", cx: 5, cy: 16, label: "third shift log",
    noteTitle: "Third shift log — final page",
    noteBody:
      "Mara swears it doesn't hunt sound first. It hunts light.\n\n" +
      "It stood at the end of the platform all shift, facing her torch. Not moving. When she finally switched it off, she could hear it coming closer to look.\n\n" +
      "We keep the lights broken now. Sign the log in the dark."
  },
  {
    id: "note_chalk", kind: "note", cx: 48, cy: 12, label: "chalk tally",
    noteTitle: "Chalk on the platform wall",
    noteBody:
      "Tally marks cover the tiles floor to higher than a man can reach. Four strokes and a slash, hundreds of times.\n\n" +
      "Under the count, scratched deep enough to crack the glaze:\n\n" +
      "THE COUNT STAYS AT 312 BECAUSE NOBODY LEAVES."
  },
  {
    id: "note_ledger", kind: "note", cx: 20, cy: 37, label: "intake ledger",
    noteTitle: "Intake ledger — last entries",
    noteBody:
      "The ledger lists every name sent down to fix Repeater 4. The handwriting changes a dozen times. The dates do not stop.\n\n" +
      "Each line ends the same way, in a different hand: did not return.\n\n" +
      "The final entry is yours. Someone has already filled in the last column."
  },
  {
    id: "note_core", kind: "note", cx: 22, cy: 46, label: "operator's note",
    noteTitle: "Taped to the dead mic",
    noteBody:
      "It is not a survivor count. I worked it out my last clear night.\n\n" +
      "It is the count of us. Every name the broadcast brings down is added below and taken from nothing. The signal is not a report. It is the bait.\n\n" +
      "If you restart it the way they're telling you to, you are calling the next one. I'm sorry. The hatch won't open any other way."
  },
  // ---- objective items ----
  { id: "fuse_a", kind: "fuse", cx: 9, cy: 16, label: "breaker fuse" },
  { id: "fuse_b", kind: "fuse", cx: 47, cy: 24, label: "breaker fuse" },
  { id: "panel", kind: "panel", cx: 46, cy: 4, label: "breaker rack" },
  { id: "console", kind: "console", cx: 20, cy: 46, label: "repeater core" },
  { id: "hatch", kind: "hatch", cx: 24, cy: 4, label: "surface hatch" },
  // ---- consumables ----
  { id: "bat_maint", kind: "battery", cx: 10, cy: 19, label: "torch battery" },
  { id: "bat_plat", kind: "battery", cx: 41, cy: 13, label: "torch battery" },
  { id: "bat_conc", kind: "battery", cx: 31, cy: 16, label: "torch battery" },
  { id: "bat_sub", kind: "battery", cx: 31, cy: 46, label: "torch battery" },
  { id: "bot_maint", kind: "bottles", cx: 8, cy: 20, label: "glass bottles" },
  { id: "bot_plat", kind: "bottles", cx: 40, cy: 23, label: "glass bottles" }
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
  // hub: warm amber
  { id: "l_conc_a", cx: 24, cy: 15, color: 0xffc070, intensity: 14, flicker: true },
  { id: "l_conc_b", cx: 29, cy: 20, color: 0xffb060, intensity: 8 },
  // maintenance: warm
  { id: "l_maint", cx: 8, cy: 17, color: 0xffd9a0, intensity: 10 },
  // platform: cold blue
  { id: "l_plat_n", cx: 42, cy: 14, color: 0xbcd0ea, intensity: 11, flicker: true },
  { id: "l_plat_s", cx: 45, cy: 23, color: 0xb0c4dd, intensity: 6 },
  // generator: dark until power
  { id: "l_gen", cx: 43, cy: 5, color: 0xffc070, intensity: 0, off: true },
  // shaft / exit: green glow
  { id: "l_shaft", cx: 26, cy: 4, color: 0x5dff8a, intensity: 6 },
  { id: "l_lobby", cx: 26, cy: 9, color: 0xffce8e, intensity: 7 },
  // service stair: cold, failing
  { id: "l_stair", cx: 26, cy: 28, color: 0xbfc6cc, intensity: 6, flicker: true },
  // sub-level: sickly grey-green, dying
  { id: "l_intake_a", cx: 19, cy: 38, color: 0x9fb0a8, intensity: 6, flicker: true },
  { id: "l_intake_b", cx: 28, cy: 38, color: 0x8ea0a0, intensity: 4, flicker: true },
  { id: "l_core", cx: 20, cy: 46, color: 0x88bb99, intensity: 7 },
  { id: "l_pump", cx: 30, cy: 46, color: 0x7f9080, intensity: 4, flicker: true },
  // emergency circuit along the escape spine — off until the final run
  { id: "l_em_lobby", cx: 26, cy: 9, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_conc", cx: 26, cy: 17, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_stair", cx: 26, cy: 30, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_em_intake", cx: 23, cy: 39, color: 0xff3a22, intensity: 0, off: true }
];

export const WAYPOINTS: Array<[number, number]> = [
  // upper
  [8, 17], [8, 20], [11, 15], [20, 16], [28, 20], [26, 15], [31, 16],
  [42, 14], [45, 23], [47, 24], [44, 18], [43, 5], [41, 6],
  [26, 9], [26, 5], [15, 17], [36, 18],
  // sub-level
  [26, 28], [20, 38], [28, 38], [16, 41], [20, 46], [30, 46]
];

export interface SignDef { text: string; cx: number; cy: number; face: "n" | "s" | "e" | "w"; color?: string }

const GREEN = "#56d877";
const BLUE = "#7da0c0";
const RED = "#b0543c";

export const SIGNS: SignDef[] = [
  // hub wayfinding (readable from the concourse)
  { text: "◄ MAINTENANCE", cx: 18, cy: 16, face: "w" },
  { text: "PLATFORM 2 ►", cx: 34, cy: 16, face: "e" },
  { text: "LIFT ▲ SURFACE", cx: 26, cy: 12, face: "n", color: GREEN },
  { text: "SERVICE STAIR ▼", cx: 26, cy: 22, face: "s", color: RED },
  // identity / exit
  { text: "REPEATER 4", cx: 30, cy: 12, face: "n", color: BLUE },
  { text: "◄ EXIT", cx: 26, cy: 8, face: "n", color: GREEN },
  { text: "SURFACE HATCH", cx: 24, cy: 3, face: "s", color: GREEN },
  { text: "MAINTENANCE", cx: 4, cy: 13, face: "e" },
  { text: "PLATFORM 2", cx: 44, cy: 11, face: "n" },
  { text: "BREAKERS ▲", cx: 43, cy: 11, face: "n", color: RED },
  { text: "GENERATOR HALL", cx: 43, cy: 2, face: "s" },
  { text: "DO NOT ENTER", cx: 49, cy: 18, face: "e", color: RED },
  // sub-level
  { text: "SUB-LEVEL 2", cx: 26, cy: 34, face: "s", color: RED },
  { text: "INTAKE / ARCHIVE", cx: 20, cy: 35, face: "s" },
  { text: "REPEATER CORE", cx: 20, cy: 43, face: "s", color: BLUE },
  { text: "PUMP", cx: 30, cy: 43, face: "s" }
];

export const PLAYER_START = { cx: 26, cy: 5, yaw: Math.PI }; // shaft head, facing south into the station
// dormant + hidden in the sealed sub-level until the scripted first sighting brings
// it up to the platform — so the player never stumbles on the creature too early
export const STALKER_START = { cx: 31, cy: 46 };

export interface ZoneDef { id: string; x: number; y: number; w: number; h: number }

export const ZONES: ZoneDef[] = [
  { id: "shaft", x: 23, y: 3, w: 8, h: 4 },
  { id: "lobby", x: 25, y: 8, w: 4, h: 3 },
  { id: "concourse", x: 18, y: 12, w: 17, h: 11 },
  { id: "maint", x: 4, y: 13, w: 9, h: 9 },
  { id: "platform", x: 39, y: 11, w: 11, h: 16 },
  { id: "genHall", x: 39, y: 3, w: 9, h: 5 },
  { id: "serviceStair", x: 25, y: 24, w: 4, h: 10 },
  { id: "intake", x: 14, y: 35, w: 20, h: 8 },
  { id: "core", x: 16, y: 44, w: 10, h: 6 }
];

/** Named navigation anchors (cell coords) for the wayfinder + director beats. */
export const NAV: Record<string, [number, number]> = {
  fuseA: [9, 16],
  fuseB: [47, 24],
  rack: [46, 4],
  stairDown: [26, 23],
  core: [20, 46],
  hatch: [24, 4]
};
