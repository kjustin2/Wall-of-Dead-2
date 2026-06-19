import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Level, Door } from "../world/Level";
import type { AudioFX } from "../core/AudioFX";
import type { Player } from "./Player";
import { WAYPOINTS } from "../world/data";

export type StalkerState = "dormant" | "roam" | "investigate" | "search" | "chase" | "script";

const ROAM_SPEED = 1.35;
const INVESTIGATE_SPEED = 2.3;
const CHASE_SPEED = 4.45;
const FINAL_CHASE_SPEED = 4.75;

// the rigged creature mannequin (Xbot) — scaled gaunt-and-too-tall, head ~2.2m
// to land the kill-cam framing (main.ts looks toward y=2.2)
const RIG_SCALE = 1.3;

export class Stalker {
  group = new THREE.Group();
  x = 0;
  z = 0;
  private facing = 0;

  state: StalkerState = "dormant";
  finalChase = false;
  suspicion = 0;
  /** 0 calm, 1 after first fuse, 2 after both — raises speed and awareness */
  alert = 0;

  private path: Array<[number, number]> = [];
  private repathT = 0;
  private targetWp: [number, number] | null = null;
  private investigatePos: [number, number] | null = null;
  private lastSeen: [number, number] | null = null;
  private loseSightT = 0;
  private searchT = 0;
  private idleT = 0;
  private scriptDone: (() => void) | null = null;

  // door interaction
  private doorWait: { door: Door; t: number; bashT: number } | null = null;

  // animation
  private animT = 0;
  private tAcc = 0;
  private strideAcc = 0;
  private crouchPose = 1; // 1 = sitting/crouched, 0 = standing
  private body!: THREE.Group;
  private head!: THREE.Mesh;
  private eyeMatL!: THREE.MeshBasicMaterial;
  private eyeMatR!: THREE.MeshBasicMaterial;
  private eyeL!: THREE.Mesh;
  private eyeR!: THREE.Mesh;
  private armL!: THREE.Mesh;
  private armR!: THREE.Mesh;
  private legL!: THREE.Mesh;
  private legR!: THREE.Mesh;
  private armReach = 0;
  private twitchT = 4;
  private twitch = 0;
  private vocalT = 6;
  private dragT = 0;

  // rigged-creature path (replaces the primitive once the GLB loads)
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;

  onKill: (() => void) | null = null;
  onBash: (() => void) | null = null;

  constructor(
    private level: Level,
    private fx: AudioFX
  ) {
    this.buildMesh();
  }

