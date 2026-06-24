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

  /** held by a cutscene: animates + can "reveal" (stand) but never perceives or kills */
  frozen = false;
  private revealing = false;

  private path: Array<[number, number]> = [];
  private repathT = 0;
  private targetWp: [number, number] | null = null;
  private investigatePos: [number, number] | null = null;
  private lastSeen: [number, number] | null = null;
  private loseSightT = 0;
  private searchT = 0;
  private idleT = 0;
  /** after losing the player it backs off for a while: suppresses re-detection at
   *  range and makes it roam away — "get away and it leaves you alone for a bit" */
  private giveUpT = 0;
  private lostChase = false; // the current search began because a chase lost the player
  private scriptDone: (() => void) | null = null;

  // door interaction
  private doorWait: { door: Door; t: number; bashT: number } | null = null;

  // animation
  private animT = 0;
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
  private vocalT = 6;
  private dragT = 0;

  // face: hollow sockets + glowing eyes (with bloom sprites) + a gaping maw,
  // on its own group pinned to the head so it reads as menace at any distance
  private face!: THREE.Group;
  private maw!: THREE.Mesh;
  private jaws!: THREE.Group;     // jagged teeth — scaled in by mawOpen
  private throat!: THREE.Mesh;    // sick crimson glow down the gullet
  private throatMat!: THREE.MeshStandardMaterial;
  private glowL!: THREE.Sprite;
  private glowR!: THREE.Sprite;
  private rigRoot: THREE.Object3D | null = null; // the scaled rig wrapper (lean/crouch)
  private mawOpen = 0;
  private headTwitchX = 0;
  private headTwitchY = 0;
  private leanX = 0;
  private breathT = 0;
  // the rigged creature's real head joint — the face overlay is pinned to it each
  // frame so the eyes/maw sit IN the mannequin's head (it sits ~0.5m below the old
  // hardcoded height when standing) instead of floating above it.
  private headBone: THREE.Object3D | null = null;
  private headLocalY = 2.2;     // head height in group-local space, fed to the breath emitter
  private _v = new THREE.Vector3();

  // dead-flesh skin (shared canvas map + bump, reused across primitive + rig)
  private fleshTex!: THREE.CanvasTexture;

  // cold breath that fogs from the maw when it closes in (a small recycled pool)
  private breath!: THREE.Group;
  private puffs: Array<{ s: THREE.Sprite; life: number; max: number; vx: number; vy: number; vz: number }> = [];
  private puffTex!: THREE.CanvasTexture;
  private puffT = 0;

  // rigged-creature path (replaces the primitive once the GLB loads)
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;

  onKill: (() => void) | null = null;
  onBash: (() => void) | null = null;
  /** fired when it loses the player's trail and gives up the chase (not final chase) */
  onLostPlayer: (() => void) | null = null;

  constructor(
    private level: Level,
    private fx: AudioFX
  ) {
    this.buildMesh();
  }

  private buildMesh(): void {
    // pallid, waxy, emaciated — the torch reveals a horrible gaunt thing instead
    // of a dummy hiding in the dark; the dark recesses below give it hollows.
    this.fleshTex = this.makeFleshTexture();
    const skin = this.dressSkin(new THREE.MeshStandardMaterial({ color: 0x8a8074, roughness: 0.62, metalness: 0 }), 2.2);
    const skinPale = this.dressSkin(new THREE.MeshStandardMaterial({ color: 0xa39685, roughness: 0.5 }), 3);
    this.body = new THREE.Group();

    // gaunt, too tall, hunched — thinner and longer-limbed than a person
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.17, 1.22, 8), skin);
    torso.position.y = 1.5;
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 8), skin);
    chest.position.y = 1.98;
    chest.scale.set(0.92, 1.4, 0.58); // sunken, ribby
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.14), skin);
    shoulders.position.y = 2.09;
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 10), skinPale);
    this.head.position.y = 2.32;
    this.head.scale.set(0.7, 1.42, 0.82); // long narrow skull

    // arms hang past the knees (unnaturally long)
    const armGeo = new THREE.CylinderGeometry(0.035, 0.018, 1.62, 6);
    armGeo.translate(0, -0.78, 0);
    this.armL = new THREE.Mesh(armGeo, skin);
    this.armL.position.set(-0.27, 2.04, 0);
    this.armR = new THREE.Mesh(armGeo.clone(), skin);
    this.armR.position.set(0.27, 2.04, 0);
    const handGeo = new THREE.SphereGeometry(0.05, 6, 6);
    const handL = new THREE.Mesh(handGeo, skinPale);
    handL.position.y = -1.56;
    handL.scale.set(1, 2.2, 0.55); // long spindly fingers
    this.armL.add(handL);
    this.armR.add(handL.clone());

    const legGeo = new THREE.CylinderGeometry(0.05, 0.032, 1.04, 6);
    legGeo.translate(0, -0.5, 0);
    this.legL = new THREE.Mesh(legGeo, skin);
    this.legL.position.set(-0.09, 1.0, 0);
    this.legR = new THREE.Mesh(legGeo.clone(), skin);
    this.legR.position.set(0.09, 1.0, 0);

    this.body.add(torso, chest, shoulders, this.head, this.armL, this.armR, this.legL, this.legR);
    this.body.traverse((m) => {
      m.castShadow = true;
    });
    this.group.add(this.body);

    this.buildFace();

    // upgrade to the rigged GLB creature when it's available (kept primitive otherwise)
    this.loadRig();
  }

  /**
   * Mottled dead-flesh canvas: a waxy base under soft blotches, sick green/purple
   * bruising, dark veins and pore grain. Tiled across the body so the torch reveals
   * skin detail instead of a flat plastic dummy. Doubles as a bump map.
   */
  private makeFleshTexture(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const R = Math.random;
    g.fillStyle = "#8b8174"; // waxy mid base (material colour tints from here)
    g.fillRect(0, 0, 256, 256);
    // soft mottling — lighter waxy highs and grimy lows
    for (let i = 0; i < 150; i++) {
      const x = R() * 256, y = R() * 256, r = 6 + R() * 46;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = R() < 0.62;
      grad.addColorStop(0, dark ? "rgba(38,40,36,0.20)" : "rgba(178,168,150,0.16)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // sickly bruising — desaturated green and bruise-purple patches
    for (let i = 0; i < 18; i++) {
      const x = R() * 256, y = R() * 256, r = 14 + R() * 40;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const purple = R() < 0.5;
      grad.addColorStop(0, purple ? "rgba(64,46,66,0.16)" : "rgba(70,82,58,0.15)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    // veins — thin meandering dark strokes
    g.lineWidth = 1;
    for (let i = 0; i < 46; i++) {
      g.strokeStyle = `rgba(30,26,30,${0.10 + R() * 0.14})`;
      g.beginPath();
      let x = R() * 256, y = R() * 256;
      g.moveTo(x, y);
      const segs = 3 + Math.floor(R() * 4);
      for (let s = 0; s < segs; s++) {
        x += (R() - 0.5) * 40; y += (R() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // pore grain
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(0,0,0,${R() * 0.16})` : `rgba(200,190,170,${R() * 0.10})`;
      g.fillRect(R() * 256, R() * 256, 1, 1);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /** apply the flesh map/bump and a sickly torch-catching fresnel rim to a skin material */
  private dressSkin(mat: THREE.MeshStandardMaterial, repeat: number): THREE.MeshStandardMaterial {
    const map = this.fleshTex.clone();
    map.needsUpdate = true;
    map.repeat.set(repeat, repeat);
    mat.map = map;
    mat.bumpMap = map;
    mat.bumpScale = 0.012;
    // a faint sick-green rim where the surface turns away from view — wet, waxy,
    // and it makes the silhouette catch the torch like dead skin, not plastic.
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float deadRim = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.0);
         totalEmissiveRadiance += vec3(0.055, 0.085, 0.07) * deadRim;`
      );
    };
    mat.needsUpdate = true;
    return mat;
  }

  /** soft radial sprite for the eye bloom */
  private makeGlowTex(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(186,244,220,0.55)");
    grad.addColorStop(1, "rgba(120,200,170,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  /**
   * The face carries the menace: deep dark eye sockets, large cold-glowing eyes
   * with an additive bloom, and a maw that yawns open as it closes in. Lives on
   * its own group (pinned to the head each frame) so it survives the rig swap and
   * works for both the primitive and the featureless rigged head.
   */
  private buildFace(): void {
    this.face = new THREE.Group();
    // deep, black, slanted eye sockets that swallow the brow — angled inward-up so
    // the glare reads as a permanent scowl rather than two round lamps
    const sockMat = new THREE.MeshStandardMaterial({ color: 0x010203, roughness: 1 });
    const sockGeo = new THREE.SphereGeometry(0.07, 12, 12);
    const sockL = new THREE.Mesh(sockGeo, sockMat);
    sockL.position.set(-0.056, 0.03, -0.04);
    sockL.scale.set(1.1, 1.5, 0.7);
    sockL.rotation.z = -0.5;
    const sockR = sockL.clone();
    sockR.position.x = 0.056;
    sockR.rotation.z = 0.5;

    // angled brow ridges meeting in a hard V over the bridge — a fixed scowl
    const browMat = new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 1 });
    const browGeo = new THREE.BoxGeometry(0.13, 0.026, 0.05);
    const browL = new THREE.Mesh(browGeo, browMat);
    browL.position.set(-0.05, 0.084, -0.08);
    browL.rotation.z = 0.34;
    const browR = new THREE.Mesh(browGeo, browMat);
    browR.position.set(0.05, 0.084, -0.08);
    browR.rotation.z = -0.34;

    // a gaunt nasal cavity + sunken cheek hollows turn the bald head into a skull
    const nasal = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.062, 0.03), sockMat);
    nasal.position.set(0, -0.014, -0.086);
    const cheekGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const cheekL = new THREE.Mesh(cheekGeo, sockMat);
    cheekL.position.set(-0.072, -0.05, -0.05); cheekL.scale.set(0.62, 1.25, 0.45); cheekL.rotation.z = 0.5;
    const cheekR = cheekL.clone(); cheekR.position.x = 0.072; cheekR.rotation.z = -0.5;

    // sickly recessed eyes: small, narrowed, with a tall slit pupil — piercing and
    // reptilian, not the big round orbs that read as cartoonish
    const eyeGeo = new THREE.SphereGeometry(0.02, 14, 14);
    this.eyeMatL = new THREE.MeshBasicMaterial({ color: 0xb6ee36, transparent: true, opacity: 0 });
    this.eyeMatR = new THREE.MeshBasicMaterial({ color: 0xb6ee36, transparent: true, opacity: 0 });
    this.eyeL = new THREE.Mesh(eyeGeo, this.eyeMatL);
    this.eyeL.position.set(-0.052, 0.024, -0.088);
    this.eyeL.scale.set(1.05, 0.78, 1);
    this.eyeR = new THREE.Mesh(eyeGeo, this.eyeMatR);
    this.eyeR.position.set(0.052, 0.024, -0.088);
    this.eyeR.scale.set(1.05, 0.78, 1);
    // a tall slit pupil pinned in front of each eye so they read as eyes, not lamps
    const pupilGeo = new THREE.SphereGeometry(0.009, 8, 8);
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x020600 });
    const pupL = new THREE.Mesh(pupilGeo, pupilMat); pupL.position.set(-0.052, 0.024, -0.1); pupL.scale.set(0.5, 1.7, 1);
    const pupR = new THREE.Mesh(pupilGeo, pupilMat); pupR.position.set(0.052, 0.024, -0.1); pupR.scale.set(0.5, 1.7, 1);

    const glowTex = this.makeGlowTex();
    const mkGlow = () =>
      new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xc6f04a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glowL = mkGlow();
    this.glowL.position.set(-0.052, 0.024, -0.09);
    this.glowL.scale.set(0.18, 0.18, 1);
    this.glowR = mkGlow();
    this.glowR.position.set(0.052, 0.024, -0.09);
    this.glowR.scale.set(0.18, 0.18, 1);

    // gaping maw — a black cavity recessed into the lower face that drops open
    const mawGeo = new THREE.ConeGeometry(0.05, 0.17, 9, 1, true);
    mawGeo.translate(0, -0.085, 0);
    this.maw = new THREE.Mesh(mawGeo, new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
    this.maw.position.set(0, -0.075, -0.05);
    this.maw.scale.y = 0.05;

    // a dim, bloody glow down the gullet, brightening only as it gapes wide
    this.throatMat = new THREE.MeshStandardMaterial({ color: 0x140402, emissive: 0x5a0d06, emissiveIntensity: 0, side: THREE.DoubleSide });
    this.throat = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.12, 9, 1, true), this.throatMat);
    this.throat.position.set(0, -0.1, -0.046);

    // jagged teeth — two rows of crooked fangs; the jaws group scales open with the maw
    this.jaws = new THREE.Group();
    this.jaws.position.set(0, -0.028, -0.06);
    const toothMat = new THREE.MeshStandardMaterial({ color: 0x9c9072, roughness: 0.55 });
    const toothGeo = new THREE.ConeGeometry(0.009, 0.038, 5);
    const rndt = () => (Math.random() - 0.5);
    for (let i = 0; i < 7; i++) {
      const fx = (i / 6 - 0.5) * 0.092;
      const upper = new THREE.Mesh(toothGeo, toothMat);
      upper.position.set(fx, -0.012 + rndt() * 0.005, rndt() * 0.008);
      upper.rotation.set(Math.PI + rndt() * 0.16, 0, rndt() * 0.2);
      upper.scale.setScalar(0.8 + Math.random() * 0.5);
      const lower = new THREE.Mesh(toothGeo, toothMat);
      lower.position.set(fx + rndt() * 0.007, -0.092 + rndt() * 0.005, rndt() * 0.008);
      lower.rotation.set(rndt() * 0.16, 0, rndt() * 0.2);
      lower.scale.setScalar(0.7 + Math.random() * 0.5);
      this.jaws.add(upper, lower);
    }
    this.jaws.scale.y = 0.02;

    this.face.add(sockL, sockR, browL, browR, nasal, cheekL, cheekR, this.maw, this.throat, this.jaws, this.eyeL, this.eyeR, pupL, pupR, this.glowL, this.glowR);
    this.group.add(this.face);

    // cold breath that fogs from the maw as it closes in
    this.puffTex = this.makePuffTex();
    this.breath = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.puffTex, color: 0xbcd0d6, transparent: true, opacity: 0, depthWrite: false }));
      s.scale.setScalar(0.001);
      this.breath.add(s);
      this.puffs.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0 });
    }
    this.group.add(this.breath);
  }

  /** soft, slightly cloudy radial sprite for breath vapour */
  private makePuffTex(): THREE.CanvasTexture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,0.7)");
    grad.addColorStop(0.5, "rgba(220,232,236,0.28)");
    grad.addColorStop(1, "rgba(200,220,228,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  private loadRig(): void {
    new GLTFLoader().loadAsync("/models/creature/creature.glb").then(
      (gltf) => this.attachRig(gltf.scene, gltf.animations),
      () => { /* no creature asset — keep the procedural primitive */ }
    );
  }

  private attachRig(scene: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    // redress the grey mannequin as a pallid, waxy, gaunt thing — the torch
    // catches it like dead flesh rather than reading as a plastic dummy
    const skin = this.dressSkin(new THREE.MeshStandardMaterial({ color: 0x7c7669, roughness: 0.64, metalness: 0 }), 4);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.SkinnedMesh) {
        o.material = skin;
        o.castShadow = true;
        o.frustumCulled = false; // skinned bounds can cull wrongly at this scale
      }
      if (o instanceof THREE.Bone && o.name === "mixamorigHead") this.headBone = o;
    });
    // Mixamo models face +Z; the existing convention rotates the group by
    // facing+PI for a -Z-facing model, so flip the rig to face -Z locally.
    // Non-uniform scale stretches it taller and thinner — uncanny, gaunt.
    const inner = new THREE.Group();
    inner.rotation.y = Math.PI;
    // gaunt + too tall: pull the mannequin thin and stretch it vertically so the
    // athletic base reads as a starved, wrong-proportioned thing (kill-cam still
    // frames the head, which the face is pinned to)
    inner.scale.set(RIG_SCALE * 0.78, RIG_SCALE * 1.1, RIG_SCALE * 0.78);
    inner.add(scene);
    this.group.remove(this.body);
    this.group.add(inner);
    this.rigRoot = inner;

    this.mixer = new THREE.AnimationMixer(scene);
    for (const name of ["idle", "walk", "run"]) {
      const clip = THREE.AnimationClip.findByName(clips, name);
      if (clip) this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.current = this.actions.get("idle") ?? null;
    this.current?.play();
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
    if (this.state === "chase") this.playAction("run", Math.min(1.6, Math.max(0.85, speed / 4)));
    else if (speed > 0.1) this.playAction("walk", Math.min(1.8, Math.max(0.7, speed / 1.3)));
    else this.playAction("idle", 1);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.facing + Math.PI;
    this.rigPose(dt);
  }

  /** crouch (dormant) + a predatory forward lean (chase) layered on the rig clips */
  private rigPose(dt: number): void {
    if (!this.rigRoot) return;
    const wantLean = this.state === "chase" ? 0.24 : 0;
    this.leanX += (wantLean - this.leanX) * Math.min(1, 3 * dt);
    this.rigRoot.rotation.x = this.leanX + this.crouchPose * 0.6; // hunch when seated
    this.rigRoot.position.y = -this.crouchPose * 0.3;             // settle into a crouch when dormant
  }

  /** pin the face to the head and drive eyes / maw / head-tics (both render paths) */
  private updateFace(dt: number, dToPlayer: number): void {
    // Pin the face to the creature's actual head. The rigged mannequin exposes a
    // head joint; read its live position (group-local) so the eyes/maw ride the
    // real head through every animation/crouch/lean instead of a fixed height that
    // left the face hovering ~0.5m above the skull. The primitive falls back to its
    // sphere-head height and the crouch bow.
    if (this.headBone) {
      this.group.updateWorldMatrix(true, false);
      this.headBone.updateWorldMatrix(true, false);
      this.headBone.getWorldPosition(this._v);
      this.group.worldToLocal(this._v);
      this.headLocalY = this._v.y + 0.12;       // head joint → eye level
      this.face.position.set(this._v.x, this.headLocalY, this._v.z - 0.12);
    } else {
      const headY = 2.3;
      this.headLocalY = headY - this.crouchPose * 0.5;
      this.face.position.set(0, this.headLocalY, -this.crouchPose * 0.14);
    }

    // head tics: occasional sharp, wrong-angle jerks that decay back
    this.twitchT -= dt;
    if (this.twitchT <= 0) {
      this.twitchT = 1.6 + Math.random() * 3.5;
      this.headTwitchX = (Math.random() - 0.5) * 0.7;
      this.headTwitchY = (Math.random() - 0.5) * 0.95;
    }
    this.headTwitchX *= Math.max(0, 1 - 6 * dt);
    this.headTwitchY *= Math.max(0, 1 - 6 * dt);
    this.breathT += dt;
    this.face.rotation.set(this.headTwitchX + Math.sin(this.breathT * 0.7) * 0.03, this.headTwitchY, 0);

    // the maw yawns open as it hunts / closes in
    const wantMaw = this.state === "chase" && dToPlayer < 10 ? 1 : dToPlayer < 3 ? 0.7 : 0;
    this.mawOpen += (wantMaw - this.mawOpen) * Math.min(1, 4 * dt);
    this.maw.scale.y = 0.06 + this.mawOpen * 0.95;
    // teeth ride open with the jaw; the gullet reddens as it gapes
    this.jaws.scale.y = 0.06 + this.mawOpen * 0.85;
    this.throat.scale.y = 0.25 + this.mawOpen * 0.9;
    this.throatMat.emissiveIntensity = this.mawOpen * 0.8;

    // eye bloom follows eye opacity and flares a little when locked on (maw open);
    // kept smaller than the eye spacing so it reads as two eyes, not one blob
    const o = this.eyeMatL.opacity;
    (this.glowL.material as THREE.SpriteMaterial).opacity = o * 0.75;
    (this.glowR.material as THREE.SpriteMaterial).opacity = o * 0.75;
    const flare = 0.08 + this.mawOpen * 0.04 + o * 0.02;
    this.glowL.scale.setScalar(flare);
    this.glowR.scale.setScalar(flare);

    this.updateBreath(dt, dToPlayer);
  }

  /** cold breath fogging from the maw when it hunts close — recycled sprite pool */
  private updateBreath(dt: number, dToPlayer: number): void {
    const mawY = this.headLocalY - 0.16; // breath fogs from the maw, just under the eyes
    // forward (the face looks down -localZ; group is rotated by facing+PI)
    const fwd = this.facing; // world heading toward the player when hunting
    const fx = Math.sin(fwd), fz = Math.cos(fwd);

    this.puffT -= dt;
    const wantBreath = (this.state === "chase" || this.state === "investigate") && dToPlayer < 8;
    if (wantBreath && this.puffT <= 0) {
      this.puffT = 0.28 + Math.random() * 0.22;
      const p = this.puffs.find((q) => q.life <= 0);
      if (p) {
        p.life = p.max = 0.7 + Math.random() * 0.4;
        p.s.position.set(this.x + fx * 0.18, mawY, this.z + fz * 0.18);
        const spread = 0.18;
        p.vx = fx * 0.45 + (Math.random() - 0.5) * spread;
        p.vz = fz * 0.45 + (Math.random() - 0.5) * spread;
        p.vy = -0.12 - Math.random() * 0.1;
      }
    }
    for (const p of this.puffs) {
      if (p.life <= 0) { p.s.visible = false; continue; }
      p.life -= dt;
      const f = p.life / p.max; // 1 → 0
      p.s.visible = true;
      p.s.position.x += p.vx * dt;
      p.s.position.y += p.vy * dt;
      p.s.position.z += p.vz * dt;
      const sc = 0.12 + (1 - f) * 0.42;
      p.s.scale.setScalar(sc);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.sin(Math.min(1, f) * Math.PI) * 0.4;
    }
  }

  setPos(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.group.position.set(x, 0, z);
  }

  /** turn to face a world point (debug/test scenarios + scripted setups) */
  faceToward(x: number, z: number): void {
    this.facing = Math.atan2(x - this.x, z - this.z);
  }

  /** set the crouch/rise pose 0..1 (debug/test scenarios; 1 = seated, 0 = upright) */
  setCrouchPose(v: number): void {
    this.crouchPose = Math.max(0, Math.min(1, v));
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

  /** cutscene reveal: turn to face a point and rise from its crouch */
  beginReveal(px: number, pz: number): void {
    this.frozen = true;
    this.revealing = true;
    this.facing = Math.atan2(px - this.x, pz - this.z);
  }

  endReveal(): void {
    this.revealing = false;
    this.frozen = false;
  }

  update(dt: number, player: Player, playerLit: boolean): void {
    const px = player.x;
    const pz = player.z;
    const dToPlayer = Math.hypot(px - this.x, pz - this.z);

    // ---- cutscene hold: animate + optional reveal, but never perceive or kill ----
    if (this.frozen) {
      if (this.revealing) this.crouchPose = Math.max(0, this.crouchPose - dt * 0.7);
      if (this.mixer) {
        this.mixer.update(dt);
        this.playAction("idle", 1);
        this.group.position.set(this.x, 0, this.z);
        this.group.rotation.y = this.facing + Math.PI;
        this.rigPose(dt);
      } else {
        this.group.position.set(this.x, -this.crouchPose * 0.72, this.z);
        this.group.rotation.y = this.facing + Math.PI;
        this.body.rotation.x = 0.16 + this.crouchPose * 0.42;
        this.head.rotation.x = -this.body.rotation.x * 0.7 + this.crouchPose * 0.7;
      }
      // eyes flare up as it rises into the torchlight during the reveal
      const target = this.revealing ? Math.min(1, (26 - Math.min(26, dToPlayer)) / 12) : 0;
      this.eyeMatL.opacity += (target - this.eyeMatL.opacity) * Math.min(1, 4 * dt);
      this.eyeMatR.opacity = this.eyeMatL.opacity;
      this.updateFace(dt, dToPlayer);
      return;
    }

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
      // during the back-off cooldown it ignores the player at range (you got away) —
      // but can't be walked into right on top of it
      if (this.giveUpT > 0) {
        this.giveUpT -= dt;
        if (dToPlayer > 4) visibility = 0;
      }
      if (visibility > 0) {
        this.suspicion = Math.min(1.2, this.suspicion + visibility * dt * 1.7 * (1 + this.alert * 0.18));
        if (this.suspicion >= 1 && this.state !== "chase") {
          this.state = "chase";
          this.giveUpT = 0;
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
          // hidden (crouched) or distant players are lost faster — rewards running + hiding
          const giveUp = (player.crouching ? 2.5 : 4) - (dToPlayer > 14 ? 1.5 : 0);
          if (this.loseSightT > giveUp && !this.finalChase) {
            this.state = "search";
            this.searchT = 4;
            this.suspicion = 0.6;
            this.lostChase = true;
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
            if (this.giveUpT > 0) {
              // backing off after losing you: head for the waypoint farthest away
              let best: [number, number] = WAYPOINTS[0];
              let far = -1;
              for (const wp of WAYPOINTS) {
                const [wx, wz] = this.level.cellCenter(wp[0], wp[1]);
                const dp = Math.hypot(wx - player.x, wz - player.z);
                if (dp > far) { far = dp; best = wp; }
              }
              this.targetWp = best;
            } else if (this.alert > 0 && Math.random() < 0.45) {
              // when alerted, it circles the player's general area instead of wandering
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
          if (this.lostChase) {
            this.lostChase = false;
            this.giveUpT = 12; // you got away — it backs off for a while
            this.onLostPlayer?.();
          }
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
      this.animT += dt * (speed > 0.1 ? speed * 2.2 : 1);
      const lurch = speed > 0.1 ? Math.sin(this.animT) : 0;
      // dormant = kneeling: legs sink away, torso upright, head bowed
      this.group.position.set(this.x, Math.abs(lurch) * 0.05 - this.crouchPose * 0.72, this.z);
      this.group.rotation.y = this.facing + Math.PI; // model faces -z locally
      this.body.rotation.z = lurch * 0.07;
      this.body.rotation.x = 0.16 + this.crouchPose * 0.42 + (this.state === "chase" ? 0.22 : 0);
      // long arms claw forward as it closes in for the kill
      const wantReach = this.state === "chase" && dToPlayer < 7 ? 1 : 0;
      this.armReach += (wantReach - this.armReach) * Math.min(1, 4 * dt);
      this.armL.rotation.x = lurch * 0.55 + 0.2 - this.armReach * 1.5;
      this.armR.rotation.x = -lurch * 0.55 + 0.2 - this.armReach * 1.5;
      this.legL.rotation.x = -lurch * 0.65;
      this.legR.rotation.x = lurch * 0.65;
      this.head.rotation.x = -this.body.rotation.x * 0.7 + this.crouchPose * 0.7;
    }

    // eyes glint only when (roughly) facing the player (both paths); updateFace
    // then drives the bloom + maw + head-tics off this opacity.
    const toP = Math.atan2(px - this.x, pz - this.z);
    let fdiff = Math.abs(toP - this.facing) % (Math.PI * 2);
    if (fdiff > Math.PI) fdiff = Math.PI * 2 - fdiff;
    // it locks on harder while hunting: a wider gaze cone and a hotter burn up close
    const hunting = this.state === "chase";
    const cone = hunting ? 1.0 : 0.6;
    const eyesOn = fdiff < cone && dToPlayer < 30
      ? Math.min(1, (30 - dToPlayer) / 12) * (hunting ? 1.15 : 1)
      : 0;
    this.eyeMatL.opacity += (Math.min(1, eyesOn) - this.eyeMatL.opacity) * Math.min(1, 6 * dt);
    this.eyeMatR.opacity = this.eyeMatL.opacity;
    this.updateFace(dt, dToPlayer);
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
