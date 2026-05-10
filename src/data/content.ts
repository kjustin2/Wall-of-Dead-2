import { Color3 } from "@babylonjs/core/Maths/math.color";

export type WeaponId = "bat" | "pistol" | "shotgun" | "rifle" | "flare" | "pipebomb";
export type AmmoType = "none" | "light" | "shell" | "rifle" | "flare" | "explosive";
export type EnemyKind = "shambler" | "runner" | "crawler" | "spitter" | "brute" | "screamer" | "patient_zero";
export type InteractableKind = "note" | "supply" | "fuse" | "door" | "seal" | "gascan" | "radio" | "hanging" | "mannequin";
export type ScareAction =
  | "flicker"
  | "whisper"
  | "bodyDrop"
  | "distantScream"
  | "lightsOut"
  | "spawnRunner"
  | "startChase"
  | "gasLeak"
  | "patientStalk"
  | "openGate";

export interface WeaponDef {
  id: WeaponId;
  name: string;
  ammoType: AmmoType;
  magSize: number;
  startReserve: number;
  damage: number;
  range: number;
  fireRate: number;
  reloadTime: number;
  spread: number;
  pellets: number;
  noise: number;
  recoil: number;
  melee?: boolean;
  flare?: boolean;
  explosive?: boolean;
  automatic?: boolean;
}

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  attackRange: number;
  attackCooldown: number;
  color: Color3;
  emissive: Color3;
}

export interface WallDef {
  x: number;
  z: number;
  w: number;
  d: number;
  h?: number;
  label?: string;
}

export interface PropDef {
  kind:
    | "crate"
    | "car"
    | "shelf"
    | "boiler"
    | "pew"
    | "pillar"
    | "poster"
    | "debris"
    | "barrier"
    | "floodlight"
    | "speaker"
    | "sign"
    | "cot"
    | "curtain"
    | "bodybag"
    | "cable"
    | "candle"
    | "gate";
  x: number;
  z: number;
  rot?: number;
  scale?: number;
}

export interface LookAtDef {
  x: number;
  z: number;
}

export interface EnemySpawnDef {
  kind: EnemyKind;
  x: number;
  z: number;
  dormant?: boolean;
  label?: string;
}

export interface SupplyPayload {
  weapons?: WeaponId[];
  ammo?: Partial<Record<AmmoType, number>>;
  medkits?: number;
}

export interface InteractableDef {
  id: string;
  kind: InteractableKind;
  x: number;
  z: number;
  rot?: number;
  w?: number;
  d?: number;
  h?: number;
  radius?: number;
  label: string;
  text?: string;
  targetZone?: string;
  payload?: SupplyPayload;
  oneShot?: boolean;
  lockedUntil?: string;
  lockedText?: string;
  grantsFlag?: string;
  objective?: string;
}

export interface ScareTrigger {
  id: string;
  trigger: "enter" | "time" | "approach" | "lowHp" | "enemyCountBelow" | "interact";
  after?: number;
  x?: number;
  z?: number;
  radius?: number;
  hpFrac?: number;
  count?: number;
  interactId?: string;
  action: ScareAction;
  text?: string;
  sound?: string;
  objective?: string;
  spawns?: EnemySpawnDef[];
  beats?: ScareBeat[];
}

export interface ScareBeat {
  after: number;
  action?: ScareAction;
  text?: string;
  sound?: string;
  objective?: string;
  spawns?: EnemySpawnDef[];
  flicker?: number;
  blackout?: number;
  dread?: number;
  cinematic?: boolean;
  lockInput?: number;
  lookAt?: LookAtDef;
}

