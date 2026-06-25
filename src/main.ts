import "@fontsource/cinzel/600.css";
import "@fontsource/cinzel/700.css";
import "@fontsource/oswald/300.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import * as THREE from "three";
import { Input } from "./core/Input";
import { AudioFX } from "./core/AudioFX";
import { Post } from "./core/Post";
import { Perf } from "./core/Perf";
import { Assets } from "./core/Assets";
import { Save, type Settings } from "./core/Save";
import { Level } from "./world/Level";
import { buildWorld } from "./world/Builder";
import { PLAYER_START, STALKER_START, ITEMS } from "./world/data";
import { Player } from "./game/Player";
import { Stalker } from "./game/Stalker";
import { Director, type InteractTarget } from "./game/Director";
import { Cinematic, type Cutscene } from "./game/Cinematic";
import { Hud } from "./ui/Hud";
import { Wayfinder } from "./ui/Wayfinder";

type GameState = "title" | "playing" | "cinematic" | "paused" | "over";

const app = document.getElementById("app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;
app.appendChild(renderer.domElement);

const assets = new Assets(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020304);
scene.fog = new THREE.FogExp2(0x04050a, 0.044);
scene.add(new THREE.HemisphereLight(0x232c3e, 0x07080c, 1.15));

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.08, 90);
camera.rotation.order = "YXZ";

const post = new Post(renderer, scene, camera);
const perf = new Perf(renderer);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
  if (!optEl("options").classList.contains("hidden")) updateResReadout();
});

// ---------- world ----------
const level = new Level();
const world = buildWorld(level, assets);
scene.add(world.group);

const loadNote = document.getElementById("loadnote");
assets
  .load((frac) => {
    if (loadNote) loadNote.textContent = `loading textures ${Math.round(frac * 100)}%`;
  })
  .then(() => {
    loadNote?.classList.add("hidden");
    for (const p of world.props) {
      const m = assets.model(p.kind);
      if (m) {
        p.group.clear();
        p.group.add(m);
      }
    }
  });

const input = new Input(renderer.domElement);
const fx = new AudioFX();
const hud = new Hud();
const wayfinder = new Wayfinder();
const cine = new Cinematic(hud);

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

// main owns the game-state machine; the Director asks for cutscenes through this.
function playCut(cut: Cutscene, onDone?: () => void): void {
  state = "cinematic";
  input.enabled = false;
  player.frozen = true;
  // the player is frozen with the camera on rails; never let the creature reach
  // and kill them mid-cutscene. Reveal beats re-arm this via beginReveal/endReveal.
  stalker.frozen = true;
  wayfinder.setHidden(true);
  hud.hide(); // no gameplay HUD over a cutscene (letterbox + caption stay)
  cine.play(cut, () => {
    onDone?.();
    if (!director.over) {
      state = "playing";
      input.enabled = true;
      player.frozen = false;
      stalker.frozen = false;
      wayfinder.setHidden(false);
      hud.show();
      if (!input.locked) input.requestLock();
    }
  });
}

const director = new Director(level, world, player, stalker, hud, fx, playCut);

// ---------- flashlight ----------
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
const spill = new THREE.PointLight(0xffe2b8, 0, 5, 1.6);
lampRig.add(spill);

// ---------- perf tier: shadows + dust scale with the graphics quality ----------
// The flashlight shadow is a full second scene render every frame; sizing its map
// (and the dust JS work) to the tier is the biggest per-frame win on weak GPUs,
// and it reacts to auto-tune so a struggling device sheds cost automatically.
let perfLowFx = false;
function applyPerfTier(q: "off" | "low" | "medium" | "high"): void {
  perfLowFx = q === "low" || q === "off";
  const mapSize = q === "high" ? 1024 : q === "medium" ? 768 : 512;
  if (flashlight.shadow.mapSize.x !== mapSize) {
    flashlight.shadow.mapSize.set(mapSize, mapSize);
    flashlight.shadow.map?.dispose();
    flashlight.shadow.map = null; // force three to rebuild at the new size
  }
  renderer.shadowMap.type = perfLowFx ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.shadowMap.needsUpdate = true;
}
post.onQuality = applyPerfTier;
applyPerfTier(post.getQuality());

