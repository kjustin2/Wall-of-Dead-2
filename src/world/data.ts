/**
 * DEAD AIR — vertical slice level: "Repeater 4 Substation".
 * The map is authored as carved rectangles on a cell grid (1 cell = 2m).
 * Row 0 is north (-Z). World position = (col*2+1, row*2+1).
 */

export const CELL = 2;
export const GRID_W = 46;
export const GRID_H = 48; // extended south for the Act III sub-level
export const WALL_H = 3;

export interface RectDef { x: number; y: number; w: number; h: number; name?: string }

export const ROOMS: RectDef[] = [
  { x: 2, y: 2, w: 3, h: 3, name: "shaft" },          // exit shaft, NW
  { x: 6, y: 3, w: 30, h: 1, name: "northCorr" },     // escape corridor
  { x: 19, y: 4, w: 1, h: 1 },                        // junction opening
  { x: 37, y: 2, w: 7, h: 6, name: "genRoom" },       // generator room, NE
  { x: 40, y: 9, w: 1, h: 4, name: "genHall" },       // generator access hall
  { x: 33, y: 14, w: 12, h: 17, name: "platform" },   // platform, E
  { x: 29, y: 18, w: 3, h: 1, name: "linkEast" },     // concourse->platform link
  { x: 12, y: 12, w: 16, h: 11, name: "concourse" },  // central concourse
  { x: 19, y: 5, w: 1, h: 6, name: "northLink" },     // concourse->corridor link
  { x: 17, y: 24, w: 6, h: 7, name: "stairwell" },    // start room, S
  { x: 3, y: 14, w: 8, h: 7, name: "office" },        // maintenance office, W
  // --- Act III sub-level (below the stairwell) ---
  { x: 19, y: 31, w: 1, h: 4, name: "subStair" },     // service stair down
  { x: 7, y: 35, w: 22, h: 7, name: "subHall" },      // intake / archive hall
  { x: 11, y: 42, w: 9, h: 5, name: "core" },         // repeater core
  { x: 22, y: 42, w: 5, h: 4, name: "pump" }          // side pump room
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
  { id: "d_shaft", cx: 5, cy: 3, axis: "x", kind: "normal", open: true },
  { id: "f1", cx: 13, cy: 3, axis: "x", kind: "fire", open: true },
  { id: "f2", cx: 21, cy: 3, axis: "x", kind: "fire", open: true },
  { id: "f3", cx: 29, cy: 3, axis: "x", kind: "fire", open: true },
  { id: "d_gen_w", cx: 36, cy: 3, axis: "x", kind: "normal" },
  { id: "d_gen_s", cx: 40, cy: 8, axis: "z", kind: "normal" },
  { id: "d_hall_plat", cx: 40, cy: 13, axis: "z", kind: "normal" },
  { id: "d_conc_e", cx: 28, cy: 18, axis: "x", kind: "normal" },
  { id: "d_plat_w", cx: 32, cy: 18, axis: "x", kind: "normal" },
  { id: "d_office", cx: 11, cy: 17, axis: "x", kind: "normal" },
  { id: "d_stair", cx: 19, cy: 23, axis: "z", kind: "normal" },
  {
    id: "d_north", cx: 19, cy: 11, axis: "z", kind: "normal", locked: true,
    lockedText: "EMERGENCY EXIT ROUTE — the lock holds until the signal goes back out."
  },
  {
    id: "d_service", cx: 19, cy: 31, axis: "z", kind: "normal", locked: true,
    lockedText: "SERVICE STAIR — sealed until the main grid is live."
  }
];

export const PILLARS: Array<[number, number]> = [
  [15, 14], [23, 14], [15, 20], [23, 20],            // concourse
  [36, 17], [41, 17], [36, 21], [41, 21], [36, 25], [41, 25] // platform
];

export interface PropDef { kind: "desk" | "bench" | "crates" | "barrel"; cx: number; cy: number; rot?: number }

