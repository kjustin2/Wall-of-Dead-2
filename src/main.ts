import * as THREE from "three";
import { Input } from "./core/Input";
import { AudioFX } from "./core/AudioFX";
import { Level } from "./world/Level";
import { buildWorld } from "./world/Builder";
import { PLAYER_START, STALKER_START, ITEMS } from "./world/data";
import { Player } from "./game/Player";
import { Stalker } from "./game/Stalker";
import { Director, type InteractTarget } from "./game/Director";
import { Hud } from "./ui/Hud";

type GameState = "title" | "playing" | "paused" | "over";

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x04050a, 0.044);
scene.add(new THREE.HemisphereLight(0x232c3e, 0x07080c, 1.15));

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
camera.rotation.order = "YXZ";

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- world ----------
const level = new Level();
const world = buildWorld(level);
scene.add(world.group);

const input = new Input(renderer.domElement);
const fx = new AudioFX();
const hud = new Hud();

const player = new Player(input, fx, level);
{
  const [px, pz] = level.cellCenter(PLAYER_START.cx, PLAYER_START.cy);
  player.x = px;
  player.z = pz;
  player.yaw = PLAYER_START.yaw;
}

const stalker = new Stalker(level, fx);
{
  const [sx, sz] = level.cellCenter(STALKER_START.cx, STALKER_START.cy);
  stalker.setPos(sx, sz);
}
scene.add(stalker.group);

const director = new Director(level, world, player, stalker, hud, fx);

// ---------- flashlight ----------
/** irregular torch cookie so the beam has a dirty, real edge */
function makeTorchCookie(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 8, 128, 128, 124);
  grad.addColorStop(0, "#ffffff");
  grad.addColorStop(0.4, "#e6e6e6");
  grad.addColorStop(0.62, "#9a9a9a");
  grad.addColorStop(0.85, "#2e2e2e");
  grad.addColorStop(1, "#000000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // grime blotches near the rim + a faint inner ring
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 70 + Math.random() * 52;
    g.fillStyle = `rgba(0,0,0,${0.1 + Math.random() * 0.22})`;
    g.beginPath();
    g.ellipse(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 6 + Math.random() * 16, 4 + Math.random() * 10, a, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(0,0,0,0.16)";
  g.lineWidth = 9;
  g.beginPath();
  g.arc(128, 128, 64, 0, Math.PI * 2);
  g.stroke();
  return new THREE.CanvasTexture(c);
}

const lampRig = new THREE.Object3D();
scene.add(lampRig);
const flashlight = new THREE.SpotLight(0xffe8c4, 0, 38, 0.52, 0.5, 1.0);
flashlight.map = makeTorchCookie();
flashlight.castShadow = true;
flashlight.shadow.mapSize.set(1024, 1024);
flashlight.shadow.camera.near = 0.2;
flashlight.shadow.camera.far = 34;
flashlight.shadow.bias = -0.003;
const lampTarget = new THREE.Object3D();
scene.add(lampTarget);
flashlight.target = lampTarget;
lampRig.add(flashlight);
// faint spill so the torch also lights the player's immediate area
const spill = new THREE.PointLight(0xffe2b8, 0, 5, 1.6);
lampRig.add(spill);

// ---------- dust motes (only readable inside the beam) ----------
const DUST_N = 320;
const dustPos = new Float32Array(DUST_N * 3);
const dustVel = new Float32Array(DUST_N);
for (let i = 0; i < DUST_N; i++) {
  dustPos[i * 3] = player.x + (Math.random() - 0.5) * 24;
  dustPos[i * 3 + 1] = Math.random() * 2.9;
  dustPos[i * 3 + 2] = player.z + (Math.random() - 0.5) * 24;
  dustVel[i] = 0.03 + Math.random() * 0.09;
}
const dustGeo = new THREE.BufferGeometry();
dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
const dustMat = new THREE.PointsMaterial({
  color: 0xcabb9e, size: 0.022, transparent: true, opacity: 0, depthWrite: false
});
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);