export interface ZoneDef {
  id: string;
  name: string;
  objective: string;
  width: number;
  depth: number;
  floor: Color3;
  wall: Color3;
  accent: Color3;
  fog: Color3;
  entry: { x: number; z: number; yaw?: number };
  exitHint?: string;
  walls: WallDef[];
  props: PropDef[];
  enemies: EnemySpawnDef[];
  interactables: InteractableDef[];
  scares: ScareTrigger[];
  intro?: ScareBeat[];
  ambient: string[];
  isEnding?: boolean;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  bat: {
    id: "bat",
    name: "Nail Bat",
    ammoType: "none",
    magSize: 1,
    startReserve: 0,
    damage: 28,
    range: 2.05,
    fireRate: 1.65,
    reloadTime: 0,
    spread: 0.0,
    pellets: 1,
    noise: 0.08,
    recoil: 0.16,
    melee: true
  },
  pistol: {
    id: "pistol",
    name: "Service Pistol",
    ammoType: "light",
    magSize: 10,
    startReserve: 24,
    damage: 22,
    range: 21,
    fireRate: 3.6,
    reloadTime: 1.15,
    spread: 0.045,
    pellets: 1,
    noise: 0.56,
    recoil: 0.2
  },
  shotgun: {
    id: "shotgun",
    name: "Cut-Down Shotgun",
    ammoType: "shell",
    magSize: 4,
    startReserve: 8,
    damage: 12,
    range: 12,
    fireRate: 0.85,
    reloadTime: 1.9,
    spread: 0.34,
    pellets: 8,
    noise: 0.86,
    recoil: 0.62
  },
  rifle: {
    id: "rifle",
    name: "Hunting Rifle",
    ammoType: "rifle",
    magSize: 5,
    startReserve: 9,
    damage: 68,
    range: 32,
    fireRate: 0.72,
    reloadTime: 2.25,
    spread: 0.015,
    pellets: 1,
    noise: 0.78,
    recoil: 0.48
  },
  flare: {
    id: "flare",
    name: "Flare Gun",
    ammoType: "flare",
    magSize: 1,
    startReserve: 2,
    damage: 8,
    range: 16,
    fireRate: 0.6,
    reloadTime: 1.4,
    spread: 0.02,
    pellets: 1,
    noise: 0.35,
    recoil: 0.25,
    flare: true
  },
  pipebomb: {
    id: "pipebomb",
    name: "Pipe Bomb",
    ammoType: "explosive",
    magSize: 1,
    startReserve: 1,
    damage: 86,
    range: 10,
    fireRate: 0.45,
    reloadTime: 0.5,
    spread: 0,
    pellets: 1,
    noise: 1.0,
    recoil: 0.42,
    explosive: true
  }
};

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: {
    kind: "shambler",
    name: "Shambler",
    hp: 44,
    speed: 1.3,
    radius: 0.42,
    damage: 11,
    attackRange: 0.92,
    attackCooldown: 1.05,
    color: new Color3(0.22, 0.31, 0.19),
    emissive: new Color3(0.035, 0.06, 0.025)
  },
  runner: {
    kind: "runner",
    name: "Runner",
    hp: 26,
    speed: 2.65,
    radius: 0.34,
    damage: 12,
    attackRange: 0.82,
    attackCooldown: 0.72,
    color: new Color3(0.34, 0.41, 0.19),
    emissive: new Color3(0.08, 0.05, 0.02)
  },
  crawler: {
    kind: "crawler",
    name: "Crawler",
    hp: 20,
    speed: 1.95,
    radius: 0.28,
    damage: 9,
    attackRange: 0.62,
    attackCooldown: 0.82,
    color: new Color3(0.16, 0.21, 0.13),
    emissive: new Color3(0.03, 0.035, 0.02)
  },
  spitter: {
    kind: "spitter",
    name: "Spitter",
    hp: 34,
    speed: 1.05,
    radius: 0.38,
    damage: 10,
    attackRange: 8.0,
    attackCooldown: 2.2,
    color: new Color3(0.38, 0.43, 0.22),
    emissive: new Color3(0.10, 0.14, 0.02)
  },
  brute: {
    kind: "brute",
    name: "Brute",
    hp: 170,
    speed: 1.55,
    radius: 0.64,
    damage: 25,
    attackRange: 1.15,
    attackCooldown: 1.25,
    color: new Color3(0.20, 0.23, 0.16),
    emissive: new Color3(0.08, 0.025, 0.015)
  },
  screamer: {
    kind: "screamer",
    name: "Screamer",
    hp: 38,
    speed: 1.2,
    radius: 0.36,
    damage: 7,
    attackRange: 7.0,
    attackCooldown: 4.0,
    color: new Color3(0.48, 0.42, 0.25),
    emissive: new Color3(0.12, 0.08, 0.02)
  },
  patient_zero: {
    kind: "patient_zero",
    name: "Patient Zero",
    hp: 620,
    speed: 1.35,
    radius: 0.78,
    damage: 26,
    attackRange: 1.35,
    attackCooldown: 0.95,
    color: new Color3(0.36, 0.16, 0.12),
    emissive: new Color3(0.20, 0.035, 0.025)
  }
};

const APT = {
  floor: new Color3(0.055, 0.047, 0.056),
  wall: new Color3(0.13, 0.085, 0.095),
  accent: new Color3(0.28, 0.15, 0.13),
  fog: new Color3(0.035, 0.024, 0.030)
};
const GARAGE = {
  floor: new Color3(0.045, 0.049, 0.055),
  wall: new Color3(0.105, 0.115, 0.125),
  accent: new Color3(0.34, 0.22, 0.10),
  fog: new Color3(0.028, 0.033, 0.040)
};
const PHARM = {
  floor: new Color3(0.052, 0.066, 0.054),
  wall: new Color3(0.10, 0.15, 0.12),
  accent: new Color3(0.56, 0.55, 0.40),
  fog: new Color3(0.030, 0.040, 0.032)
};
const SUBWAY = {
  floor: new Color3(0.038, 0.036, 0.047),
  wall: new Color3(0.075, 0.072, 0.092),
  accent: new Color3(0.25, 0.23, 0.12),
  fog: new Color3(0.030, 0.028, 0.042)
};
const BOILER = {
  floor: new Color3(0.070, 0.038, 0.025),
  wall: new Color3(0.17, 0.080, 0.040),
  accent: new Color3(0.60, 0.18, 0.06),
  fog: new Color3(0.050, 0.025, 0.018)
};
const CRYPT = {
  floor: new Color3(0.026, 0.018, 0.022),
  wall: new Color3(0.075, 0.035, 0.046),
  accent: new Color3(0.50, 0.12, 0.10),
  fog: new Color3(0.030, 0.014, 0.019)
};