  private buildMesh(): void {
    // near-black in ambience, but the torch glances off it
    const skin = new THREE.MeshStandardMaterial({ color: 0x111319, roughness: 0.8 });
    const skinPale = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.7 });
    this.body = new THREE.Group();

    // gaunt, too tall, hunched
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.15, 8), skin);
    torso.position.y = 1.5;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), skin);
    chest.position.y = 1.95;
    chest.scale.set(1, 1.35, 0.7);
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.1, 0.16), skin);
    shoulders.position.y = 2.06;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), skinPale);
    this.head.position.y = 2.28;
    this.head.scale.set(0.78, 1.35, 0.85);

    // eyes live on the group (not the body) so they survive the rig swap;
    // the rigged head is featureless, so these glowing points carry the menace
    const eyeGeo = new THREE.SphereGeometry(0.04, 8, 8);
    this.eyeMatL = new THREE.MeshBasicMaterial({ color: 0xd8e2ea, transparent: true, opacity: 0 });
    this.eyeMatR = new THREE.MeshBasicMaterial({ color: 0xd8e2ea, transparent: true, opacity: 0 });
    const eyeL = new THREE.Mesh(eyeGeo, this.eyeMatL);
    eyeL.position.set(-0.05, 2.31, -0.11);
    const eyeR = new THREE.Mesh(eyeGeo, this.eyeMatR);
    eyeR.position.set(0.05, 2.31, -0.11);
    this.eyeL = eyeL;
    this.eyeR = eyeR;
    this.group.add(eyeL, eyeR);

    // arms hang to the shins
    const armGeo = new THREE.CylinderGeometry(0.04, 0.022, 1.45, 6);
    armGeo.translate(0, -0.68, 0);
    this.armL = new THREE.Mesh(armGeo, skin);
    this.armL.position.set(-0.29, 2.0, 0);
    this.armR = new THREE.Mesh(armGeo.clone(), skin);
    this.armR.position.set(0.29, 2.0, 0);
    const handGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const handL = new THREE.Mesh(handGeo, skinPale);
    handL.position.y = -1.42;
    handL.scale.set(1, 1.9, 0.7);
    this.armL.add(handL);
    const handR = handL.clone();
    this.armR.add(handR);

    const legGeo = new THREE.CylinderGeometry(0.055, 0.04, 1.0, 6);
    legGeo.translate(0, -0.48, 0);
    this.legL = new THREE.Mesh(legGeo, skin);
    this.legL.position.set(-0.1, 0.98, 0);
    this.legR = new THREE.Mesh(legGeo.clone(), skin);
    this.legR.position.set(0.1, 0.98, 0);

    this.body.add(torso, chest, shoulders, this.head, this.armL, this.armR, this.legL, this.legR);
    this.body.traverse((m) => {
      m.castShadow = true;
    });
    this.group.add(this.body);

    // upgrade to the rigged GLB creature when it's available (kept primitive otherwise)
    this.loadRig();
  }

  private loadRig(): void {
    new GLTFLoader().loadAsync("/models/creature/creature.glb").then(
      (gltf) => this.attachRig(gltf.scene, gltf.animations),
      () => { /* no creature asset — keep the procedural primitive */ }
    );
  }

  private attachRig(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    // redress the grey mannequin as the gaunt thing in the dark
    const skin = new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.82, metalness: 0 });
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.SkinnedMesh) {
        o.material = skin;
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds can cull wrongly at this scale
      }
    });
    // Mixamo models face +Z; the existing convention rotates the group by
    // facing+PI for a -Z-facing model, so flip the rig to face -Z locally.
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    inner.scale.setScalar(RIG_SCALE);
    inner.add(scene);
    this.group.remove(this.body);
    this.group.add(inner);

    this.mixer = new THREE.AnimationMixer(scene);
    for (const name of ["idle", "walk", "run"]) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (clip) this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.current = this.actions.get("idle") ?? null;
    this.current?.play();

    // raise the glowing eyes to the rig's head height
    this.eyeL.position.y = this.eyeR.position.y = 2.18;
  }

  private playAction(name: string, timeScale: number): void {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = timeScale;
    if (next === this.current) return;
    next.reset().fadeIn(0.25).play();
    this.current?.fadeOut(0.25);
    this.current = next;
  }

  /** drive the rigged creature's animation from the AI state (mesh-only). */
  private syncAnim(dt: number, speed: number): void {
    this.mixer!.update(dt);
    if (this.state === "chase") this.playAction("run", Math.min(1.5, Math.max(0.8, speed / 4)));
    else if (speed > 0.1) this.playAction("walk", Math.min(1.8, Math.max(0.7, speed / 1.3)));
    else this.playAction("idle", 1);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.facing + Math.PI;
  }

  setPos(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.group.position.set(x, 0, z);
  }

  /** wake from dormant and walk somewhere (scripted sighting) */
  activate(walkTo?: [number, number], done?: () => void): void {
    if (this.state === "dormant" || this.state === "script") {
      if (walkTo) {
        const [cx, cy] = walkTo;
        const [sx, sy] = this.level.worldToCell(this.x, this.z);
        this.path = this.level.findPath(sx, sy, cx, cy, false) ?? [];
        this.state = "script";
        this.scriptDone = done ?? null;
      } else {
        this.state = "roam";
      }
    }
  }

  startFinalChase(): void {
    this.finalChase = true;
    this.state = "chase";
    this.suspicion = 1;
  }

  hearNoise(x: number, z: number, loud: number): void {
    if (this.state === "dormant") return;
    const d = Math.hypot(x - this.x, z - this.z);
    if (d > loud * 2.3) return;
    if (this.state === "chase") return;
    this.investigatePos = [x, z];
    if (this.state !== "script") {
      this.state = "investigate";
      this.repathT = 0;
    }
  }

  update(dt: number, player: Player, playerLit: boolean): void {
    const px = player.x;
    const pz = player.z;
    const dToPlayer = Math.hypot(px - this.x, pz - this.z);

    // ---- read noises ----
    for (const n of this.level.noises) this.hearNoise(n.x, n.z, n.loud);

    // ---- perception ----
    if (this.state !== "dormant" && this.state !== "script") {
      const hasLOS = dToPlayer < 34 && this.level.los(this.x, this.z, px, pz);
      let visibility = 0;
      if (hasLOS) {
        // flashlight glow is visible from any direction
        if (player.lightOn) {
          visibility = dToPlayer < 28 ? 1.6 - dToPlayer / 28 : 0;
          visibility *= 1.6;
        } else {
          // needs to roughly face the player
          const toP = Math.atan2(px - this.x, pz - this.z);
          let diff = Math.abs(toP - this.facing) % (Math.PI * 2);
          if (diff > Math.PI) diff = Math.PI * 2 - diff;
          const inCone = diff < 1.9;
          if (inCone) {
            const range = playerLit ? 15 : player.crouching ? 4.5 : 8.5;
            if (dToPlayer < range) visibility = (1 - dToPlayer / range) * (player.moving ? 1.2 : 0.55);
          }
        }
        if (dToPlayer < 2.6) visibility = Math.max(visibility, 1.5);
      }
      if (visibility > 0) {
        this.suspicion = Math.min(1.2, this.suspicion + visibility * dt * 1.7 * (1 + this.alert * 0.18));
        if (this.suspicion >= 1 && this.state !== "chase") {
          this.state = "chase";
          this.repathT = 0;
          this.fx.stinger();
        }
      } else {
        this.suspicion = Math.max(this.finalChase ? 1 : 0, this.suspicion - dt * 0.25);
      }
      if (this.state === "chase") {
        if (hasLOS) {
          this.lastSeen = [px, pz];
          this.loseSightT = 0;
        } else {
          this.loseSightT += dt;
          if (this.loseSightT > 5 && !this.finalChase) {
            this.state = "search";
            this.searchT = 5;
            this.suspicion = 0.6;
          }
        }
        if (this.finalChase) this.lastSeen = [px, pz];
      }
    }

    // ---- state behaviour / pathing ----
    let speed = 0;
    this.repathT -= dt;
    switch (this.state) {
      case "dormant":
        this.crouchPose = Math.min(1, this.crouchPose + dt);
        break;
      case "script": {
        speed = 1.5;
        if (this.path.length === 0) {
          this.state = "roam";
          this.scriptDone?.();
          this.scriptDone = null;
        }
        break;
      }
      case "roam": {
        speed = ROAM_SPEED + this.alert * 0.22;
        if (this.path.length === 0) {
          this.idleT -= dt;
          if (this.idleT <= 0) {
            // when alerted, it circles the player's general area instead of wandering
            if (this.alert > 0 && Math.random() < 0.45) {
              let best: [number, number] = WAYPOINTS[0];
              let bestScore = Infinity;
              for (const wp of WAYPOINTS) {
                const [wx, wz] = this.level.cellCenter(wp[0], wp[1]);
                const dp = Math.hypot(wx - player.x, wz - player.z);
                const score = Math.abs(dp - 13) + Math.random() * 6;
                if (dp > 7 && score < bestScore) {
                  bestScore = score;
                  best = wp;
                }
              }
              this.targetWp = best;
            } else {
              this.targetWp = WAYPOINTS[Math.floor(Math.random() * WAYPOINTS.length)];
            }
            const [sx, sy] = this.level.worldToCell(this.x, this.z);
            this.path = this.level.findPath(sx, sy, this.targetWp[0], this.targetWp[1], false) ?? [];
            this.idleT = 2 + Math.random() * (5 - this.alert);
          }
        }
        this.dragT -= dt;
        if (this.dragT <= 0) {
          this.dragT = 7 + Math.random() * 14;
          this.fx.drag(this.x, this.z);
        }
        break;
      }
      case "investigate": {
        speed = INVESTIGATE_SPEED;
        if (this.investigatePos && this.repathT <= 0) {
          this.repathT = 0.8;
          const [sx, sy] = this.level.worldToCell(this.x, this.z);
          const [gx, gy] = this.level.worldToCell(this.investigatePos[0], this.investigatePos[1]);
          this.path = this.level.findPath(sx, sy, gx, gy, false) ?? [];
        }
        if (this.path.length === 0) {
          this.state = "search";
          this.searchT = 4;
          this.investigatePos = null;
        }
        break;
      }
      case "search": {
        speed = 0;
        this.searchT -= dt;
        this.facing += dt * 1.1;
        if (this.searchT <= 0) {
          this.state = "roam";
          this.idleT = 0;
        }
        break;
      }
      case "chase": {
        speed = this.finalChase ? FINAL_CHASE_SPEED : CHASE_SPEED;
        if (this.repathT <= 0 && this.lastSeen) {
          this.repathT = 0.35;
          const [sx, sy] = this.level.worldToCell(this.x, this.z);
          const [gx, gy] = this.level.worldToCell(this.lastSeen[0], this.lastSeen[1]);
          this.path = this.level.findPath(sx, sy, gx, gy, true) ?? [];
        }
        if (this.path.length === 0 && this.lastSeen && !this.finalChase) {
          const d = Math.hypot(this.lastSeen[0] - this.x, this.lastSeen[1] - this.z);
          if (d < 1.5) {
            this.state = "search";
            this.searchT = 5;
          }
        }
        break;
      }
    }

    // ---- door handling ----
    if (this.doorWait) {
      const dw = this.doorWait;
      dw.t -= dt;
      dw.bashT -= dt;
      const isFire = dw.door.def.kind === "fire";
      if (isFire && dw.bashT <= 0) {
        dw.bashT = 0.7;
        this.fx.bash(this.x, this.z);
        this.level.addNoise(this.x, this.z, 10);
        this.onBash?.();
      }
      if (dw.t <= 0) {
        dw.door.targetOpen = true;
        if (isFire) {
          dw.door.broken = true;
          this.fx.slam(dw.door.cx * 2 + 1, dw.door.cy * 2 + 1, true);
        } else {
          this.fx.creak(dw.door.cx * 2 + 1, dw.door.cy * 2 + 1);
        }
        this.doorWait = null;
      }
      speed = 0;
    } else if (this.path.length > 0 && this.state !== "dormant") {
      const next = this.path[0];
      const door = this.level.doorAt.get(this.level.idx(next[0], next[1]));
      if (door && door.openT < 0.6 && !door.locked) {
        const [dx, dz] = this.level.cellCenter(next[0], next[1]);
        if (Math.hypot(dx - this.x, dz - this.z) < 2.0) {
          const isFire = door.def.kind === "fire" && !door.broken;
          this.doorWait = { door, t: isFire ? 3.3 : this.state === "chase" ? 0.55 : 0.9, bashT: 0 };
        }
      }
    }

    // ---- movement along path ----
    if (speed > 0 && this.path.length > 0 && !this.doorWait) {
      this.crouchPose = Math.max(0, this.crouchPose - dt * 1.6);
      const [cx, cy] = this.path[0];
      const [tx, tz] = this.level.cellCenter(cx, cy);
      const dx = tx - this.x;
      const dz = tz - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.35) {
        this.path.shift();
      } else {
        const step = Math.min(d, speed * dt);
        const nx = this.x + (dx / d) * step;
        const nz = this.z + (dz / d) * step;
        this.x = nx;
        this.z = nz;
        const targetFacing = Math.atan2(dx, dz);
        let diff = targetFacing - this.facing;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facing += diff * Math.min(1, 8 * dt);
        // footsteps
        this.strideAcc += step;
        const stride = this.state === "chase" ? 2.2 : 1.7;
        if (this.strideAcc > stride) {
          this.strideAcc = 0;
          this.fx.stepStalker(this.x, this.z, this.state === "chase" ? 1 : 0.4);
        }
      }
    }

    // ---- kill check (not during the scripted reveal walk) ----
    if (this.state !== "dormant" && this.state !== "script" && dToPlayer < 1.05 && this.level.los(this.x, this.z, px, pz)) {
      this.onKill?.();
    }

    // ---- vocalizations ----
    if (this.state !== "dormant" && this.state !== "script") {
      this.vocalT -= dt;
      if (this.vocalT <= 0) {
        const chasing = this.state === "chase";
        this.vocalT = chasing ? 2.4 + Math.random() * 2 : 6 + Math.random() * 8;
        if (dToPlayer < (chasing ? 22 : 15)) this.fx.creatureNear(this.x, this.z, chasing);
      }
    }

    // ---- animation ----
    if (this.mixer) {
      // rigged creature: skeletal clips drive the body; AI math is unchanged
      this.syncAnim(dt, speed);
    } else {
      // procedural primitive fallback (used until/unless the GLB loads)
      this.tAcc += dt;
      this.animT += dt * (speed > 0.1 ? speed * 2.2 : 1);
      const lurch = speed > 0.1 ? Math.sin(this.animT) : 0;
      // dormant = kneeling: legs sink away, torso upright, head bowed
      this.group.position.set(this.x, Math.abs(lurch) * 0.05 - this.crouchPose * 0.72, this.z);
      this.group.rotation.y = this.facing + Math.PI; // model faces -z locally
      this.body.rotation.z = lurch * 0.07;
      this.body.rotation.x = 0.16 + this.crouchPose * 0.42 + (speed > 3 ? 0.2 : 0);
      // arms reach forward while it closes in
      const wantReach = this.state === "chase" && dToPlayer < 7 ? 1 : 0;
      this.armReach += (wantReach - this.armReach) * Math.min(1, 4 * dt);
      this.armL.rotation.x = lurch * 0.5 + 0.2 - this.armReach * 1.35;
      this.armR.rotation.x = -lurch * 0.5 + 0.2 - this.armReach * 1.35;
      this.legL.rotation.x = -lurch * 0.6;
      this.legR.rotation.x = lurch * 0.6;
      // head: slow wrong-angle tilt with sudden corrective twitches
      this.twitchT -= dt;
      if (this.twitchT <= 0) {
        this.twitchT = 2.5 + Math.random() * 6;
        this.twitch = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.3);
      }
      this.twitch *= Math.max(0, 1 - 7 * dt);
      this.head.rotation.z = Math.sin(this.tAcc * 0.6) * 0.13 + this.twitch;
      // looks ahead despite the hunch; bows over its knees while dormant
      this.head.rotation.x = -this.body.rotation.x * 0.7 + this.crouchPose * 0.7;
    }

    // eyes glint only when facing the player (both paths)
    const toP = Math.atan2(px - this.x, pz - this.z);
    let fdiff = Math.abs(toP - this.facing) % (Math.PI * 2);
    if (fdiff > Math.PI) fdiff = Math.PI * 2 - fdiff;
    const eyesOn = fdiff < 0.5 && dToPlayer < 26 ? Math.min(1, (26 - dToPlayer) / 12) : 0;
    this.eyeMatL.opacity += (eyesOn - this.eyeMatL.opacity) * Math.min(1, 6 * dt);
    this.eyeMatR.opacity = this.eyeMatL.opacity;
  }

  /** 0..1 how dangerous things feel right now (drives heartbeat) */
  threat(player: Player): number {
    if (this.state === "dormant") return 0;
    const d = Math.hypot(player.x - this.x, player.z - this.z);
    let t = Math.max(0, 1 - d / 22);
    if (this.state === "chase") t = Math.max(t, 0.85);
    else if (this.state === "investigate") t = Math.max(t * 1.2, Math.min(0.55, t * 2));
    return Math.min(1, t);
  }
}