function updateDust(dt: number, t: number): void {
  const targetOpacity = player.lightOn ? 0.34 : 0;
  dustMat.opacity += (targetOpacity - dustMat.opacity) * Math.min(1, 5 * dt);
  dust.visible = dustMat.opacity > 0.01;
  if (!dust.visible) return;
  for (let i = 0; i < DUST_N; i++) {
    dustPos[i * 3 + 1] -= dustVel[i] * dt;
    dustPos[i * 3] += Math.sin(t * 0.7 + i) * 0.05 * dt;
    const dx = dustPos[i * 3] - player.x;
    const dz = dustPos[i * 3 + 2] - player.z;
    if (dustPos[i * 3 + 1] < 0 || dx * dx + dz * dz > 169) {
      dustPos[i * 3] = player.x + (Math.random() - 0.5) * 22;
      dustPos[i * 3 + 1] = 0.3 + Math.random() * 2.6;
      dustPos[i * 3 + 2] = player.z + (Math.random() - 0.5) * 22;
    }
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ---------- bottles ----------
interface Bottle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
}
const bottles: Bottle[] = [];
const bottleGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.26, 8);
const bottleMat = new THREE.MeshStandardMaterial({ color: 0x2a4a30, roughness: 0.25 });

function throwBottle(): void {
  if (player.bottles <= 0 || player.frozen) return;
  player.bottles--;
  const mesh = new THREE.Mesh(bottleGeo, bottleMat);
  const sinY = Math.sin(player.yaw);
  const cosY = Math.cos(player.yaw);
  const cosP = Math.cos(player.pitch);
  const sinP = Math.sin(player.pitch);
  const dir = new THREE.Vector3(-sinY * cosP, sinP, -cosY * cosP);
  mesh.position.set(player.x + dir.x * 0.5, player.eyeY + dir.y * 0.5 - 0.1, player.z + dir.z * 0.5);
  const vel = dir.multiplyScalar(10.5).add(new THREE.Vector3(0, 2.2, 0));
  scene.add(mesh);
  bottles.push({ mesh, vel });
  fx.uiClick();
}

function updateBottles(dt: number): void {
  for (let i = bottles.length - 1; i >= 0; i--) {
    const b = bottles[i];
    b.vel.y -= 13 * dt;
    b.mesh.position.addScaledVector(b.vel, dt);
    b.mesh.rotation.x += dt * 9;
    const p = b.mesh.position;
    const [cx, cy] = level.worldToCell(p.x, p.z);
    if (p.y <= 0.06 || (p.y < 3 && level.isBlocked(cx, cy))) {
      fx.glass(p.x, p.z);
      level.addNoise(p.x, p.z, 16);
      scene.remove(b.mesh);
      bottles.splice(i, 1);
    }
  }
}

// ---------- interaction ----------
function findTarget(): InteractTarget | null {
  const [fx_, fz_] = player.forward();
  let best: InteractTarget | null = null;
  let bestD = Infinity;

  for (const it of ITEMS) {
    const h = world.items.get(it.id)!;
    if (h.taken) continue;
    const [tx, tz] = director.cellWorld(it.cx, it.cy);
    const dx = tx - player.x;
    const dz = tz - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.5 || d < 0.01) continue;
    if ((dx / d) * fx_ + (dz / d) * fz_ < 0.35) continue;
    if (!level.los(player.x, player.z, tx, tz)) continue;
    if (d < bestD) {
      bestD = d;
      best = { type: "item", id: it.id };
    }
  }
  for (const door of level.doors) {
    if (door.broken) continue;
    const [tx, tz] = level.cellCenter(door.cx, door.cy);
    const dx = tx - player.x;
    const dz = tz - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) continue;
    if ((dx / d) * fx_ + (dz / d) * fz_ < 0.3) continue;
    if (d < bestD) {
      bestD = d;
      best = { type: "door", id: door.def.id };
    }
  }
  return best;
}

// ---------- door + light presentation ----------
const lightDrop = new Map<string, number>();

function updateDoors(dt: number): void {
  for (const h of world.doorHandles.values()) {
    const target = h.door.targetOpen ? 1 : 0;
    const closingSpeed = h.door.def.kind === "fire" ? 5.5 : 3;
    const speed = target > h.door.openT ? 2.2 : closingSpeed;
    if (h.door.openT !== target) {
      const dir = Math.sign(target - h.door.openT);
      h.door.openT = Math.max(0, Math.min(1, h.door.openT + dir * speed * dt));
      h.pivot.rotation.y = h.door.openT * h.swing;
    }
  }
}