// ---------- objective beacon (diegetic wayfinding glint) ----------
function makeGlow(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(190,235,210,0.9)");
  grad.addColorStop(0.4, "rgba(150,215,185,0.35)");
  grad.addColorStop(1, "rgba(120,200,160,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const beacon = new THREE.Group();
const beaconBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.02, 0.05, 2.4, 6, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x9fe0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
beaconBeam.position.y = 1.2;
const beaconGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeGlow(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
beaconGlow.scale.set(0.7, 0.7, 1);
beaconGlow.position.y = 0.45;
beacon.add(beaconBeam, beaconGlow);
beacon.visible = false;
scene.add(beacon);

function updateBeacon(t: number): void {
  const tgt = director.objectiveTarget;
  const show = !!tgt && !director.chase && !director.over && cine.active === false;
  beacon.visible = show;
  if (!show || !tgt) return;
  beacon.position.set(tgt.x, 0, tgt.z);
  const pulse = 0.18 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.4));
  (beaconBeam.material as THREE.MeshBasicMaterial).opacity = pulse * 0.7;
  (beaconGlow.material as THREE.SpriteMaterial).opacity = pulse;
}

// ---------- dust motes ----------
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
const dustMat = new THREE.PointsMaterial({ color: 0xcabb9e, size: 0.022, transparent: true, opacity: 0, depthWrite: false });
const dust = new THREE.Points(dustGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);

function updateDust(dt: number, t: number): void {
  if (perfLowFx) { dust.visible = false; return; } // skip the 320-point loop on low tiers
  const targetOpacity = player.lightOn ? 0.34 : 0;
  dustMat.opacity += (targetOpacity - dustMat.opacity) * Math.min(1, 5 * dt);
  dust.visible = dustMat.opacity > 0.01;
  if (!dust.visible) return;
  const cx = camera.position.x;
  const cz = camera.position.z;
  for (let i = 0; i < DUST_N; i++) {
    dustPos[i * 3 + 1] -= dustVel[i] * dt;
    dustPos[i * 3] += Math.sin(t * 0.7 + i) * 0.05 * dt;
    const dx = dustPos[i * 3] - cx;
    const dz = dustPos[i * 3 + 2] - cz;
    if (dustPos[i * 3 + 1] < 0 || dx * dx + dz * dz > 169) {
      dustPos[i * 3] = cx + (Math.random() - 0.5) * 22;
      dustPos[i * 3 + 1] = 0.3 + Math.random() * 2.6;
      dustPos[i * 3 + 2] = cz + (Math.random() - 0.5) * 22;
    }
  }
  dustGeo.attributes.position.needsUpdate = true;
}

// ---------- bottles ----------
interface Bottle { mesh: THREE.Mesh; vel: THREE.Vector3 }
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
    const h = world.items.get(it.id);
    if (!h || h.taken) continue;
    const [tx, tz] = director.cellWorld(it.cx, it.cy);
    const dx = tx - player.x;
    const dz = tz - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.5 || d < 0.01) continue;
    if ((dx / d) * fx_ + (dz / d) * fz_ < 0.35) continue;
    if (!level.los(player.x, player.z, tx, tz)) continue;
    if (d < bestD) { bestD = d; best = { type: "item", id: it.id }; }
  }
  for (const door of level.doors) {
    if (door.broken) continue;
    const [tx, tz] = level.cellCenter(door.cx, door.cy);
    const dx = tx - player.x;
    const dz = tz - player.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2 || d < 0.01) continue; // guard the dx/d normalize below
    if ((dx / d) * fx_ + (dz / d) * fz_ < 0.3) continue;
    if (d < bestD) { bestD = d; best = { type: "door", id: door.def.id }; }
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
  for (let i = 0; i < world.exitSigns.length; i++) {
    const m = world.exitSigns[i];
    m.emissiveIntensity = 0.72 + 0.2 * Math.sin(t * 2.1 + i * 1.7) + (Math.random() < 0.012 ? -0.5 : 0);
  }
}

function updateItems(t: number): void {
  for (const h of world.items.values()) {
    if (h.taken || h.def.kind === "panel" || h.def.kind === "hatch" || h.def.kind === "console") continue;
    if (h.def.kind === "note") continue; // notes lie flat on the crate — no hover/spin
    // a subtle glint-bob just above the crate surface (not a mid-air hover)
    h.obj.position.y = h.baseY + Math.sin(t * 1.8 + h.baseY * 13 + h.def.cx) * 0.02;
    h.obj.rotation.y = t * 0.8;
  }
}

// ---------- game state ----------
let state: GameState = "title";

