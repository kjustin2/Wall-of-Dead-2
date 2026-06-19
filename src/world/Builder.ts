import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  CELL, GRID_W, GRID_H, WALL_H, PILLARS, PROPS, ITEMS, LIGHT_DEFS, SIGNS,
  type ItemDef, type LightDef
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

  // ceiling pipes along the service routes
  const pipeMat = assets.material("metal");
  const pipeRuns: Array<[number, number, number, number, number, number]> = [
    // x1, z1, x2, z2, y, radius
    [12, 6.55, 72, 6.55, 2.72, 0.055],
    [12, 7.3, 72, 7.3, 2.6, 0.035],
    [81.3, 6, 81.3, 26, 2.7, 0.05],
    [66.5, 30, 66.5, 60, 2.65, 0.05],
    [25, 24.6, 55, 24.6, 2.55, 0.05],
    [7, 28.5, 21, 28.5, 2.6, 0.04]
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
  // the drag smear: from the platform's west door to where it sits
  {
    const x1 = 66, z1 = 37, x2 = 87, z2 = 58;
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

  // ceiling lights
  const lights = new Map<string, LightHandle>();
  for (const ld of LIGHT_DEFS) {
    const [x, z] = level.cellCenter(ld.cx, ld.cy);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      emissive: new THREE.Color(ld.color),
      emissiveIntensity: ld.off ? 0 : 0.85
    });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.09, 0.24), mat);
    fixture.position.set(x, WALL_H - 0.06, z);
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

  // items
  const items = new Map<string, ItemHandle>();
  let panelLed = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2010, emissiveIntensity: 1.4 });
  let coreScreen = new THREE.MeshStandardMaterial({ color: 0x111416, emissive: 0x882017, emissiveIntensity: 0.9 });
  for (const it of ITEMS) {
    const [x, z] = level.cellCenter(it.cx, it.cy);
    const obj = new THREE.Group();
    let baseY = 0.55;
    if (it.kind === "fuse") {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.34, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x553311, emissive: 0xcc5510, emissiveIntensity: 0.5 })
      );
      obj.add(m);
    } else if (it.kind === "battery") {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.22, 10),
        new THREE.MeshStandardMaterial({ color: 0x3a4416, emissive: 0x9aa830, emissiveIntensity: 0.45 })
      );
      obj.add(m);
      baseY = 0.45;
    } else if (it.kind === "bottles") {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x1d3a22, emissive: 0x2a5532, emissiveIntensity: 0.35, roughness: 0.2
      });
      for (let i = 0; i < 2; i++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8), mat);
        b.position.set(i * 0.18 - 0.09, 0, 0);
        obj.add(b);
      }
      baseY = 0.4;
    } else if (it.kind === "note") {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.42),
        new THREE.MeshStandardMaterial({
          color: 0xb0a890, emissive: 0x665e48, emissiveIntensity: 0.3, side: THREE.DoubleSide
        })
      );
      m.rotation.x = -Math.PI / 2 + 0.25;
      obj.add(m);
      baseY = 0.5;
    } else if (it.kind === "panel") {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.7, 1.3), metal);
      body.position.set(0.85, 1.3, 0); // against east wall
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), panelLed);
      led.position.set(0.7, 1.95, -0.4);
      const slots = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.5, 0.8),
        new THREE.MeshStandardMaterial({ color: 0x16181a, roughness: 0.9 })
      );
      slots.position.set(0.7, 1.25, 0);
      obj.add(body, led, slots);
      baseY = 0;
    } else if (it.kind === "hatch") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 8, 20), metal);
      ring.position.set(0, 1.5, -0.92);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.12), rust);
      plate.position.set(0, 1.25, -1.0);
      obj.add(plate, ring);
      baseY = 0;
    } else if (it.kind === "console") {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.7), metal);
      cab.position.y = 0.5;
      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.12, 0.95), metal);
      deck.position.y = 1.02;
      deck.rotation.x = -0.12;
      // the screen: dead red until the signal is restored (Director swaps it green)
      coreScreen = new THREE.MeshStandardMaterial({ color: 0x111416, emissive: 0x882017, emissiveIntensity: 0.9 });
      const screen = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.46, 0.04), coreScreen);
      screen.position.set(0, 1.5, -0.28);
      screen.rotation.x = -0.3;
      obj.add(cab, deck, screen);
      baseY = 0;
    }
    obj.position.set(x, baseY, z);
    group.add(obj);
    items.set(it.id, { def: it, obj, baseY, taken: false });
  }

  return { group, lights, doorHandles, items, panelLed, coreScreen, exitSigns, props };
}