function updateLights(dt: number, t: number): void {
  for (const [id, lh] of world.lights) {
    let v = lh.on ? lh.base : 0;
    if (v > 0 && lh.def.flicker) {
      v *= 0.78 + 0.22 * Math.sin(t * 9 + lh.phase * 7) * Math.sin(t * 23.7 + lh.phase);
      let drop = lightDrop.get(id) ?? 0;
      if (drop > 0) {
        drop -= dt;
        lightDrop.set(id, drop);
        v *= 0.06;
      } else if (Math.random() < 0.009) {
        lightDrop.set(id, 0.05 + Math.random() * 0.25);
      }
    }
    if (lh.dipT > 0) {
      lh.dipT -= dt;
      v *= 0.05;
    }
    if (lh.pulse && v > 0) v *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 3.6 + lh.phase));
    lh.light.intensity += (v - lh.light.intensity) * Math.min(1, 22 * dt);
    lh.mat.emissiveIntensity = lh.light.intensity > 0.5 ? 0.85 * (lh.light.intensity / Math.max(1, lh.base)) : 0.02;
  }
  // exit signs breathe, and occasionally stutter
  for (let i = 0; i < world.exitSigns.length; i++) {
    const m = world.exitSigns[i];
    m.emissiveIntensity = 0.72 + 0.2 * Math.sin(t * 2.1 + i * 1.7) + (Math.random() < 0.012 ? -0.5 : 0);
  }
}

function updateItems(t: number): void {
  for (const h of world.items.values()) {
    if (h.taken || h.def.kind === "panel" || h.def.kind === "hatch") continue;
    h.obj.position.y = h.baseY + Math.sin(t * 1.8 + h.baseY * 13 + h.def.cx) * 0.04;
    if (h.def.kind !== "note") h.obj.rotation.y = t * 0.8;
  }
}

// ---------- game state ----------
let state: GameState = "title";
hud.showScreen("title");

function startGame(): void {
  fx.init();
  state = "playing";
  hud.showScreen(null);
  hud.show();
  hud.blackout(0, 2.2);
  input.enabled = true;
  input.requestLock();
}

document.getElementById("btn-start")!.addEventListener("click", startGame);
document.getElementById("btn-resume")!.addEventListener("click", () => {
  if (state === "paused") input.requestLock();
});
for (const id of ["btn-retry", "btn-again"]) {
  document.getElementById(id)!.addEventListener("click", () => location.reload());
}

document.addEventListener("pointerlockchange", () => {
  if (state === "playing" && !input.locked) {
    // lock lost (Esc / alt-tab): dismiss any open note so resuming drops you
    // back into the world rather than a stale modal, then pause
    if (hud.noteOpen) hud.closeNote();
    player.frozen = director.over;
    state = "paused";
    input.enabled = false;
    hud.showScreen("pause");
  } else if (state === "paused" && input.locked) {
    state = "playing";
    input.enabled = true;
    player.frozen = director.over; // never resume stuck-frozen
    hud.showScreen(null);
  }
});

director.onDeath = (text) => {
  state = "over";
  input.enabled = false;
  document.exitPointerLock();
  document.getElementById("dead-text")!.textContent = text;
  hud.showScreen("dead");
};
director.onWin = (text) => {
  state = "over";
  input.enabled = false;
  document.exitPointerLock();
  document.getElementById("win-text")!.textContent = text;
  hud.showScreen("win");
};

// ---------- camera feel ----------
let shake = 0;
let fovCurrent = 72;
stalker.onBash = () => {
  const d = Math.hypot(stalker.x - player.x, stalker.z - player.z);
  shake = Math.max(shake, 0.85 / (1 + d * 0.25));
};

// ---------- main loop ----------
const clock = new THREE.Clock();