// persisted checkpoints — show a clear "auto-saving" sign at each one
director.onCheckpoint = (d) => {
  Save.write(d);
  if (!document.getElementById("letterbox")?.classList.contains("on")) {
    hud.toast("✓ CHECKPOINT — AUTO-SAVING…", 2.6);
  }
};

// reflect any existing save on the title screen
function refreshTitleMenu(): void {
  const save = Save.load();
  const cont = document.getElementById("btn-continue")!;
  const beat = document.getElementById("continue-beat")!;
  cont.classList.toggle("hidden", !save);
  beat.textContent = save ? save.beat : "";
  document.getElementById("btn-start")!.textContent = save ? "NEW GAME" : "DESCEND";
}
hud.showScreen("title");
refreshTitleMenu();

function clearBottles(): void {
  for (const b of bottles) scene.remove(b.mesh);
  bottles.length = 0;
}

function newGame(): void {
  Save.clear();
  applyFullscreenPref(); // honor the saved display-mode preference (this is a user gesture)
  fx.init();
  hud.showScreen(null);
  hud.show();
  // grab pointer lock now, inside the click gesture, so mouse-look is live the
  // instant the intro cutscene hands back control.
  input.requestLock();
  director.begin(); // plays the descent cutscene, which sets state = "cinematic"
}

/** resume from the last checkpoint — works from the title or in-place after death */
function continueGame(): void {
  const save = Save.load();
  if (!save) { newGame(); return; }
  applyFullscreenPref();
  fx.init();
  // wipe transient overlays / projectiles so nothing carries over
  clearBottles();
  shake = 0;
  hud.closeNote();
  hud.letterbox(false);
  hud.chase(false);
  hud.damageFlash(0);
  hud.blackout(0, 1.2);
  director.restore(save);
  state = "playing";
  input.enabled = true;
  hud.showScreen(null);
  hud.show();
  input.requestLock();
}

/** exit to the title screen in-place (no reload); CONTINUE then resumes from the
 *  last auto-saved checkpoint. Used by both the pause and death "quit" buttons. */
function quitToTitle(): void {
  flushSave(); // keep the ground gained since the last checkpoint
  state = "over";
  input.enabled = false;
  player.frozen = true;
  if (document.pointerLockElement) document.exitPointerLock();
  clearBottles();
  shake = 0;
  hud.closeNote();
  hud.letterbox(false);
  hud.chase(false);
  hud.hide();
  refreshTitleMenu();
  hud.showScreen("title");
}

/** Quit the whole game. In the Electron standalone window `window.close()`
 *  closes the BrowserWindow (→ app.quit()); in a normal browser tab the host
 *  won't let script close it, so fall back to a "signal lost" farewell. */
function exitGame(): void {
  const isElectron = /electron/i.test(navigator.userAgent);
  flushSave(); // persist progress before the window goes
  fx.setVolume(0); // silence any ambient before we go
  if (document.pointerLockElement) document.exitPointerLock();
  window.close();
  if (!isElectron) {
    // a tab opened by the user can't be closed by script — show the farewell.
    hud.hide();
    for (const s of ["title", "pause", "options", "dead", "win"]) {
      document.getElementById(s)?.classList.add("hidden");
    }
    document.getElementById("exit")?.classList.remove("hidden");
  }
}

/** flush live position/progress to disk so quitting or closing never loses ground
 *  between sparse checkpoints (localStorage itself already survives an app restart).
 *  No-op unless actually in play, and Director.snapshot() refuses unsafe moments. */
function flushSave(): void {
  if (state !== "playing" && state !== "paused") return;
  const snap = director.snapshot();
  if (snap) Save.write(snap);
}
// last-ditch saves: tab/app close (pagehide is the reliable one; beforeunload backs
// it up) and backgrounding. Backgrounding also suspends the audio clock.
window.addEventListener("pagehide", flushSave);
window.addEventListener("beforeunload", flushSave);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { flushSave(); fx.suspend(); }
  else fx.resume();
});

document.getElementById("btn-start")!.addEventListener("click", newGame);
document.getElementById("btn-continue")!.addEventListener("click", continueGame);
document.getElementById("btn-exit")!.addEventListener("click", exitGame);
document.getElementById("btn-resume")!.addEventListener("click", () => resumeGame());
document.getElementById("btn-title")!.addEventListener("click", quitToTitle);
document.getElementById("btn-deadquit")!.addEventListener("click", quitToTitle);
// death → continue from checkpoint (in-place); win → fresh title
document.getElementById("btn-retry")!.addEventListener("click", continueGame);
document.getElementById("btn-again")!.addEventListener("click", () => { Save.clear(); location.reload(); });

