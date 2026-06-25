import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CELL, GRID_W, GRID_H, WALL_H, PILLARS, PROPS, ITEMS, LIGHT_DEFS, SIGNS, SCARES,
  type ItemDef, type LightDef, type ScareDef
} from "./data";
import type { Level, Door } from "./Level";
import type { Assets } from "../core/Assets";

export interface LightHandle {
  def: LightDef;
  light: THREE.PointLight;
  mat: THREE.MeshStandardMaterial;
  base: number;
  phase: number;
  on: boolean;
  /** seconds of forced brownout remaining */
  dipT: number;
  /** alarm-style pulsing (escape route) */
  pulse: boolean;
}

export interface DoorHandle {
  door: Door;
  pivot: THREE.Group;
  swing: number;
}

export interface ItemHandle {
  def: ItemDef;
  obj: THREE.Object3D;
  baseY: number;
  taken: boolean;
}

export interface ScareHandle {
  def: ScareDef;
  /** prop root, positioned + facing; the Director toggles `visible` when it fires */
  root: THREE.Group;
  /** the swung (hang) / moved (dart) / dropped (drop) / flashed (face) child */
  pivot: THREE.Group;
  /** resting Y of the pivot once a drop lands */
  restY: number;
}

export interface BuiltWorld {
  group: THREE.Group;
  lights: Map<string, LightHandle>;
  doorHandles: Map<string, DoorHandle>;
  items: Map<string, ItemHandle>;
  panelLed: THREE.MeshStandardMaterial;
  /** the repeater-core screen material — Director turns it green on broadcast */
  coreScreen: THREE.MeshStandardMaterial;
  exitSigns: THREE.MeshStandardMaterial[];
  /** prop slots (positioned groups holding primitives) so GLB models can be
   *  swapped in once they finish loading; see main.ts */
  props: Array<{ group: THREE.Group; kind: string }>;
  /** hidden visual false-scares, revealed + animated by the Director */
  scares: Map<string, ScareHandle>;
}

// deterministic rng for clutter
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function makeSignTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#101113";
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = "rgba(255,255,255,0.18)";
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = color;
  g.font = "600 26px 'Segoe UI', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34, 236);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a faded ID-photograph of someone who was sent down and did not return */