function frame(): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (state === "playing") {
    // Capture modal state at the START of the frame. The E press that closes a
    // note must not also drive a world interaction later in the same frame
    // (input isn't flushed until end of frame), or it would instantly re-open
    // the same note and trap the reader.
    const noteWasOpen = hud.noteOpen;
    if (noteWasOpen) {
      player.frozen = true;
      // E closes the note. (Escape can't reach here under pointer lock — it
      // releases the lock and is handled as a pause below.)
      if (input.justPressed("KeyE")) {
        hud.closeNote();
        player.frozen = director.over;
      }
    }

    player.update(dt);
    if (input.justPressed("KeyQ")) throwBottle();

    // interaction — suppressed on any frame a note was open so the closing E
    // press is consumed exactly once
    let target: InteractTarget | null = null;
    if (!noteWasOpen && !director.over) {
      target = findTarget();
      const text = target ? director.promptFor(target) : null;
      hud.prompt(text);
      if (target && text && input.justPressed("KeyE")) director.interact(target);
    } else {
      hud.prompt(null);
    }

    if (!director.dying) stalker.update(dt, player, director.playerLit());
    level.noises.length = 0;
    director.update(dt);
    updateBottles(dt);

    // audio mood
    const threat = director.over ? 0 : stalker.threat(player);
    fx.update(dt, threat, stalker.state === "chase" && !director.over);
    hud.chase(stalker.state === "chase" && !director.over);

    // hud meters
    hud.battery(player.battery, player.lightOn);
    hud.bottles(player.bottles);
    hud.stamina(player.stamina, player.exhausted);
    hud.update(dt);
  }

  // kill-cam: forced eye contact, then dark
  if (director.dying) {
    const dx = stalker.x - player.x;
    const dz = stalker.z - player.z;
    const d = Math.max(0.4, Math.hypot(dx, dz));
    const targetYaw = Math.atan2(-dx, -dz);
    let dy = targetYaw - player.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    player.yaw += dy * Math.min(1, 12 * dt);
    const targetPitch = Math.atan2(2.2 - player.eyeY, d);
    player.pitch += (targetPitch - player.pitch) * Math.min(1, 12 * dt);
    shake = Math.max(shake, 0.35);
  }

  // proximity dread shake during a chase
  if (!director.over && stalker.state === "chase") {
    const d = Math.hypot(stalker.x - player.x, stalker.z - player.z);
    if (d < 6) shake = Math.max(shake, ((6 - d) / 6) * 0.16);
  }

  // camera from player
  camera.position.set(player.x, player.eyeY + player.bobOffset, player.z);
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  camera.rotation.z = player.lean;
  if (shake > 0.001) {
    camera.rotation.x += (Math.random() - 0.5) * shake * 0.05;
    camera.rotation.y += (Math.random() - 0.5) * shake * 0.05;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.03;
    shake = Math.max(0, shake - dt * 1.5);
  }

  // FOV: widens with sprint, narrows onto its face when it takes you
  const fovTarget = director.dying ? 54 : player.sprinting && player.moving ? 78 : 72;
  fovCurrent += (fovTarget - fovCurrent) * Math.min(1, 6 * dt);
  if (Math.abs(fovCurrent - camera.fov) > 0.05) {
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }

  // flashlight follows camera with lag
  lampRig.position.lerp(camera.position, Math.min(1, 18 * dt));
  lampRig.quaternion.slerp(camera.quaternion, Math.min(1, 9 * dt));
  const lampDir = new THREE.Vector3(0, 0, -1).applyQuaternion(lampRig.quaternion);
  lampTarget.position.copy(lampRig.position).addScaledVector(lampDir, 12);
  let lampPower = player.lightOn ? 60 : 0;
  if (player.lightOn && player.battery < 0.18) {
    lampPower *= 0.6 + 0.4 * Math.sin(t * 31) * Math.sin(t * 17.3);
    if (Math.random() < 0.02) lampPower *= 0.1;
  }
  flashlight.intensity += (lampPower - flashlight.intensity) * Math.min(1, 24 * dt);
  spill.intensity = flashlight.intensity * 0.035;

  updateDoors(dt);
  updateLights(dt, t);
  updateItems(t);
  updateDust(dt, t);

  renderer.render(scene, camera);
  input.flush();
}

frame();

// debug/test hook (used by scripts/smoke.mjs and scripts/tour.mjs)
declare global {
  interface Window {
    __game?: unknown;
  }
}
window.__game = { player, stalker, director, level, world, fx, hud, startGame };