export const ZONES: ZoneDef[] = [
  {
    id: "approach_road",
    name: "Freedom Gate Intake Road",
    objective: "Follow the floodlights to the intake doors.",
    width: 30,
    depth: 34,
    floor: new Color3(0.032, 0.034, 0.039),
    wall: new Color3(0.070, 0.072, 0.078),
    accent: new Color3(0.62, 0.48, 0.22),
    fog: new Color3(0.025, 0.030, 0.038),
    entry: { x: 0, z: 13.8, yaw: Math.PI },
    exitHint: "The intake doors still have emergency power.",
    walls: [
      { x: -7.4, z: 5.0, w: 0.55, d: 12.0, label: "queue rail" },
      { x: 7.4, z: 5.0, w: 0.55, d: 12.0, label: "queue rail" },
      { x: -4.6, z: -5.8, w: 3.4, d: 0.55, label: "checkpoint block" },
      { x: 4.6, z: -5.8, w: 3.4, d: 0.55, label: "checkpoint block" },
      { x: -9.2, z: -10.6, w: 2.2, d: 0.65, label: "fallen barricade" },
      { x: 9.2, z: -10.6, w: 2.2, d: 0.65, label: "fallen barricade" }
    ],
    props: [
      { kind: "gate", x: 0, z: -14.4, scale: 1.25 },
      { kind: "sign", x: 0, z: 9.6, scale: 1.2 },
      { kind: "speaker", x: -6.8, z: 8.4, rot: Math.PI * 0.2 },
      { kind: "speaker", x: 6.8, z: 8.4, rot: -Math.PI * 0.2 },
      { kind: "floodlight", x: -8.4, z: 2.8, rot: Math.PI * 0.15 },
      { kind: "floodlight", x: 8.4, z: -1.0, rot: -Math.PI * 0.15 },
      { kind: "barrier", x: -4.2, z: 3.6, rot: 0.18 },
      { kind: "barrier", x: 4.0, z: 1.6, rot: -0.12 },
      { kind: "car", x: -9.4, z: 10.6, rot: 0.32, scale: 0.85 },
      { kind: "debris", x: 3.0, z: 7.4, scale: 1.4 }
    ],
    enemies: [],
    interactables: [
      {
        id: "approach_pa",
        kind: "radio",
        x: -6.8,
        z: 8.4,
        label: "gate loudspeaker",
        text: "The speaker repeats: Intake remains open. Walk between the lights. Do not leave the marked road."
      },
      {
        id: "approach_notice",
        kind: "note",
        x: 2.6,
        z: 5.7,
        label: "intake notice",
        text: "All survivors were redirected through Building A when the front gate stopped answering."
      },
      { id: "door_intake", kind: "door", x: 0, z: -14.2, label: "intake doors", targetZone: "apartment" }
    ],
    scares: [
      {
        id: "approach_intro",
        trigger: "enter",
        action: "distantScream",
        sound: "pa_broken",
        text: "The last broadcast said the Freedom Gate was still taking survivors.",
        beats: [
          { after: 1.0, sound: "gate_hum", text: "The floodlights still know where to point.", cinematic: true, lockInput: 1.4, lookAt: { x: 0, z: -14.2 }, dread: 0.25 },
          { after: 4.8, action: "flicker", sound: "fluorescent_die", text: "One light fails behind you. Then another.", flicker: 2.2, dread: 0.38 },
          { after: 8.0, objective: "Get inside Building A before the road goes dark.", sound: "distant_metal", text: "The loudspeaker changes to your side of the road." }
        ]
      }
    ],
    ambient: ["wind", "gate_hum", "pa_broken"]
  },
  {
    id: "apartment",
    name: "Building A Intake Lobby",
    objective: "Find the garage route beneath Building A.",
    width: 28,
    depth: 22,
    ...APT,
    entry: { x: 0, z: 8, yaw: Math.PI },
    exitHint: "The garage door is chained from the inside.",
    walls: [
      { x: 0, z: 0, w: 4.2, d: 1.6, label: "reception" },
      { x: -8.2, z: -1.0, w: 0.8, d: 8.0 },
      { x: 8.2, z: 1.0, w: 0.8, d: 8.0 },
      { x: -4.4, z: 4.8, w: 2.2, d: 0.6 },
      { x: 5.4, z: -4.6, w: 2.0, d: 0.6 }
    ],
    props: [
      { kind: "debris", x: -2.8, z: 2.2, scale: 1.2 },
      { kind: "sign", x: 7.75, z: -5.8, rot: Math.PI * 0.5 },
      { kind: "speaker", x: -7.2, z: 6.4, rot: Math.PI * 0.75, scale: 0.78 },
      { kind: "crate", x: -5.8, z: -5.6, rot: 0.4 }
    ],
    enemies: [],
    interactables: [
      {
        id: "apt_note",
        kind: "note",
        x: -1.2,
        z: 1.1,
        label: "intake ledger",
        text: "Names were checked here, then moved below when the gate jammed. The final page has the same name written down every line."
      },
      { id: "apt_fuse", kind: "fuse", x: -11.6, z: 2.8, label: "fuse box" },
      { id: "apt_body", kind: "hanging", x: -5.1, z: 5.4, label: "hanging shape" },
      { id: "apt_mannequin", kind: "mannequin", x: 3.8, z: -5.1, label: "still figure" },
      { id: "door_garage", kind: "door", x: 0, z: -9.8, label: "garage stairwell", targetZone: "garage" }
    ],
    scares: [
      { id: "apt_enter", trigger: "enter", action: "whisper", sound: "pa_broken", text: "The intake desk light clicks on as you enter.", beats: [{ after: 1.0, cinematic: true, lockInput: 1.1, lookAt: { x: 0, z: 0 }, sound: "gate_hum" }] },
      {
        id: "apt_flicker",
        trigger: "time",
        after: 5.5,
        action: "flicker",
        sound: "light_pop",
        text: "The evacuation arrow blinks toward the stairs.",
        beats: [
          { after: 2.1, action: "whisper", sound: "wall_scrape", text: "The sign keeps pointing after the bulb dies." }
        ]
      },
      { id: "apt_stairwell", trigger: "time", after: 11.5, action: "distantScream", sound: "distant_metal", text: "A gate motor turns far below the building." },
      { id: "apt_drop", trigger: "approach", x: -5.1, z: 5.4, radius: 2.0, action: "bodyDrop" },
      { id: "apt_mannequin_watch", trigger: "approach", x: 3.8, z: -5.1, radius: 2.4, action: "whisper", sound: "radio_burst", text: "The intake mannequin has been turned toward the stairs." }
    ],
    intro: [
      { after: 0.4, cinematic: true, lockInput: 1.2, lookAt: { x: -1.2, z: 1.1 }, text: "Building A was not a shelter. It was a funnel.", sound: "pa_broken" }
    ],
    ambient: ["floor_creak", "pipe_drip", "pa_broken"]
  },
  {
    id: "garage",
    name: "Sublevel B Staging Garage",
    objective: "Find the route signs for triage or rail service.",
    width: 32,
    depth: 24,
    ...GARAGE,
    entry: { x: 0, z: 9.2, yaw: Math.PI },
    walls: [
      { x: -8, z: 4.0, w: 1.2, d: 1.2 },
      { x: 0, z: 4.0, w: 1.2, d: 1.2 },
      { x: 8, z: 4.0, w: 1.2, d: 1.2 },
      { x: -8, z: -4.0, w: 1.2, d: 1.2 },
      { x: 0, z: -4.0, w: 1.2, d: 1.2 },
      { x: 8, z: -4.0, w: 1.2, d: 1.2 },
      { x: 8.0, z: 0, w: 4.8, d: 1.3, label: "wreck" }
    ],
    props: [
      { kind: "car", x: 7.9, z: -0.2, rot: -0.2 },
      { kind: "car", x: -5.8, z: -5.8, rot: 0.4 },
      { kind: "sign", x: -12.4, z: -6.0, rot: -Math.PI * 0.5 },
      { kind: "speaker", x: 2.2, z: 8.4, scale: 0.75 },
      { kind: "barrier", x: -2.0, z: -1.8, rot: 0.24 },
      { kind: "debris", x: 2.2, z: 6.4, scale: 1.4 }
    ],
    enemies: [],
    interactables: [
      {
        id: "garage_radio",
        kind: "radio",
        x: -2.5,
        z: 1.6,
        label: "emergency radio",
        text: "The garage was converted to staging. Triage left. Rail service right. The gate accepted whichever line moved faster."
      },
      { id: "garage_supplies", kind: "supply", x: -11.0, z: 7.5, label: "police belt", payload: { weapons: ["pistol"], ammo: { light: 10 } } },
      { id: "garage_gas", kind: "gascan", x: 4.2, z: 4.4, label: "gas can" },
      { id: "door_pharmacy", kind: "door", x: -13.8, z: -8.6, label: "pharmacy alley", targetZone: "pharmacy" },
      { id: "door_subway", kind: "door", x: 13.8, z: -8.6, label: "subway ramp", targetZone: "subway" }
    ],
    scares: [
      { id: "garage_chain", trigger: "time", after: 7.5, action: "distantScream", sound: "distant_metal", text: "The PA counts three lines. There are only two." },
      {
        id: "garage_first_contact",
        trigger: "time",
        after: 17.0,
        action: "flicker",
        sound: "wet_footstep",
        text: "A shape crosses between two parked cars, then stops.",
        beats: [
          { after: 1.8, cinematic: true, lockInput: 1.0, lookAt: { x: 10.8, z: -6.8 }, sound: "enemy_reveal", text: "It waits until you understand it is looking back." },
          { after: 2.4, action: "spawnRunner", sound: "wall_scrape", objective: "Reach a marked route. Do not waste shots.", spawns: [{ kind: "runner", x: 10.8, z: -6.8 }] }
        ]
      },
      {
        id: "garage_lights",
        trigger: "approach",
        x: 0,
        z: -5.8,
        radius: 5.0,
        action: "lightsOut",
        sound: "blackout_drop",
        text: "The route lights go out aisle by aisle.",
        beats: [
          { after: 1.4, sound: "breath_close", text: "The gate speakers keep counting.", dread: 0.72 },
          { after: 4.2, objective: "Choose triage or rail service before the next blackout.", sound: "gate_hum" }
        ]
      }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: -2.5, z: 1.6 }, text: "Cars were abandoned in lines, not crashes.", sound: "distant_metal" }
    ],
    ambient: ["chain_drag", "distant_metal", "gate_hum"]
  },
  {
    id: "pharmacy",
    name: "Triage Pharmacy",
    objective: "Cross triage and reach the service tunnel.",
    width: 30,
    depth: 24,
    ...PHARM,
    entry: { x: -11.8, z: 8.4, yaw: Math.PI * 0.7 },
    walls: [
      { x: -5.0, z: 4.5, w: 8.4, d: 0.55 },
      { x: 6.0, z: 4.5, w: 7.2, d: 0.55 },
      { x: -4.0, z: 0.0, w: 7.2, d: 0.55 },
      { x: 6.8, z: 0.0, w: 7.8, d: 0.55 },
      { x: -5.0, z: -4.5, w: 8.4, d: 0.55 },
      { x: 6.0, z: -4.5, w: 7.2, d: 0.55 }
    ],
    props: [
      { kind: "shelf", x: -5.0, z: 4.5 },
      { kind: "shelf", x: 6.0, z: 4.5 },
      { kind: "shelf", x: -4.0, z: 0.0 },
      { kind: "shelf", x: 6.8, z: 0.0 },
      { kind: "shelf", x: -5.0, z: -4.5 },
      { kind: "shelf", x: 6.0, z: -4.5 },
      { kind: "curtain", x: 1.2, z: 4.2, rot: Math.PI * 0.5 },
      { kind: "cot", x: -8.8, z: 2.2, rot: 0.1 },
      { kind: "bodybag", x: 8.8, z: -2.8, rot: -0.3 },
      { kind: "sign", x: 12.8, z: 4.0, rot: Math.PI * 0.5 }
    ],
    enemies: [],
    interactables: [
      {
        id: "pharm_photo",
        kind: "note",
        x: -3.2,
        z: 1.9,
        label: "triage tag",
        text: "Category Green: walk. Category Yellow: wait. Category Red: below. Someone stamped every remaining tag Red."
      },
      { id: "pharm_supplies", kind: "supply", x: 11.5, z: 6.4, label: "locked cabinet", payload: { weapons: ["shotgun"], medkits: 1, ammo: { light: 8, shell: 4 } } },
      { id: "pharm_mannequin_a", kind: "mannequin", x: 2.6, z: -2.7, label: "pharmacist shape" },
      { id: "door_boiler_from_pharm", kind: "door", x: 12.8, z: -8.9, label: "service tunnel", targetZone: "boiler" }
    ],
    scares: [
      { id: "pharm_whisper", trigger: "approach", x: -3.2, z: 1.9, radius: 2.0, action: "whisper", sound: "cloth_rustle", text: "The triage curtain moves with no air behind it." },
      {
        id: "pharm_lit_room_blackout",
        trigger: "approach",
        x: 5.6,
        z: 2.8,
        radius: 2.8,
        action: "flicker",
        sound: "flicker_buzz",
        text: "The triage bay is too clean. Too steady.",
        beats: [
          { after: 1.5, action: "lightsOut", sound: "fluorescent_die", text: "Every bulb dies at once.", blackout: 1.7, flicker: 5.0, dread: 0.82 },
          { after: 1.9, cinematic: true, lockInput: 1.0, lookAt: { x: 2.6, z: -5.2 }, sound: "enemy_reveal", text: "One patient is still waiting." },
          {
            after: 2.6,
            action: "spawnRunner",
            sound: "breath_close",
            objective: "Break through the triage bay and reach the tunnel.",
            text: "The curtain tears open from the inside.",
            spawns: [
              { kind: "crawler", x: 2.6, z: -5.2 }
            ]
          },
          { after: 6.8, action: "distantScream", sound: "distant_metal", text: "The PA calls the next group to the service tunnel." }
        ]
      },
      { id: "pharm_screamer", trigger: "interact", interactId: "pharm_supplies", action: "whisper", sound: "pa_broken", text: "The supply cabinet clicks: medication distributed." }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: 1.2, z: 4.2 }, text: "Triage curtains divide the room into choices no one survived.", sound: "cloth_rustle" }
    ],
    ambient: ["floor_creak", "cloth_rustle", "pipe_drip"]
  },
  {
    id: "subway",
    name: "Greenline Service Platform",
    objective: "Cross the service platform when the warning lights change.",
    width: 34,
    depth: 22,
    ...SUBWAY,
    entry: { x: 12.0, z: 8.0, yaw: Math.PI },
    walls: [
      { x: 0, z: 5.6, w: 24, d: 0.55, label: "track edge" },
      { x: 0, z: -5.6, w: 24, d: 0.55, label: "track edge" },
      { x: -8.5, z: 0, w: 0.9, d: 3.5 },
      { x: 0, z: 0, w: 0.9, d: 3.5 },
      { x: 8.5, z: 0, w: 0.9, d: 3.5 }
    ],
    props: [
      { kind: "pillar", x: -8.5, z: 0 },
      { kind: "pillar", x: 0, z: 0 },
      { kind: "pillar", x: 8.5, z: 0 },
      { kind: "sign", x: -12.8, z: -6.8, rot: -Math.PI * 0.5 },
      { kind: "speaker", x: 10.6, z: -6.8, rot: Math.PI * 0.55 },
      { kind: "cable", x: -2.2, z: 5.9, rot: Math.PI * 0.5 },
      { kind: "debris", x: 4.0, z: 6.7, scale: 1.2 }
    ],
    enemies: [],
    interactables: [
      {
        id: "subway_note",
        kind: "note",
        x: 2.4,
        z: -2.5,
        label: "platform message",
        text: "When the platform lights turn red, the service doors open for thirty seconds. They did not write what opens behind you."
      },
      { id: "subway_flare", kind: "supply", x: -1.8, z: 4.2, label: "flare case", payload: { weapons: ["flare"], ammo: { flare: 1 } } },
      { id: "door_escape_from_subway", kind: "door", x: -14.9, z: 0, label: "maintenance door", targetZone: "maintenance_escape" }
    ],
    scares: [
      {
        id: "subway_chase",
        trigger: "approach",
        x: 2.0,
        z: 0.0,
        radius: 5.0,
        action: "startChase",
        sound: "sub_bass_sting",
        objective: "Run for the maintenance door. Do not turn this into a fight.",
        text: "The warning lights turn red behind you.",
        spawns: [{ kind: "brute", x: 13.0, z: 8.2 }],
        beats: [
          { after: 0.6, cinematic: true, lockInput: 1.0, lookAt: { x: 13.0, z: 8.2 }, sound: "enemy_reveal", text: "Something too large for the platform steps into the light." },
          { after: 1.2, action: "lightsOut", sound: "blackout_drop", text: "The platform goes black ahead.", blackout: 1.0, flicker: 3.8 },
          { after: 3.4, action: "distantScream", sound: "wall_scrape", text: "The rails answer from under your feet.", dread: 0.95 }
        ]
      },
      { id: "subway_scream", trigger: "time", after: 12.0, action: "distantScream", sound: "distant_metal" }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: -14.9, z: 0 }, text: "The service platform points straight under the gate.", sound: "gate_hum" }
    ],
    ambient: ["chain_drag", "distant_metal", "flicker_buzz"]
  },
  {
    id: "maintenance_escape",
    name: "Gate Maintenance Corridor",
    objective: "Seal the corridor behind you and reach the boiler access.",
    width: 20,
    depth: 30,
    floor: new Color3(0.035, 0.034, 0.040),
    wall: new Color3(0.080, 0.070, 0.075),
    accent: new Color3(0.42, 0.12, 0.08),
    fog: new Color3(0.026, 0.022, 0.027),
    entry: { x: 0, z: 12.0, yaw: Math.PI },
    walls: [
      { x: -4.5, z: 6.8, w: 0.55, d: 4.8, label: "pipe cage" },
      { x: 4.4, z: 2.0, w: 0.55, d: 5.8, label: "wet conduit" },
      { x: -4.2, z: -4.2, w: 0.55, d: 5.0, label: "fallen rack" },
      { x: 3.8, z: -8.0, w: 0.55, d: 3.8, label: "service stack" }
    ],
    props: [
      { kind: "boiler", x: -6.8, z: 9.0, scale: 0.72 },
      { kind: "shelf", x: 5.4, z: 5.6, rot: Math.PI * 0.5, scale: 0.82 },
      { kind: "cable", x: 0, z: 8.8, rot: Math.PI * 0.5, scale: 1.4 },
      { kind: "speaker", x: -5.8, z: 11.2, scale: 0.72 },
      { kind: "debris", x: -1.6, z: 4.4, scale: 1.4 },
      { kind: "debris", x: 2.8, z: -1.6, scale: 1.1 },
      { kind: "sign", x: -8.7, z: -8.5, rot: -Math.PI * 0.5 }
    ],
    enemies: [],
    interactables: [
      {
        id: "seal_a",
        kind: "seal",
        x: 0,
        z: 7.0,
        w: 5.6,
        d: 0.34,
        h: 2.4,
        radius: 2.1,
        label: "slam the first fire door",
        objective: "Keep moving. Seal the next door before the corridor fills."
      },
      {
        id: "seal_b",
        kind: "seal",
        x: 0,
        z: 1.2,
        w: 5.6,
        d: 0.34,
        h: 2.4,
        radius: 2.1,
        label: "drop the shutter",
        objective: "One more closure. Do not stop to listen."
      },
      {
        id: "seal_c",
        kind: "seal",
        x: 0,
        z: -5.4,
        w: 5.6,
        d: 0.34,
        h: 2.4,
        radius: 2.1,
        label: "seal the last door",
        grantsFlag: "escape_sealed",
        objective: "The corridor is sealed. Get through the boiler door."
      },
      {
        id: "door_boiler_from_escape",
        kind: "door",
        x: 0,
        z: -13.4,
        label: "boiler door",
        targetZone: "boiler",
        lockedUntil: "escape_sealed",
        lockedText: "The boiler door will not release while the corridor behind you is open."
      }
    ],
    scares: [
      {
        id: "escape_enter",
        trigger: "enter",
        action: "startChase",
        sound: "door_slam",
        objective: "Run. Close every barrier behind you.",
        text: "The stairwell door bursts open behind you.",
        spawns: [{ kind: "brute", x: 0, z: 13.0 }],
        beats: [
          { after: 0.4, cinematic: true, lockInput: 0.9, lookAt: { x: 0, z: 13.0 }, sound: "enemy_reveal", text: "The thing from the platform does not fit through the door. It comes through anyway." },
          { after: 2.0, sound: "wall_scrape", text: "The first door buys seconds, not safety.", dread: 0.88 },
          { after: 7.0, sound: "breath_close", text: "The gate PA says: proceed to motor control." }
        ]
      },
      { id: "escape_lights", trigger: "time", after: 5.5, action: "lightsOut", sound: "fluorescent_die", text: "The lights fail in order, from behind you to ahead." },
      { id: "escape_voice", trigger: "time", after: 12.0, action: "whisper", sound: "breath_close", text: "Something presses its weight against the door you just closed." }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: 0, z: 7.0 }, text: "Every door here is built to close from your side.", sound: "distant_metal" }
    ],
    ambient: ["chain_drag", "metal_groan", "breath_close", "gate_hum"]
  },
  {
    id: "boiler",
    name: "Gate Motor Boiler Room",
    objective: "Reach the church motor room under the gate.",
    width: 30,
    depth: 24,
    ...BOILER,
    entry: { x: 0, z: 9.2, yaw: Math.PI },
    walls: [
      { x: -8.8, z: 3.0, w: 3.0, d: 5.0, label: "boiler" },
      { x: 8.8, z: 2.0, w: 3.0, d: 5.0, label: "boiler" },
      { x: -3.0, z: -3.8, w: 7.0, d: 0.65, label: "pipe" },
      { x: 7.4, z: -3.8, w: 5.0, d: 0.65, label: "pipe" }
    ],
    props: [
      { kind: "boiler", x: -8.8, z: 3.0 },
      { kind: "boiler", x: 8.8, z: 2.0 },
      { kind: "gate", x: 0, z: -8.8, scale: 0.8 },
      { kind: "cable", x: -2.8, z: -2.8, rot: 0.1, scale: 1.3 },
      { kind: "speaker", x: 10.8, z: 7.2, scale: 0.7 },
      { kind: "debris", x: 1.8, z: 4.3, scale: 1.6 },
      { kind: "sign", x: 12.6, z: -5.4, rot: Math.PI * 0.5 }
    ],
    enemies: [],
    interactables: [
      { id: "boiler_supplies", kind: "supply", x: -11.4, z: 6.2, label: "worker locker", payload: { weapons: ["pipebomb"], ammo: { shell: 2, explosive: 1 }, medkits: 1 } },
      { id: "boiler_gas", kind: "gascan", x: 2.8, z: -1.8, label: "pressurized canister" },
      { id: "door_crypt", kind: "door", x: 0, z: -10.2, label: "church basement", targetZone: "crypt" }
    ],
    scares: [
      { id: "boiler_radio", trigger: "time", after: 5.0, x: 2.8, z: -1.8, action: "gasLeak", sound: "metal_groan", text: "The pressure gauge spins backward." },
      {
        id: "boiler_brute",
        trigger: "approach",
        x: 0,
        z: -2.0,
        radius: 5.2,
        action: "startChase",
        sound: "chain_drag",
        objective: "Run for the church basement. The heavy one is not worth the shells.",
        text: "Something heavy starts breathing in the pipework.",
        spawns: [{ kind: "brute", x: -9.8, z: -6.0 }],
        beats: [
          { after: 0.6, cinematic: true, lockInput: 1.0, lookAt: { x: -9.8, z: -6.0 }, sound: "enemy_reveal", text: "The boiler room gives it a body." },
          { after: 2.4, sound: "gate_hum", text: "The motor below the church turns once." }
        ]
      }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: 0, z: -10.2 }, text: "All the pipes run toward the church.", sound: "gate_hum" }
    ],
    ambient: ["pipe_drip", "gate_hum", "chain_drag"]
  },
  {
    id: "crypt",
    name: "Gate Crypt",
    objective: "Hold the gate crypt until the motor finishes opening.",
    width: 32,
    depth: 26,
    ...CRYPT,
    entry: { x: 0, z: 10.2, yaw: Math.PI },
    walls: [
      { x: -9.0, z: -2.0, w: 1.0, d: 8.0 },
      { x: 9.0, z: -2.0, w: 1.0, d: 8.0 },
      { x: -4.5, z: 3.8, w: 2.0, d: 3.0 },
      { x: 4.5, z: 3.8, w: 2.0, d: 3.0 }
    ],
    props: [
      { kind: "pew", x: -4.5, z: 3.8 },
      { kind: "pew", x: 4.5, z: 3.8 },
      { kind: "pillar", x: -9.0, z: -2.0 },
      { kind: "pillar", x: 9.0, z: -2.0 },
      { kind: "gate", x: 0, z: -11.4, scale: 0.9 },
      { kind: "candle", x: -2.8, z: -5.4, scale: 1.1 },
      { kind: "candle", x: 2.8, z: -5.4, scale: 1.1 },
      { kind: "speaker", x: -7.0, z: 8.8, scale: 0.7 },
      { kind: "cable", x: 0, z: -1.6, rot: Math.PI * 0.5, scale: 1.5 },
      { kind: "debris", x: 0, z: -3.6, scale: 1.8 }
    ],
    enemies: [],
    interactables: [
      {
        id: "crypt_radio",
        kind: "radio",
        x: 0,
        z: 1.0,
        label: "gate radio",
        text: "The motor is beneath your feet. The gate will open when the old speaker finishes counting down."
      },
      { id: "door_freedom", kind: "door", x: 0, z: -11.8, label: "freedom gate", targetZone: "freedom", lockedUntil: "gate_open" }
    ],
    scares: [
      {
        id: "crypt_stalk",
        trigger: "enter",
        action: "patientStalk",
        sound: "shrine_hum",
        text: "The PA reaches zero. The thing the gate was built around stands up.",
        spawns: [{ kind: "patient_zero", x: 0, z: -7.6 }],
        beats: [
          { after: 0.8, cinematic: true, lockInput: 1.3, lookAt: { x: 0, z: -7.6 }, sound: "enemy_reveal", text: "Patient Zero is not blocking the exit. It is guarding the mechanism." },
          { after: 4.4, objective: "Stay alive until the motor releases the gate.", sound: "gate_hum", dread: 0.92 }
        ]
      },
      { id: "crypt_gate", trigger: "time", after: 34, action: "openGate", sound: "metal_groan", objective: "The gate is open. Run through it.", text: "The gate motor catches. The lock finally gives." },
      { id: "crypt_lowhp", trigger: "lowHp", hpFrac: 0.35, action: "whisper", sound: "breath_close", text: "It changes pace when you limp." }
    ],
    intro: [
      { after: 0.5, cinematic: true, lockInput: 1.0, lookAt: { x: 0, z: -11.8 }, text: "The road, the lobby, the lines, the tunnels - all of it ends under this gate.", sound: "gate_hum" }
    ],
    ambient: ["shrine_hum", "gate_hum", "chain_drag"]
  },
  {
    id: "freedom",
    name: "Freedom Gate",
    objective: "Step through the open gate.",
    width: 26,
    depth: 18,
    floor: new Color3(0.030, 0.036, 0.040),
    wall: new Color3(0.07, 0.075, 0.08),
    accent: new Color3(0.65, 0.45, 0.20),
    fog: new Color3(0.035, 0.042, 0.048),
    entry: { x: 0, z: 5.8, yaw: Math.PI },
    walls: [],
    props: [
      { kind: "debris", x: -2, z: 1.5, scale: 1.2 },
      { kind: "gate", x: 0, z: -7.2, scale: 1.0 },
      { kind: "sign", x: 0, z: -5.8 }
    ],
    enemies: [],
    interactables: [
      {
        id: "ending_note",
        kind: "note",
        x: 0,
        z: -3.6,
        label: "gate plaque",
        text: "Beyond the wall, the loudspeakers are still counting survivors. The number does not change when you step through."
      }
    ],
    scares: [
      { id: "freedom_end", trigger: "time", after: 3, action: "whisper", sound: "pa_broken", text: "Beyond the wall, the same broadcast begins again in the distance." }
    ],
    intro: [
      { after: 0.4, cinematic: true, lockInput: 1.2, lookAt: { x: 0, z: -7.2 }, text: "The gate opens onto air that should feel different.", sound: "wind" }
    ],
    ambient: ["wind", "pa_broken"],
    isEnding: true
  }
];

export const ZONE_BY_ID = Object.fromEntries(ZONES.map((z) => [z.id, z])) as Record<string, ZoneDef>;

export const STARTING_INVENTORY: WeaponId[] = ["bat"];