// any key skips a skippable cutscene
window.addEventListener("keydown", (e) => {
  if (cine.active && cine.skippable && !e.repeat) cine.skip();
});

// ---------- pause / resume ----------
// Escape is the menu key. In fullscreen the keyboard-lock above feeds the keypress
// here (instead of dropping fullscreen); windowed, the browser also released pointer
// lock — pointerlockchange handles that path and this lets a second Escape resume.
function pauseGame(): void {
  // never raise the menu over the kill-cam: state is still "playing" during the
  // ~2s death animation, so guard on director.dying too
  if (state !== "playing" || director.dying) return;
  if (hud.noteOpen) hud.closeNote();
  state = "paused";
  input.enabled = false;
  player.frozen = director.over;
  fx.setPaused(true);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showScreen("pause");
}
function resumeGame(): void {
  if (state !== "paused") return;
  input.requestLock(); // pointerlockchange completes the resume (and un-ducks audio)
}
window.addEventListener("keydown", (e) => {
  if (e.code !== "Escape" && e.key !== "Escape") return;
  if (state === "playing") pauseGame();
  else if (state === "paused") resumeGame();
});

document.addEventListener("pointerlockchange", () => {
  if (state === "cinematic") return; // never pause mid-cutscene
  if (state === "playing" && !input.locked) {
    pauseGame(); // involuntary unlock (alt-tab, OS switch, windowed Esc) → pause
  } else if (state === "paused" && input.locked) {
    state = "playing";
    input.enabled = true;
    player.frozen = director.over;
    fx.setPaused(false);
    hud.showScreen(null);
  }
});

director.onDeath = (text) => {
  state = "over";
  input.enabled = false;
  document.exitPointerLock();
  refreshTitleMenu();
  document.getElementById("dead-text")!.textContent = text;
  document.getElementById("btn-retry")!.classList.toggle("hidden", !Save.has());
  hud.showScreen("dead");
};
director.onWin = (text) => {
  state = "over";
  input.enabled = false;
  document.exitPointerLock();
  Save.clear();
  document.getElementById("win-text")!.textContent = text;
  hud.showScreen("win");
};

// ---------- camera feel ----------
let shake = 0;
let autosaveT = 25; // seconds of play between silent background autosaves
let baseFov = 72; // player-chosen field of view (Options → FIELD OF VIEW)
let fovCurrent = baseFov;
stalker.onBash = () => {
  const d = Math.hypot(stalker.x - player.x, stalker.z - player.z);
  shake = Math.max(shake, 0.85 / (1 + d * 0.25));
};
// scripted scares (build-up startles + jumpscares) jolt the camera through here
director.onScare = (amount) => { shake = Math.max(shake, amount); };

function setFov(target: number): void {
  fovCurrent += (target - fovCurrent) * 0.18;
  if (Math.abs(fovCurrent - camera.fov) > 0.03) {
    camera.fov = fovCurrent;
    camera.updateProjectionMatrix();
  }
}

// ---------- options / settings menu ----------
// A real-game options screen reachable from the title and the pause menu: display
// mode (fullscreen), internal render resolution, graphics tier, brightness, FOV,
// look sensitivity / invert, and master volume. Every control applies live and
// persists to localStorage; the pause/options screens are translucent so display
// tweaks preview against the frozen scene behind them.
const EXPOSURE_BASE = 1.35; // renderer.toneMappingExposure at 100% brightness
const LOOK_BASE = 0.0022; // Player.lookSpeed at 1.0× sensitivity
const DEF: Required<Pick<Settings, "renderScale" | "brightness" | "fov" | "sensitivity" | "volume" | "volAmbient" | "volCreature" | "volVoice" | "volMusic">> =
  { renderScale: 1, brightness: 1, fov: 72, sensitivity: 1, volume: 1, volAmbient: 1, volCreature: 1, volVoice: 1, volMusic: 1 };

let settings: Settings = Save.loadSettings();
const fxForced = (() => {
  const p = new URLSearchParams(location.search);
  return p.has("nofx") || p.has("lowfx");
})();

function persist(patch: Partial<Settings>): void {
  settings = { ...settings, ...patch };
  Save.saveSettings(settings);
}