function makePortraitTexture(seed: number): THREE.CanvasTexture {
  const rnd = lcg(seed);
  const c = document.createElement("canvas");
  c.width = 96;
  c.height = 128;
  const g = c.getContext("2d")!;
  // aged paper
  const paper = 28 + rnd() * 26;
  g.fillStyle = `rgb(${paper + 14},${paper + 8},${paper})`;
  g.fillRect(0, 0, 96, 128);
  // backdrop panel
  g.fillStyle = `rgb(${18 + rnd() * 14},${20 + rnd() * 14},${24 + rnd() * 14})`;
  g.fillRect(8, 8, 80, 112);
  // shoulders
  const skin = 120 + rnd() * 70;
  g.fillStyle = `rgb(${skin * 0.6},${skin * 0.58},${skin * 0.56})`;
  g.beginPath();
  g.ellipse(48, 128, 34, 30, 0, Math.PI, 0, true);
  g.fill();
  // head
  g.fillStyle = `rgb(${skin},${skin * 0.95},${skin * 0.9})`;
  g.beginPath();
  g.ellipse(48, 58 + rnd() * 6, 20 + rnd() * 4, 26 + rnd() * 4, 0, 0, Math.PI * 2);
  g.fill();
  // hollow eyes
  g.fillStyle = "rgba(0,0,0,0.55)";
  for (const dx of [-8, 8]) {
    g.beginPath();
    g.ellipse(48 + dx, 54, 3.5, 4.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // grain + scratches
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(0,0,0,${rnd() * 0.16})`;
    g.fillRect(rnd() * 96, rnd() * 128, 1, 1);
  }
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo(rnd() * 96, 0);
    g.lineTo(rnd() * 96, 128);
    g.stroke();
  }
  // vignette
  const vg = g.createRadialGradient(48, 60, 20, 48, 64, 80);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.7)");
  g.fillStyle = vg;
  g.fillRect(0, 0, 96, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** an aged, hand-scrawled note: ruled paper, jittery "handwriting", a coffee stain */
function makeNoteTexture(seed: number): THREE.CanvasTexture {
  const rnd = lcg(seed);
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = 260;
  const g = c.getContext("2d")!;
  // aged paper, warm and uneven
  const base = 188 + rnd() * 28;
  g.fillStyle = `rgb(${base},${base - 10},${base - 30})`;
  g.fillRect(0, 0, 200, 260);
  // blotchy aging
  for (let i = 0; i < 60; i++) {
    const x = rnd() * 200, y = rnd() * 260, r = 8 + rnd() * 36;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(120,96,56,${rnd() * 0.10})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // faint ruled lines
  g.strokeStyle = "rgba(70,90,120,0.18)";
  g.lineWidth = 1;
  for (let y = 40; y < 250; y += 22) {
    g.beginPath(); g.moveTo(14, y); g.lineTo(186, y); g.stroke();
  }
  // a heading + rows of jittery "handwriting" strokes
  g.strokeStyle = "rgba(20,18,22,0.72)";
  for (let row = 0; row < 9; row++) {
    const y = 34 + row * 22 + (rnd() - 0.5) * 3;
    const heading = row === 0;
    let x = 18 + (heading ? 0 : rnd() * 8);
    const right = 186 - rnd() * (heading ? 70 : 30 + rnd() * 60);
    g.lineWidth = heading ? 2.2 : 1.1 + rnd() * 0.6;
    g.beginPath();
    g.moveTo(x, y);
    while (x < right) {
      const step = 3 + rnd() * 6;
      x += step;
      // break words with small gaps
      if (rnd() < 0.16) { g.moveTo(x + 4, y); x += 4; continue; }
      g.lineTo(x, y - (rnd() - 0.5) * (heading ? 7 : 5));
    }
    g.stroke();
  }
  // coffee-ring stain
  {
    const x = 40 + rnd() * 120, y = 150 + rnd() * 80, r = 18 + rnd() * 16;
    g.strokeStyle = `rgba(96,64,30,${0.18 + rnd() * 0.16})`;
    g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    const grad = g.createRadialGradient(x, y, r * 0.4, x, y, r);
    grad.addColorStop(0, "rgba(120,80,40,0)");
    grad.addColorStop(1, "rgba(110,72,34,0.12)");
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // darkened/worn edges
  const vg = g.createRadialGradient(100, 130, 70, 100, 130, 150);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(20,12,4,0.5)");
  g.fillStyle = vg;
  g.fillRect(0, 0, 200, 260);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a gaunt pale face on a transparent ground — for the "face at the glass" scare */
function makeFaceTexture(seed: number): THREE.CanvasTexture {
  const rnd = lcg(seed);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 128, 160);
  const fx = 64, fy = 84;
  const grd = g.createRadialGradient(fx, fy, 8, fx, fy, 64);
  grd.addColorStop(0, "rgba(198,192,180,0.98)");
  grd.addColorStop(0.7, "rgba(150,144,132,0.9)");
  grd.addColorStop(1, "rgba(18,18,20,0)");
  g.fillStyle = grd;
  g.beginPath(); g.ellipse(fx, fy, 40, 56, 0, 0, Math.PI * 2); g.fill();
  // hollow eyes
  g.fillStyle = "rgba(4,4,6,0.92)";
  for (const dx of [-15, 15]) { g.beginPath(); g.ellipse(fx + dx, fy - 8, 8, 11, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "rgba(180,200,210,0.5)";
  for (const dx of [-15, 15]) { g.beginPath(); g.arc(fx + dx - 2, fy - 11, 1.6, 0, Math.PI * 2); g.fill(); }
  // gaunt mouth
  g.strokeStyle = "rgba(6,4,6,0.8)"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(fx - 12, fy + 26); g.quadraticCurveTo(fx, fy + 34, fx + 12, fy + 26); g.stroke();
  for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.12})`; g.fillRect(fx - 40 + rnd() * 80, fy - 56 + rnd() * 112, 1, 1); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** a crude humanoid body from capsule primitives (origin at the feet) */
function makeBody(skin: THREE.Material, cloth: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.5, 4, 8), cloth);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), skin);
  head.position.y = 1.55;
  const armGeo = new THREE.CapsuleGeometry(0.06, 0.42, 4, 6);
  const armL = new THREE.Mesh(armGeo, cloth); armL.position.set(-0.22, 1.0, 0); armL.rotation.z = 0.2;
  const armR = new THREE.Mesh(armGeo, cloth); armR.position.set(0.22, 1.0, 0); armR.rotation.z = -0.2;
  const legGeo = new THREE.CapsuleGeometry(0.08, 0.5, 4, 6);
  const legL = new THREE.Mesh(legGeo, cloth); legL.position.set(-0.1, 0.5, 0);
  const legR = new THREE.Mesh(legGeo, cloth); legR.position.set(0.1, 0.5, 0);
  g.add(torso, head, armL, armR, legL, legR);
  return g;
}

const FACE_ROT: Record<string, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const FACE_OFF: Record<string, [number, number]> = { s: [0, 1.01], n: [0, -1.01], e: [1.01, 0], w: [-1.01, 0] };