export const PROPS: PropDef[] = [
  { kind: "desk", cx: 5, cy: 16 },
  { kind: "crates", cx: 4, cy: 20 },
  { kind: "bench", cx: 35, cy: 19, rot: Math.PI / 2 },
  { kind: "bench", cx: 42, cy: 23, rot: Math.PI / 2 },
  { kind: "crates", cx: 26, cy: 12 },
  { kind: "barrel", cx: 12, cy: 22 },
  { kind: "crates", cx: 37, cy: 2 },
  { kind: "barrel", cx: 37, cy: 7 },
  { kind: "crates", cx: 17, cy: 30 },
  // sub-level dressing — the operator's desk faces the dead core
  { kind: "desk", cx: 15, cy: 43 },
  { kind: "bench", cx: 10, cy: 40, rot: Math.PI / 2 },
  { kind: "barrel", cx: 8, cy: 41 },
  { kind: "crates", cx: 26, cy: 44 },
  { kind: "barrel", cx: 23, cy: 44 }
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
  {
    id: "note_workorder", kind: "note", cx: 20, cy: 28, label: "work order",
    noteTitle: "Work order 7741 — Repeater 4",
    noteBody:
      "Repeater 4 went quiet nine days ago. The surface feed still loops the same survivor count: 312.\n\n" +
      "Power section says two breaker fuses were pulled from the generator rack. Pulled. Not blown.\n\n" +
      "Go down, refit them, restart the broadcast. Do not stay past one battery. Do not answer anything that knocks."
  },
  {
    id: "note_shift", kind: "note", cx: 8, cy: 15, label: "third shift log",
    noteTitle: "Third shift log — final page",
    noteBody:
      "Mara swears it doesn't hunt sound first. It hunts light.\n\n" +
      "It stood at the end of the platform all shift, facing her torch. Not moving. When she finally switched it off, she could hear it coming closer to look.\n\n" +
      "We keep the lights broken now. Sign the log in the dark."
  },
  {
    id: "note_chalk", kind: "note", cx: 34, cy: 24, label: "chalk tally",
    noteTitle: "Chalk on the platform wall",
    noteBody:
      "Tally marks cover the tiles from the floor to higher than a man can reach. Four strokes and a slash, hundreds of times.\n\n" +
      "Under the count, scratched deep enough to crack the glaze:\n\n" +
      "THE COUNT STAYS AT 312 BECAUSE NOBODY LEAVES."
  },
  { id: "fuse_a", kind: "fuse", cx: 4, cy: 15, label: "breaker fuse" },
  { id: "fuse_b", kind: "fuse", cx: 43, cy: 29, label: "breaker fuse" },
  { id: "bat_office", kind: "battery", cx: 4, cy: 19, label: "torch battery" },
  { id: "bat_plat", kind: "battery", cx: 43, cy: 15, label: "torch battery" },
  { id: "bat_conc", kind: "battery", cx: 13, cy: 21, label: "torch battery" },
  { id: "bot_office", kind: "bottles", cx: 9, cy: 19, label: "glass bottles" },
  { id: "bot_plat", kind: "bottles", cx: 34, cy: 28, label: "glass bottles" },
  { id: "panel", kind: "panel", cx: 43, cy: 4, label: "breaker rack" },
  { id: "hatch", kind: "hatch", cx: 3, cy: 2, label: "surface hatch" },
  // --- Act III sub-level ---
  { id: "console", kind: "console", cx: 15, cy: 45, label: "repeater core" },
  { id: "bat_sub", kind: "battery", cx: 25, cy: 43, label: "torch battery" },
  {
    id: "note_intake", kind: "note", cx: 9, cy: 36, label: "intake ledger",
    noteTitle: "Intake ledger — last entries",
    noteBody:
      "The ledger lists every name sent down to fix Repeater 4. The handwriting changes a dozen times. The dates do not stop.\n\n" +
      "Each line ends the same way, in a different hand: did not return.\n\n" +
      "The final entry is yours. Someone has already filled in the last column."
  }
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
  { id: "l_conc_a", cx: 16, cy: 14, color: 0xffc885, intensity: 14, flicker: true },
  { id: "l_conc_b", cx: 24, cy: 19, color: 0xffbb70, intensity: 8 },
  { id: "l_office", cx: 6, cy: 16, color: 0xffd9a0, intensity: 10 },
  { id: "l_stair", cx: 19, cy: 26, color: 0xffce8e, intensity: 10 },
  { id: "l_plat_n", cx: 38, cy: 17, color: 0xbfd2e8, intensity: 11, flicker: true },
  { id: "l_plat_s", cx: 38, cy: 26, color: 0xb8c8dd, intensity: 6 },
  { id: "l_gen", cx: 40, cy: 4, color: 0xffc880, intensity: 9 },
  { id: "l_corr_a", cx: 9, cy: 3, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_corr_b", cx: 17, cy: 3, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_corr_c", cx: 25, cy: 3, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_corr_d", cx: 33, cy: 3, color: 0xff3a22, intensity: 0, off: true },
  { id: "l_shaft", cx: 3, cy: 3, color: 0x4dff7a, intensity: 5 },
  // sub-level (its own failing lights)
  { id: "l_sub_a", cx: 13, cy: 38, color: 0x9fb0c4, intensity: 6, flicker: true },
  { id: "l_sub_b", cx: 23, cy: 38, color: 0x8a9ab0, intensity: 4, flicker: true },
  { id: "l_core", cx: 15, cy: 44, color: 0xffba66, intensity: 7 },
  { id: "l_pump", cx: 24, cy: 43, color: 0x7f9080, intensity: 4, flicker: true }
];

export const WAYPOINTS: Array<[number, number]> = [
  [38, 15], [38, 29], [43, 20], [34, 16], [40, 10],
  [13, 13], [26, 13], [13, 21], [26, 21], [19, 18],
  [6, 17], [9, 19], [19, 8], [10, 3], [30, 3], [40, 5],
  // sub-level
  [12, 38], [24, 38], [15, 44], [24, 43], [19, 33]
];

export interface SignDef { text: string; cx: number; cy: number; face: "n" | "s" | "e" | "w"; color?: string }

export const SIGNS: SignDef[] = [
  { text: "CONCOURSE B", cx: 22, cy: 11, face: "s" },
  { text: "MAINTENANCE", cx: 11, cy: 16, face: "e" },
  { text: "PLATFORM 2  >", cx: 30, cy: 17, face: "s" },
  { text: "< PLATFORM 1", cx: 14, cy: 11, face: "s" },
  { text: "GENERATOR ROOM", cx: 40, cy: 1, face: "s" },
  { text: "REPEATER 4", cx: 43, cy: 1, face: "s", color: "#7da0c0" },
  { text: "<  EXIT", cx: 8, cy: 4, face: "n", color: "#56d877" },
  { text: "<  EXIT", cx: 28, cy: 4, face: "n", color: "#56d877" },
  { text: "EXIT", cx: 3, cy: 1, face: "s", color: "#56d877" },
  { text: "PLATFORM 2", cx: 45, cy: 22, face: "w" },
  { text: "DO NOT ENTER", cx: 45, cy: 18, face: "w", color: "#b0543c" },
  // sub-level signage
  { text: "SUB-LEVEL 2", cx: 19, cy: 30, face: "s", color: "#b0543c" },
  { text: "INTAKE", cx: 8, cy: 35, face: "s" },
  { text: "REPEATER CORE", cx: 15, cy: 41, face: "s", color: "#7da0c0" },
  { text: "NO EXIT", cx: 26, cy: 41, face: "s", color: "#b0543c" }
];

export const PLAYER_START = { cx: 19, cy: 29, yaw: 0 }; // facing north
export const STALKER_START = { cx: 43, cy: 28 };        // sitting beside fuse B

export interface ZoneDef { id: string; x: number; y: number; w: number; h: number }

export const ZONES: ZoneDef[] = [
  { id: "concourse", x: 12, y: 12, w: 16, h: 11 },
  { id: "office", x: 3, y: 14, w: 8, h: 7 },
  { id: "platform", x: 33, y: 14, w: 12, h: 17 },
  { id: "genRoom", x: 37, y: 2, w: 7, h: 6 },
  { id: "northCorr", x: 6, y: 3, w: 30, h: 1 },
  { id: "shaft", x: 2, y: 2, w: 3, h: 3 },
  { id: "subHall", x: 7, y: 35, w: 22, h: 7 },
  { id: "core", x: 11, y: 42, w: 9, h: 5 }
];