function isFullscreen(): boolean {
  return !!document.fullscreenElement;
}

/** push the current `settings` into every live system */
function applySettings(): void {
  if (!fxForced && settings.quality) post.lockQuality(settings.quality);
  post.setRenderScale(settings.renderScale ?? DEF.renderScale);
  renderer.toneMappingExposure = EXPOSURE_BASE * (settings.brightness ?? DEF.brightness);
  baseFov = settings.fov ?? DEF.fov;
  fovCurrent = baseFov;
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  player.lookSpeed = LOOK_BASE * (settings.sensitivity ?? DEF.sensitivity);
  player.invertY = !!settings.invertY;
  fx.setVolume(settings.volume ?? DEF.volume);
  fx.setBusVolume("ambient", settings.volAmbient ?? DEF.volAmbient);
  fx.setBusVolume("creature", settings.volCreature ?? DEF.volCreature);
  fx.setBusVolume("voice", settings.volVoice ?? DEF.volVoice);
  fx.setBusVolume("music", settings.volMusic ?? DEF.volMusic);
}

// Keyboard Lock API (Chromium/Electron, secure context): while in fullscreen,
// capture Escape so it raises the in-game menu instead of dropping fullscreen. The
// browser still lets the player *hold* Escape to force-exit. Acquired/released from
// the fullscreenchange handler so every entry path (button, F11, saved pref) is covered.
interface KeyboardLock { lock?: (keys?: string[]) => Promise<void>; unlock?: () => void }
function keyboardApi(): KeyboardLock | undefined {
  return (navigator as unknown as { keyboard?: KeyboardLock }).keyboard;
}
function syncKeyboardLock(): void {
  const kb = keyboardApi();
  try {
    if (isFullscreen()) void kb?.lock?.(["Escape"]);
    else kb?.unlock?.();
  } catch { /* unsupported / not permitted — Esc falls back to native behaviour */ }
}

function setFullscreen(on: boolean): void {
  try {
    if (on && !isFullscreen()) void document.documentElement.requestFullscreen?.();
    else if (!on && isFullscreen()) void document.exitFullscreen?.();
  } catch { /* fullscreen not permitted in this context */ }
}

function applyFullscreenPref(): void {
  if (settings.fullscreen && !isFullscreen()) {
    try { void document.documentElement.requestFullscreen?.(); } catch { /* ignore */ }
  }
}

// --- DOM control helpers ---
const optEl = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
function wireSeg(id: string, onPick: (v: string) => void): void {
  optEl(id).querySelectorAll<HTMLElement>(".seg-opt").forEach((opt) => {
    opt.addEventListener("click", () => onPick(opt.dataset.v!));
  });
}
function setSeg(id: string, v: string): void {
  optEl(id).querySelectorAll<HTMLElement>(".seg-opt").forEach((opt) => {
    opt.classList.toggle("active", opt.dataset.v === v);
  });
}
function updateResReadout(): void {
  const epr = post.effectivePixelRatio();
  const w = Math.round(window.innerWidth * epr);
  const h = Math.round(window.innerHeight * epr);
  optEl("res-readout").textContent = `${w} × ${h}`;
}

function refreshOptions(): void {
  setSeg("opt-fullscreen", isFullscreen() ? "1" : "0");
  setSeg("opt-res", String(settings.renderScale ?? DEF.renderScale));
  setSeg("opt-quality", post.getQuality() === "off" ? "low" : post.getQuality());
  setSeg("opt-invert", settings.invertY ? "1" : "0");
  optEl<HTMLInputElement>("opt-brightness").value = String(settings.brightness ?? DEF.brightness);
  optEl<HTMLInputElement>("opt-fov").value = String(settings.fov ?? DEF.fov);
  optEl<HTMLInputElement>("opt-sens").value = String(settings.sensitivity ?? DEF.sensitivity);
  optEl<HTMLInputElement>("opt-volume").value = String(settings.volume ?? DEF.volume);
  optEl("brightness-readout").textContent = `${Math.round((settings.brightness ?? DEF.brightness) * 100)}%`;
  optEl("fov-readout").textContent = String(settings.fov ?? DEF.fov);
  optEl("sens-readout").textContent = `${(settings.sensitivity ?? DEF.sensitivity).toFixed(2)}×`;
  optEl("volume-readout").textContent = `${Math.round((settings.volume ?? DEF.volume) * 100)}%`;
  optEl<HTMLInputElement>("opt-vol-music").value = String(settings.volMusic ?? DEF.volMusic);
  optEl<HTMLInputElement>("opt-vol-ambient").value = String(settings.volAmbient ?? DEF.volAmbient);
  optEl<HTMLInputElement>("opt-vol-creature").value = String(settings.volCreature ?? DEF.volCreature);
  optEl<HTMLInputElement>("opt-vol-voice").value = String(settings.volVoice ?? DEF.volVoice);
  optEl("vol-music-readout").textContent = `${Math.round((settings.volMusic ?? DEF.volMusic) * 100)}%`;
  optEl("vol-ambient-readout").textContent = `${Math.round((settings.volAmbient ?? DEF.volAmbient) * 100)}%`;
  optEl("vol-creature-readout").textContent = `${Math.round((settings.volCreature ?? DEF.volCreature) * 100)}%`;
  optEl("vol-voice-readout").textContent = `${Math.round((settings.volVoice ?? DEF.volVoice) * 100)}%`;
  updateResReadout();
}