export function buildWorld(level: Level, assets: Assets): BuiltWorld {
  const group = new THREE.Group();
  const rnd = lcg(777);

  const wallMat = assets.material("wall");
  const floorMat = assets.material("floor");
  const ceilMat = assets.material("ceiling");

  // floor + ceiling
  const W = GRID_W * CELL;
  const H = GRID_H * CELL;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(W / 2, 0, H / 2);
  floor.receiveShadow = true;
  group.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, H), ceilMat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(W / 2, WALL_H, H / 2);
  group.add(ceil);

  // walls: solid cells adjacent to open cells
  const wallGeos: THREE.BufferGeometry[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      if (!level.solid[level.idx(x, y)]) continue;
      let exposed = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const nx = x + ox;
        const ny = y + oy;
        if (level.inBounds(nx, ny) && !level.solid[level.idx(nx, ny)]) {
          exposed = true;
          break;
        }
      }
      if (!exposed) continue;
      const geo = new THREE.BoxGeometry(CELL, WALL_H, CELL);
      const u = 0.92 + rnd() * 0.16; // subtle per-cell uv variety via scale not possible post-merge; skip
      void u;
      geo.translate(x * CELL + CELL / 2, WALL_H / 2, y * CELL + CELL / 2);
      wallGeos.push(geo);
    }
  }
  const wallsMesh = new THREE.Mesh(mergeGeometries(wallGeos), wallMat);
  wallsMesh.castShadow = true;
  wallsMesh.receiveShadow = true;
  group.add(wallsMesh);
  wallGeos.forEach((g) => g.dispose());

  // pillars (reuse the wall concrete)
  const pillarMat = assets.material("wall");
  const pillarGeo = new THREE.BoxGeometry(0.85, WALL_H, 0.85);
  for (const [cx, cy] of PILLARS) {
    const [x, z] = level.cellCenter(cx, cy);
    const m = new THREE.Mesh(pillarGeo, pillarMat);
    m.position.set(x, WALL_H / 2, z);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }

  // props (real CC0 PBR materials)
  const wood = assets.material("wood");
  const woodDark = assets.material("wood");
  const metal = assets.material("metal");
  const rust = assets.material("rust");
  const props: Array<{ group: THREE.Group; kind: string }> = [];
  for (const p of PROPS) {
    const [x, z] = level.cellCenter(p.cx, p.cy);
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = p.rot ?? rnd() * Math.PI;
    if (p.kind === "desk") {
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.85), wood);
      top.position.y = 0.78;
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.7, 0.7), woodDark);
      body.position.y = 0.38;
      g.add(top, body);
    } else if (p.kind === "bench") {
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.48), wood);
      seat.position.y = 0.46;
      const back = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.08), wood);
      back.position.set(0, 0.75, -0.22);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.44, 0.4), woodDark);
      legs.position.y = 0.22;
      g.add(seat, back, legs);
    } else if (p.kind === "crates") {
      for (let i = 0; i < 3; i++) {
        const s = 0.55 + rnd() * 0.3;
        const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), i % 2 ? wood : woodDark);
        c.position.set((rnd() - 0.5) * 0.8, s / 2 + (i === 2 ? 0.62 : 0), (rnd() - 0.5) * 0.8);
        c.rotation.y = rnd();
        g.add(c);
      }
    } else {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.4, 0.95, 12), rust);
      b.position.y = 0.475;
      g.add(b);
    }
    g.traverse((m) => {
      m.castShadow = true;
      m.receiveShadow = true;
    });
    group.add(g);
    props.push({ group: g, kind: p.kind });
  }

  // ceiling pipes along the service routes (new hub-and-spoke layout)
  const pipeMat = assets.material("metal");
  const pipeRuns: Array<[number, number, number, number, number, number]> = [
    // x1, z1, x2, z2, y, radius  (world metres; new hub-and-spoke layout)
    [37, 59, 87, 59, 2.72, 0.055],   // concourse, e-w
    [37, 60, 87, 60, 2.6, 0.035],
    [115, 49, 115, 81, 2.68, 0.05],  // platform, n-s
    [7, 61, 21, 61, 2.6, 0.045],     // maintenance, e-w
    [61, 19, 61, 38, 2.62, 0.04],    // arrival hall, n-s
    [61, 83, 61, 105, 2.58, 0.045],  // service stair, n-s
    [29, 127, 83, 127, 2.6, 0.05]    // intake archive, e-w
  ];
  for (const [x1, z1, x2, z2, y, r] of pipeRuns) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), pipeMat);
    m.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
    if (Math.abs(x2 - x1) > Math.abs(z2 - z1)) m.rotation.z = Math.PI / 2;
    else m.rotation.x = Math.PI / 2;
    group.add(m);
  }

  // old stains on the floor
  const stainMat = new THREE.MeshStandardMaterial({
    color: 0x050507, roughness: 0.55, transparent: true, opacity: 0.62,
    polygonOffset: true, polygonOffsetFactor: -1
  });
  for (let i = 0; i < 14; i++) {
    const cx = Math.floor(rnd() * GRID_W);
    const cy = Math.floor(rnd() * GRID_H);
    if (level.solid[level.idx(cx, cy)] || level.obstacle[level.idx(cx, cy)] || level.doorAt.has(level.idx(cx, cy))) continue;
    const s = new THREE.Mesh(new THREE.CircleGeometry(0.4 + rnd() * 0.9, 10), stainMat);
    const [x, z] = level.cellCenter(cx, cy);
    s.rotation.x = -Math.PI / 2;
    s.position.set(x + (rnd() - 0.5), 0.012, z + (rnd() - 0.5));
    s.scale.x = 0.6 + rnd();
    group.add(s);
  }
  // the drag smear: from the platform's west door toward the dark far (south) end
  {
    const x1 = 105, z1 = 65, x2 = 117, z2 = 79;
    const len = Math.hypot(x2 - x1, z2 - z1);
    const geo = new THREE.PlaneGeometry(0.55, len);
    geo.rotateX(-Math.PI / 2);
    const smear = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: 0x070608, roughness: 0.4, transparent: true, opacity: 0.5,
      polygonOffset: true, polygonOffsetFactor: -1
    }));
    smear.position.set((x1 + x2) / 2, 0.015, (z1 + z2) / 2);
    smear.rotation.y = Math.atan2(x2 - x1, z2 - z1);
    group.add(smear);
  }

  // scattered debris
  for (let i = 0; i < 90; i++) {
    const cx = Math.floor(rnd() * GRID_W);
    const cy = Math.floor(rnd() * GRID_H);
    if (level.solid[level.idx(cx, cy)] || level.obstacle[level.idx(cx, cy)] || level.doorAt.has(level.idx(cx, cy))) continue;
    const s = 0.06 + rnd() * 0.22;
    const d = new THREE.Mesh(
      new THREE.BoxGeometry(s, s * 0.5, s * (0.5 + rnd())),
      rnd() < 0.5 ? woodDark : metal
    );
    const [x, z] = level.cellCenter(cx, cy);
    d.position.set(x + (rnd() - 0.5) * 1.4, s * 0.25, z + (rnd() - 0.5) * 1.4);
    d.rotation.y = rnd() * Math.PI;
    d.receiveShadow = true;
    group.add(d);
  }

  // doors
  const doorHandles = new Map<string, DoorHandle>();
  const frameMat = assets.material("metal");
  const doorMat = assets.material("wood");
  // fire doors keep a custom red so they stay readable as the choke-point doors
  const fireMat = new THREE.MeshStandardMaterial({ color: 0x5e2e20, roughness: 0.65, metalness: 0.35 });
  for (const door of level.doors) {
    const [x, z] = level.cellCenter(door.cx, door.cy);
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    if (door.def.axis === "x") root.rotation.y = Math.PI / 2; // doorway travel along x -> panel spans x after rot
    // local space: travel along -z/+z, panel spans x
    const fGeo = new THREE.BoxGeometry(0.3, WALL_H, 0.42);
    const f1 = new THREE.Mesh(fGeo, frameMat);
    f1.position.set(-0.85, WALL_H / 2, 0);
    const f2 = new THREE.Mesh(fGeo, frameMat);
    f2.position.set(0.85, WALL_H / 2, 0);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(2, WALL_H - 2.55, 0.42), frameMat);
    lintel.position.set(0, 2.55 + (WALL_H - 2.55) / 2, 0);
    root.add(f1, f2, lintel);
    const pivot = new THREE.Group();
    pivot.position.set(-0.7, 0, 0);
    const isFire = door.def.kind === "fire";
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.55, isFire ? 0.12 : 0.07), isFire ? fireMat : doorMat);
    panel.position.set(0.7, 1.275, 0);
    panel.castShadow = true;
    if (isFire) {
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.3, 0.13),
        new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.7 })
      );
      stripe.position.set(0.7, 1.5, 0);
      pivot.add(stripe);
    } else {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), metal);
      knob.position.set(1.22, 1.05, 0.08);
      pivot.add(knob);
    }
    pivot.add(panel);
    root.add(pivot);
    root.traverse((m) => {
      m.receiveShadow = true;
    });
    group.add(root);
    const swing = 1.92;
    pivot.rotation.y = door.openT * swing;
    doorHandles.set(door.def.id, { door, pivot, swing });
  }

  // lift cage at the shaft head — you rode it down; you ride it out
  {
    const cageMat = assets.material("metal");
    const cage = new THREE.Group();
    const cx = 63, cz = 11; // world centre of the shaft head (new layout)
    const hw = 3.6, hd = 3.0;
    const postGeo = new THREE.BoxGeometry(0.12, WALL_H - 0.1, 0.12);
    for (const [ox, oz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]] as const) {
      const p = new THREE.Mesh(postGeo, cageMat);
      p.position.set(cx + ox, (WALL_H - 0.1) / 2, cz + oz);
      p.castShadow = true;
      cage.add(p);
    }
    // top rails
    const railX = new THREE.BoxGeometry(hw * 2, 0.1, 0.1);
    const railZ = new THREE.BoxGeometry(0.1, 0.1, hd * 2);
    for (const oz of [-hd, hd]) {
      const r = new THREE.Mesh(railX, cageMat);
      r.position.set(cx, WALL_H - 0.12, cz + oz);
      cage.add(r);
    }
    for (const ox of [-hw, hw]) {
      const r = new THREE.Mesh(railZ, cageMat);
      r.position.set(cx + ox, WALL_H - 0.12, cz);
      cage.add(r);
    }
    // a few vertical guard bars on the north/side walls (mesh-cage feel)
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, WALL_H - 0.2, 6);
    for (let i = -2; i <= 2; i++) {
      const b = new THREE.Mesh(barGeo, cageMat);
      b.position.set(cx + i * 1.4, (WALL_H - 0.2) / 2, cz - hd);
      cage.add(b);
    }
    cage.traverse((m) => { m.receiveShadow = true; });
    group.add(cage);
  }

  // ceiling lights (recessed in a dark housing so they read as mounted fixtures)
  const lights = new Map<string, LightHandle>();
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x131419, roughness: 0.7, metalness: 0.3 });
  const housingGeo = new THREE.BoxGeometry(1.06, 0.14, 0.38);
  for (const ld of LIGHT_DEFS) {
    const [x, z] = level.cellCenter(ld.cx, ld.cy);
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.set(x, WALL_H - 0.05, z);
    housing.castShadow = true;
    housing.receiveShadow = true;
    group.add(housing);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: new THREE.Color(ld.color),
      emissiveIntensity: ld.off ? 0 : 0.85
    });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.24), mat);
    fixture.position.set(x, WALL_H - 0.12, z);
    group.add(fixture);
    const light = new THREE.PointLight(ld.color, ld.off ? 0 : ld.intensity, 20, 1.4);
    light.position.set(x, WALL_H - 0.35, z);
    group.add(light);
    lights.set(ld.id, {
      def: ld, light, mat, base: ld.intensity, phase: Math.random() * 10, on: !ld.off, dipT: 0, pulse: false
    });
  }

  // signs
  const exitSigns: THREE.MeshStandardMaterial[] = [];
  for (const s of SIGNS) {
    const [x, z] = level.cellCenter(s.cx, s.cy);
    const tex = makeSignTexture(s.text, s.color ?? "#c8c2ae");
    const isExit = s.color === "#56d877";
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0xffffff,
      emissiveMap: tex,
      emissiveIntensity: isExit ? 0.9 : 0.32
    });
    if (isExit) exitSigns.push(mat);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.42), mat);
    const [ox, oz] = FACE_OFF[s.face];
    plane.position.set(x + ox, 2.45, z + oz);
    plane.rotation.y = FACE_ROT[s.face];
    group.add(plane);
  }

  // the wall of faces — intake archive north wall (z = 118), the Act III reveal.
  // Every face ever sent down to fix Repeater 4, floor to higher than a man can reach.
  {
    const faceRnd = lcg(9157);
    const portraits = [0, 1, 2, 3, 4].map((i) => makePortraitTexture(1000 + i * 37));
    const faceGeo = new THREE.PlaneGeometry(0.46, 0.61);
    for (let yi = 0; yi < 4; yi++) {
      for (let x = 30; x <= 82; x += 2.6) {
        if (x > 57 && x < 65) continue;        // leave the d_intake doorway clear (cell x30)
        if (faceRnd() < 0.12) continue;        // organic gaps
        const tex = portraits[Math.floor(faceRnd() * portraits.length)];
        const mat = new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.07, roughness: 0.95
        });
        const m = new THREE.Mesh(faceGeo, mat);
        m.position.set(
          x + (faceRnd() - 0.5) * 0.5,
          0.95 + yi * 0.55 + (faceRnd() - 0.5) * 0.12,
          118.03
        );
        m.rotation.z = (faceRnd() - 0.5) * 0.16;
        m.scale.setScalar(0.85 + faceRnd() * 0.4);
        group.add(m);
      }
    }
  }

  // items — pickups rest on small supply crates so nothing floats in mid-air;
  // the objective fixtures (panel/hatch/console) mount to the wall/floor.
  const items = new Map<string, ItemHandle>();
  let panelLed = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.4 });
  let coreScreen = new THREE.MeshStandardMaterial({ color: 0x111416, emissive: 0x882017, emissiveIntensity: 0.9 });
  // shared detail materials for the hand-props
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xcabfa2, roughness: 0.62, metalness: 0 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb0894a, roughness: 0.34, metalness: 0.9 });
  const darkPlastic = new THREE.MeshStandardMaterial({ color: 0x191b1e, roughness: 0.62, metalness: 0.1 });
  const labelYellow = new THREE.MeshStandardMaterial({ color: 0xb39a36, roughness: 0.72, metalness: 0 });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x24492c, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.62,
    emissive: 0x12301a, emissiveIntensity: 0.4
  });
  // pickups rest on a small wooden supply crate: a body, corner battens and top/
  // bottom frame rails so it reads as crated stores, not a plain plinth.
  const PED_TOP = 0.4;
  const pedGeo = new THREE.BoxGeometry(0.5, PED_TOP, 0.5);
  const battenMat = new THREE.MeshStandardMaterial({ color: 0x6b5536, roughness: 0.82, metalness: 0 });
  const battenV = new THREE.BoxGeometry(0.07, PED_TOP + 0.01, 0.07);
  const railH = new THREE.BoxGeometry(0.54, 0.06, 0.07);
  const addPedestal = (px: number, pz: number): void => {
    const crate = new THREE.Group();
    crate.position.set(px, 0, pz);
    crate.rotation.y = rnd() * Math.PI;
    const body = new THREE.Mesh(pedGeo, woodDark);
    body.position.y = PED_TOP / 2;
    crate.add(body);
    // four corner battens
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const b = new THREE.Mesh(battenV, battenMat);
      b.position.set(sx * 0.235, PED_TOP / 2, sz * 0.235);
      crate.add(b);
    }
    // top + bottom frame rails on the two visible faces
    for (const sz of [-1, 1]) for (const yy of [0.06, PED_TOP - 0.06]) {
      const r = new THREE.Mesh(railH, battenMat);
      r.position.set(0, yy, sz * 0.235);
      crate.add(r);
      const r2 = new THREE.Mesh(railH, battenMat);
      r2.rotation.y = Math.PI / 2;
      r2.position.set(sz * 0.235, yy, 0);
      crate.add(r2);
    }
    crate.traverse((m) => { m.castShadow = true; m.receiveShadow = true; });
    group.add(crate);
  };
  for (const it of ITEMS) {
    const [x, z] = level.cellCenter(it.cx, it.cy);
    const obj = new THREE.Group();
    let baseY = 0;
    if (it.kind === "fuse") {
      // a ceramic cartridge breaker fuse: brass end-caps, a band, and a live-amber window
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.057, 0.057, 0.22, 18), ceramic);
      const capGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.045, 18);
      const capT = new THREE.Mesh(capGeo, brass); capT.position.y = 0.122;
      const capB = new THREE.Mesh(capGeo, brass); capB.position.y = -0.122;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.055, 18), darkPlastic);
      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.075, 0.014),
        new THREE.MeshStandardMaterial({ color: 0x3a1a05, emissive: 0xff6a14, emissiveIntensity: 1.7 })
      );
      win.position.set(0, 0, 0.058);
      obj.add(body, capT, capB, band, win);
      addPedestal(x, z);
      baseY = PED_TOP + 0.15; // stood on the crate
    } else if (it.kind === "battery") {
      // an industrial torch cell: dark casing, a hazard label band, terminal + charge LED
      const casing = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.2, 18), darkPlastic);
      const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0535, 0.0535, 0.1, 18), labelYellow);
      label.position.y = -0.01;
      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.054, 0.054, 0.016, 18),
        new THREE.MeshStandardMaterial({ color: 0x0e0e0e, roughness: 0.7 })
      );
      stripe.position.y = 0.05;
      const term = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.03, 14), brass);
      term.position.y = 0.115;
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.013, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0x0a2a0a, emissive: 0x7bff3a, emissiveIntensity: 1.6 })
      );
      led.position.set(0, 0.02, 0.052);
      obj.add(casing, label, stripe, term, led);
      addPedestal(x, z);
      baseY = PED_TOP + 0.12;
    } else if (it.kind === "bottles") {
      // proper glass bottles: body, tapered shoulder, neck, cap, paper label
      const labelMat = new THREE.MeshStandardMaterial({ color: 0x8a7d5a, roughness: 0.9, side: THREE.DoubleSide });
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.2, 16), glass);
        body.position.y = 0.1;
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.06, 16), glass);
        shoulder.position.y = 0.23;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.07, 12), glass);
        neck.position.y = 0.295;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.026, 12), metal);
        cap.position.y = 0.345;
        const label = new THREE.Mesh(new THREE.CylinderGeometry(0.0515, 0.0555, 0.072, 16, 1, true), labelMat);
        label.position.y = 0.09;
        b.add(body, shoulder, neck, cap, label);
        b.position.set(i * 0.15 - 0.075, 0, i ? 0.03 : -0.02);
        b.rotation.y = rnd() * Math.PI;
        obj.add(b);
      }
      addPedestal(x, z);
      baseY = PED_TOP + 0.01; // bottles stand on their base on the crate
    } else if (it.kind === "note") {
      const tex = makeNoteTexture(it.cx * 131 + it.cy * 7 + 3);
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.34, 0.44),
        new THREE.MeshStandardMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.28,
          roughness: 0.96, side: THREE.DoubleSide
        })
      );
      m.rotation.x = -Math.PI / 2;        // laid flat, like dropped paper
      m.rotation.z = (rnd() - 0.5) * 0.5; // slightly askew
      obj.add(m);
      addPedestal(x, z);
      baseY = PED_TOP + 0.015;
    } else if (it.kind === "panel") {
      // a breaker cabinet against the east wall (interior faces -x): switch banks,
      // a dial gauge, conduit to the ceiling, and status LEDs
      const cabMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.55, metalness: 0.7 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.7, 1.3), cabMat);
      body.position.set(0.86, 1.3, 0);
      const recess = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 1.42, 1.0),
        new THREE.MeshStandardMaterial({ color: 0x131517, roughness: 0.9 })
      );
      recess.position.set(0.7, 1.3, 0);
      obj.add(body, recess);
      // two columns of breaker switches with crooked little levers
      const switchBody = new THREE.MeshStandardMaterial({ color: 0x202327, roughness: 0.7 });
      const leverMat = new THREE.MeshStandardMaterial({ color: 0xc9ad48, roughness: 0.5 });
      for (let col = 0; col < 2; col++) {
        for (let row = 0; row < 6; row++) {
          const zz = (col - 0.5) * 0.34;
          const yy = 1.78 - row * 0.16;
          const sw = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.16), switchBody);
          sw.position.set(0.66, yy, zz);
          const lever = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.05), leverMat);
          lever.position.set(0.63, yy + (row % 2 ? 0.03 : -0.03), zz);
          obj.add(sw, lever);
        }
      }
      // round dial gauge with a needle pinned over-range (dead power)
      const gauge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.04, 22),
        new THREE.MeshStandardMaterial({ color: 0x0a0c0e, roughness: 0.3, metalness: 0.4 })
      );
      gauge.rotation.z = Math.PI / 2;
      gauge.position.set(0.68, 0.66, 0.34);
      const needle = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.1, 0.008),
        new THREE.MeshStandardMaterial({ color: 0xcc3322, emissive: 0xcc3322, emissiveIntensity: 0.5 })
      );
      needle.position.set(0.655, 0.69, 0.34);
      needle.rotation.x = 0.7;
      obj.add(gauge, needle);
      // conduit rising to the ceiling
      const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 8), metal);
      conduit.position.set(0.82, 2.25, 0.52);
      obj.add(conduit);
      // the main fault LED — kept on the panelLed material the Director toggles
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), panelLed);
      led.position.set(0.66, 1.95, -0.42);
      obj.add(led);
      baseY = 0;
    } else if (it.kind === "hatch") {
      // a sealed OVERHEAD escape bulkhead with a fixed ladder up to it — the manual
      // way to the surface (the lift only came down). Reads as a real exit, grounded
      // on the floor and set into the ceiling, not a door floating in mid-air.
      const hazMat = new THREE.MeshStandardMaterial({ color: 0xb9a23a, roughness: 0.7, emissive: 0x161200, emissiveIntensity: 0.25 });
      const rim = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.2, 1.62), metal);   // frame set into the ceiling
      rim.position.set(0, WALL_H - 0.1, 0);
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.14, 1.34), rust);  // heavy closed hatch
      door.position.set(0, WALL_H - 0.05, 0);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 20), metal); // locking wheel below it
      wheel.position.set(0, WALL_H - 0.5, 0);
      wheel.rotation.x = Math.PI / 2;
      const collar = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.64, 22), hazMat); // hazard collar on the floor
      collar.rotation.x = -Math.PI / 2;
      collar.position.y = 0.02;
      obj.add(rim, door, wheel, collar);
      const railGeo = new THREE.BoxGeometry(0.06, WALL_H - 0.2, 0.06);              // fixed ladder up to it
      const railL = new THREE.Mesh(railGeo, metal); railL.position.set(-0.3, (WALL_H - 0.2) / 2, 0.5);
      const railR = new THREE.Mesh(railGeo, metal); railR.position.set(0.3, (WALL_H - 0.2) / 2, 0.5);
      obj.add(railL, railR);
      const rungGeo = new THREE.BoxGeometry(0.66, 0.05, 0.05);
      for (let i = 0; i < 6; i++) {
        const rung = new THREE.Mesh(rungGeo, metal);
        rung.position.set(0, 0.35 + i * 0.42, 0.5);
        obj.add(rung);
      }
      obj.traverse((m) => { m.castShadow = true; });
      baseY = 0;
    } else if (it.kind === "console") {
      const cabMat = new THREE.MeshStandardMaterial({ color: 0x34383b, roughness: 0.55, metalness: 0.7 });
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.7), cabMat);
      cab.position.y = 0.5;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.95), cabMat);
      deck.position.y = 1.02;
      deck.rotation.x = -0.12;
      obj.add(cab, deck);
      // a worn keyboard tray with a grid of keys, on the operator (-z) side
      const kbBase = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.04, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.82 })
      );
      kbBase.position.set(0, 1.075, -0.18);
      kbBase.rotation.x = 0.12;
      obj.add(kbBase);
      const keyMat = new THREE.MeshStandardMaterial({ color: 0x44484c, roughness: 0.68 });
      const keyGeo = new THREE.BoxGeometry(0.05, 0.022, 0.045);
      for (let r = 0; r < 3; r++) {
        for (let cc = 0; cc < 12; cc++) {
          const k = new THREE.Mesh(keyGeo, keyMat);
          k.position.set(-0.33 + cc * 0.06, 1.108 - r * 0.012, -0.1 - r * 0.058);
          k.rotation.x = 0.12;
          obj.add(k);
        }
      }
      // recessed screen + bezel; dead red until the signal is restored (Director swaps green)
      const bezel = new THREE.Mesh(
        new THREE.BoxGeometry(0.86, 0.62, 0.06),
        new THREE.MeshStandardMaterial({ color: 0x17191b, roughness: 0.6, metalness: 0.4 })
      );
      bezel.position.set(0, 1.5, -0.29);
      bezel.rotation.x = -0.3;
      coreScreen = new THREE.MeshStandardMaterial({ color: 0x111416, emissive: 0x882017, emissiveIntensity: 0.9 });
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.46, 0.04), coreScreen);
      screen.position.set(0, 1.5, -0.26);
      screen.rotation.x = -0.3;
      obj.add(bezel, screen);
      // a row of chunky buttons + status LEDs on the operator-facing (-z) cabinet face
      const btnMat = new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.6 });
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12), btnMat);
        b.rotation.x = Math.PI / 2;
        b.position.set(-0.42 + i * 0.1, 0.78, -0.36);
        obj.add(b);
      }
      const ledColors = [0x7bff3a, 0xffb020, 0xff3020];
      for (let i = 0; i < 3; i++) {
        const led = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0x101010, emissive: ledColors[i], emissiveIntensity: 1.2 })
        );
        led.position.set(0.18 + i * 0.06, 0.78, -0.36);
        obj.add(led);
      }
      // ventilation louvres along the operator-facing base
      const ventMat = new THREE.MeshStandardMaterial({ color: 0x0a0c0d, roughness: 0.92 });
      for (let i = 0; i < 4; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.016, 0.012), ventMat);
        v.position.set(0, 0.32 - i * 0.06, -0.355);
        obj.add(v);
      }
      // power conduit: two heavy cables drooping from the cabinet base into a floor duct
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x131210, roughness: 0.86 });
      for (let i = 0; i < 2; i++) {
        const ox = -0.2 + i * 0.4;
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(ox, 0.32, 0.35),
          new THREE.Vector3(ox * 1.1, 0.1, 0.52),
          new THREE.Vector3(ox * 1.15, 0.04, 0.72),
          new THREE.Vector3(ox * 1.15, 0.03, 0.95)
        ]);
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, 0.022, 7), cableMat);
        tube.castShadow = true;
        obj.add(tube);
      }
      baseY = 0;
    }
    obj.position.set(x, baseY, z);
    group.add(obj);
    items.set(it.id, { def: it, obj, baseY, taken: false });
  }

  // ---- visual false-scares: built hidden, revealed + animated by the Director ----
  const scares = new Map<string, ScareHandle>();
  const paleMat = new THREE.MeshStandardMaterial({ color: 0xb7b0a2, roughness: 0.92, emissive: 0x0b0a09, emissiveIntensity: 0.18 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.96 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x4f4429, roughness: 0.9 });
  for (const sc of SCARES) {
    const [x, z] = level.cellCenter(sc.cx, sc.cy);
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = FACE_ROT[sc.face];
    let pivot: THREE.Group;
    let restY = 0;
    if (sc.kind === "hang") {
      // a body hung from the ceiling; the pivot swings on reveal
      pivot = new THREE.Group();
      pivot.position.set(0, WALL_H, 0);          // anchor at the ceiling
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6), ropeMat);
      rope.position.y = -0.4;
      const body = makeBody(paleMat, clothMat);
      body.position.y = -2.25;                    // head ~y2.2, feet ~y0.65 (dangling)
      body.rotation.x = 0.06;
      pivot.add(rope, body);
      root.add(pivot);
    } else if (sc.kind === "dart") {
      // a dark silhouette that sprints across the far doorway, then is gone
      pivot = new THREE.Group();
      pivot.add(makeBody(clothMat, clothMat));
      root.add(pivot);
    } else if (sc.kind === "drop") {
      // a body that falls from the ceiling with a slam
      pivot = new THREE.Group();
      pivot.position.y = WALL_H;                  // starts at the ceiling
      pivot.add(makeBody(paleMat, clothMat));
      root.add(pivot);
      restY = 0.2;
    } else {
      // a pale face that presses to the wall (local +z faces into the room after rot)
      pivot = new THREE.Group();
      const faceTex = makeFaceTexture(sc.cx * 7 + sc.cy + 11);
      const faceMat = new THREE.MeshStandardMaterial({
        map: faceTex, transparent: true, emissive: 0xffffff, emissiveMap: faceTex,
        emissiveIntensity: 0.3, roughness: 0.95, side: THREE.DoubleSide, depthWrite: false
      });
      const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.66), faceMat);
      facePlane.position.set(0, 1.6, 0.92);
      pivot.add(facePlane);
      root.add(pivot);
    }
    root.traverse((m) => { if ((m as THREE.Mesh).isMesh) m.castShadow = true; });
    root.visible = false;
    group.add(root);
    scares.set(sc.id, { def: sc, root, pivot, restY });
  }

  return { group, lights, doorHandles, items, panelLed, coreScreen, exitSigns, props, scares };
}