// DISPLAY
wireSeg("opt-fullscreen", (v) => setFullscreen(v === "1"));
wireSeg("opt-res", (v) => {
  const s = parseFloat(v);
  post.setRenderScale(s);
  persist({ renderScale: s });
  setSeg("opt-res", v);
  updateResReadout();
});
wireSeg("opt-quality", (v) => {
  post.lockQuality(v as "low" | "medium" | "high");
  persist({ quality: v as "low" | "medium" | "high" });
  setSeg("opt-quality", v);
  updateResReadout(); // tier changes the internal render scale
});
wireSeg("opt-invert", (v) => {
  player.invertY = v === "1";
  persist({ invertY: v === "1" });
  setSeg("opt-invert", v);
});
optEl<HTMLInputElement>("opt-brightness").addEventListener("input", (e) => {
  const b = parseFloat((e.target as HTMLInputElement).value);
  renderer.toneMappingExposure = EXPOSURE_BASE * b;
  optEl("brightness-readout").textContent = `${Math.round(b * 100)}%`;
  persist({ brightness: b });
});
optEl<HTMLInputElement>("opt-fov").addEventListener("input", (e) => {
  const f = parseFloat((e.target as HTMLInputElement).value);
  baseFov = f;
  optEl("fov-readout").textContent = String(f);
  persist({ fov: f });
});
optEl<HTMLInputElement>("opt-sens").addEventListener("input", (e) => {
  const s = parseFloat((e.target as HTMLInputElement).value);
  player.lookSpeed = LOOK_BASE * s;
  optEl("sens-readout").textContent = `${s.toFixed(2)}×`;
  persist({ sensitivity: s });
});
optEl<HTMLInputElement>("opt-volume").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  fx.setVolume(v);
  optEl("volume-readout").textContent = `${Math.round(v * 100)}%`;
  persist({ volume: v });
});
optEl<HTMLInputElement>("opt-vol-music").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  fx.setBusVolume("music", v);
  optEl("vol-music-readout").textContent = `${Math.round(v * 100)}%`;
  persist({ volMusic: v });
});
optEl<HTMLInputElement>("opt-vol-ambient").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  fx.setBusVolume("ambient", v);
  optEl("vol-ambient-readout").textContent = `${Math.round(v * 100)}%`;
  persist({ volAmbient: v });
});
optEl<HTMLInputElement>("opt-vol-creature").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  fx.setBusVolume("creature", v);
  optEl("vol-creature-readout").textContent = `${Math.round(v * 100)}%`;
  persist({ volCreature: v });
});
optEl<HTMLInputElement>("opt-vol-voice").addEventListener("input", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  fx.setBusVolume("voice", v);
  optEl("vol-voice-readout").textContent = `${Math.round(v * 100)}%`;
  persist({ volVoice: v });
});

// fullscreen can change outside our buttons (F11 / Esc) — keep UI + pref in sync,
// and acquire/release the Escape keyboard-lock so the menu key never drops fullscreen
document.addEventListener("fullscreenchange", () => {
  setSeg("opt-fullscreen", isFullscreen() ? "1" : "0");
  persist({ fullscreen: isFullscreen() });
  syncKeyboardLock();
});

// open / close — remembers whether we came from the title or the pause menu
let optionsReturn: "title" | "pause" = "title";
function openOptions(from: "title" | "pause"): void {
  optionsReturn = from;
  refreshOptions();
  hud.showScreen("options");
}
optEl("btn-options").addEventListener("click", () => openOptions("title"));
optEl("btn-pause-options").addEventListener("click", () => openOptions("pause"));
optEl("btn-opts-back").addEventListener("click", () => hud.showScreen(optionsReturn));

applySettings();

// ---------- main loop ----------
const clock = new THREE.Clock();
const lampDir = new THREE.Vector3(); // reused each frame (avoid per-frame GC)

function frame(): void {
  requestAnimationFrame(frame);
  perf.frameStart();
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (cine.active) {
    // ----- cinematic: camera on rails, world stays alive but harmless -----
    cine.update(dt);
    stalker.update(dt, player, false);
    level.noises.length = 0;
    updateBottles(dt);
    const fwdx = cine.look.x - cine.pos.x;
    const fwdz = cine.look.z - cine.pos.z;
    fx.setListener(cine.pos.x, cine.pos.z, Math.atan2(-fwdx, -fwdz));
    fx.update(dt, 0, false);
    hud.update(dt);
    camera.position.copy(cine.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(cine.look);
    setFov(cine.fov);
  } else if (state === "playing") {
    // ----- normal play -----
    const noteWasOpen = hud.noteOpen;
    if (noteWasOpen) {
      player.frozen = true;
      if (input.justPressed("KeyE")) {
        hud.closeNote();
        player.frozen = director.over;
      }
    }

    player.update(dt);
    if (input.justPressed("KeyQ")) throwBottle();

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

    const threat = director.over ? 0 : stalker.threat(player);
    fx.update(dt, threat, stalker.state === "chase" && !director.over);
    hud.chase(stalker.state === "chase" && !director.over);

    hud.battery(player.battery, player.lightOn);
    hud.bottles(player.bottles);
    hud.stamina(player.stamina, player.exhausted);
    hud.update(dt);

    // silent periodic autosave so an unexpected close keeps recent progress
    autosaveT -= dt;
    if (autosaveT <= 0) {
      autosaveT = 25;
      const snap = director.snapshot();
      if (snap) Save.write(snap);
    }

    // wayfinding
    wayfinder.setObjective(director.objectiveTarget, director.objectiveLabel);
    wayfinder.setHidden(director.chase || director.over);
    wayfinder.update(camera, dt);
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
    // look up into its glowing eyes (~2.35m on the taller gaunt rig), not its chest
    const targetPitch = Math.atan2(2.35 - player.eyeY, d);
    player.pitch += (targetPitch - player.pitch) * Math.min(1, 12 * dt);
    shake = Math.max(shake, 0.35);
  }

  if (!director.over && stalker.state === "chase") {
    const d = Math.hypot(stalker.x - player.x, stalker.z - player.z);
    if (d < 6) shake = Math.max(shake, ((6 - d) / 6) * 0.16);
  }

  // camera from player (unless a cutscene is driving it)
  if (!cine.active) {
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
    const fovTarget = director.dying ? baseFov - 18 : player.sprinting && player.moving ? baseFov + 6 : baseFov;
    setFov(fovTarget);
  }

  // flashlight follows the camera (player or cinematic) with lag
  lampRig.position.lerp(camera.position, Math.min(1, 18 * dt));
  lampRig.quaternion.slerp(camera.quaternion, Math.min(1, 9 * dt));
  lampDir.set(0, 0, -1).applyQuaternion(lampRig.quaternion);
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
  updateBeacon(t);

  post.setMood(stalker.state === "chase" && !director.over, director.dying);
  perf.beforeRender();
  post.render(dt);
  perf.afterRender();
  input.flush();
}

renderer.compile(scene, camera);
post.warmup();
frame();

// fade the boot loader out once the first frame is composited and the title is up
{
  const bootLoader = document.getElementById("boot-loader");
  setTimeout(() => {
    bootLoader?.classList.add("done");
    setTimeout(() => bootLoader?.remove(), 1000);
  }, 1100);
}

// ---------- debug / automated-test scenario system ----------
// Lets tests (and manual debugging) "cut to" a named scenario deterministically —
// no need to play through. Each scenario sets up the world state for that beat so
// a screenshot/assertion lands exactly there. Used by agent/*.mjs capture scripts.
function dbgPlay(): void {
  fx.init(); // idempotent
  director.over = false;
  director.dying = false;
  state = "playing";
  input.enabled = true;
  player.frozen = false;
  // clear any transient overlays so a scenario isn't darkened by a leftover fade
  hud.closeNote();
  hud.letterbox(false);
  hud.chase(false);
  hud.damageFlash(0);
  hud.blackout(0, 0);
  hud.showScreen(null);
  hud.show();
}
function dbgPlace(cx: number, cy: number, yaw = Math.PI, torch = true): void {
  const [x, z] = level.cellCenter(cx, cy);
  player.x = x;
  player.z = z;
  player.yaw = yaw;
  player.pitch = 0;
  player.lightOn = torch;
  player.battery = 1;
}
const SCENARIOS: Record<string, () => void> = {
  // ---- normal flow beats (new hub-and-spoke map) ----
  arrival: () => { dbgPlay(); dbgPlace(31, 13, Math.PI); },          // arrival hall
  maintenance: () => { dbgPlay(); dbgPlace(8, 33, Math.PI / 2); },   // fuse-A area, facing the bench
  "first-sighting": () => {                                          // build-up payoff: facing the first monster
    dbgPlay();
    director.armSighting();                                          // skip the build-up gate for the cut
    const [sx, sz] = level.cellCenter(58, 39);
    stalker.setPos(sx, sz); stalker.state = "dormant"; stalker.setCrouchPose(1); stalker.faceToward(54 * 2 + 1, 32 * 2 + 1);
    dbgPlace(54, 32, -Math.PI / 2);                                  // stepping onto the platform triggers C2
  },
  "power-on": () => { dbgPlay(); director.debugPower(); dbgPlace(59, 18, -Math.PI / 2); },
  archive: () => { dbgPlay(); director.debugPower(); dbgPlace(28, 61, 0); }, // the wall of faces (reveal)
  core: () => { dbgPlay(); director.debugPower(); dbgPlace(22, 71, Math.PI / 2); },
  chase: () => {                                                    // live final-chase danger feedback
    dbgPlay(); director.debugArmChase();
    const [sx, sz] = level.cellCenter(31, 29);
    stalker.setPos(sx, sz); stalker.faceToward(31 * 2 + 1, 33 * 2 + 1); stalker.frozen = true;
    dbgPlace(31, 33, 0);
  },
  creature: () => {                                                 // the Tallyman right in front, torch-lit
    dbgPlay(); dbgPlace(31, 32, 0);
    const fwx = -Math.sin(player.yaw), fwz = -Math.cos(player.yaw);
    stalker.setPos(player.x + fwx * 3.2, player.z + fwz * 3.2);
    stalker.faceToward(player.x, player.z);
    stalker.state = "chase"; stalker.finalChase = true; stalker.setCrouchPose(0);
    stalker.onKill = () => {};                                       // don't kill while inspecting
  },
  escape: () => { dbgPlay(); dbgPlace(28, 5, Math.PI); director.debugEscape(); }, // ending reveal (313)
  death: () => { dbgPlay(); dbgPlace(31, 33, Math.PI); stalker.activate(); stalker.setPos(player.x + 0.4, player.z); },
  // ---- the four place-gated visual false-scares (frozen mid-reveal for capture) ----
  "scare-hang": () => { dbgPlay(); dbgPlace(5, 38, Math.PI); director.debugScare("sc_hang"); },
  "scare-dart": () => { dbgPlay(); dbgPlace(47, 32, -Math.PI / 2); director.debugScare("sc_dart"); },
  "scare-face": () => { dbgPlay(); dbgPlace(58, 30, -Math.PI / 2); director.debugScare("sc_face"); },
  "scare-drop": () => { dbgPlay(); dbgPlace(30, 45, Math.PI); director.debugScare("sc_drop"); }
};

declare global {
  interface Window {
    __game?: unknown;
  }
}
const debug = {
  /** names of every scenario you can cut to */
  list: (): string[] => Object.keys(SCENARIOS),
  /** cut the running game straight to a named scenario for a screenshot/assertion */
  scenario: (name: string): { ok: boolean; name: string; available?: string[] } => {
    const fn = SCENARIOS[name];
    if (!fn) return { ok: false, name, available: Object.keys(SCENARIOS) };
    fn();
    return { ok: true, name };
  }
};
window.__game = { player, stalker, director, level, world, fx, hud, post, perf, cine, wayfinder, newGame, continueGame, quitToTitle, debug };
