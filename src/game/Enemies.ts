import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ENEMIES, EnemyKind, EnemySpawnDef, EnemyDef } from "../data/content";
import { Player } from "./Player";
import { makeEnemyMaterial, makeMat } from "./ProceduralArt";
import { angleToXZ, clamp, distSq2 } from "../util/math";

export interface HostileProjectile {
  pos: Vector3;
  vel: Vector3;
  life: number;
  radius: number;
  damage: number;
  mesh: Mesh;
}

export interface EnemyCallbacks {
  onPlayerDamaged(amount: number): void;
  onEnemyKilled(enemy: Enemy): void;
  onScream(enemy: Enemy): void;
  clampPosition(pos: Vector3, radius: number): void;
}

export class Enemy {
  root: TransformNode;
  body: Mesh;
  head: Mesh;
  hp: number;
  alive = true;
  dormant: boolean;
  attackCooldown = 0;
  specialCooldown = 1.5;
  knock = new Vector3();
  phase = 1;
  seenTimer = 0;
  private matEmissive: Color3;

  constructor(
    private scene: Scene,
    shadow: ShadowGenerator,
    public def: EnemyDef,
    x: number,
    z: number,
    dormant = false
  ) {
    this.hp = def.hp;
    this.dormant = dormant;
    this.root = new TransformNode(`enemy_${def.kind}`, scene);
    this.root.position.set(x, 0, z);
    const mat = makeEnemyMaterial(scene, `enemyMat_${def.kind}_${Math.random()}`, def.kind, def.color, def.emissive);
    this.matEmissive = mat.emissiveColor.clone();
    const h = def.kind === "crawler" ? 0.45 : def.kind === "brute" || def.kind === "patient_zero" ? 1.85 : 1.25;
    this.body = MeshBuilder.CreateCapsule(`enemyBody_${def.kind}`, { radius: def.radius, height: h }, scene);
    this.body.parent = this.root;
    this.body.position.y = h / 2;
    this.body.material = mat;
    this.head = MeshBuilder.CreateSphere(`enemyHead_${def.kind}`, { diameter: def.radius * 1.05, segments: 8 }, scene);
    this.head.parent = this.root;
    this.head.position.set(0, h + def.radius * 0.36, def.radius * 0.18);
    if (def.kind === "runner") this.head.scaling.set(0.72, 1.28, 0.90);
    else if (def.kind === "crawler") this.head.scaling.set(1.18, 0.70, 1.05);
    else if (def.kind === "patient_zero") this.head.scaling.set(0.90, 1.35, 0.82);
    this.head.material = mat;
    shadow.addShadowCaster(this.body);
    shadow.addShadowCaster(this.head);
    this.createSilhouetteDetails(shadow, mat, h);
  }

  get x(): number { return this.root.position.x; }
  get z(): number { return this.root.position.z; }
  get radius(): number { return this.def.radius; }

  wake(): void {
    this.dormant = false;
  }

  takeDamage(amount: number, from?: Vector3, force = 0): boolean {
    if (!this.alive) return false;
    this.wake();
    this.hp = Math.max(0, this.hp - amount);
    this.seenTimer = 0.18;
    if (from && force > 0) {
      const dx = this.x - from.x;
      const dz = this.z - from.z;
      const len = Math.hypot(dx, dz) || 1;
      const mass = this.def.kind === "brute" || this.def.kind === "patient_zero" ? 0.45 : 1;
      this.knock.x += (dx / len) * force * mass;
      this.knock.z += (dz / len) * force * mass;
    }
    if (this.hp <= 0) {
      this.alive = false;
      this.root.setEnabled(false);
      return true;
    }
    return false;
  }

  update(dt: number, player: Player, callbacks: EnemyCallbacks, projectiles: HostileProjectile[]): void {
    if (!this.alive) return;
    this.seenTimer = Math.max(0, this.seenTimer - dt);
    const mat = this.body.material as { emissiveColor?: Color3 } | null;
    if (mat?.emissiveColor) {
      mat.emissiveColor.copyFrom(this.matEmissive).scaleInPlace(this.dormant ? 0.35 : 1.0 + this.seenTimer * 2);
    }
    const p = player.position;
    const d2 = distSq2(this.x, this.z, p.x, p.z);
    const wakeR = player.noise > 0.2 ? 24 : 9;
    if (this.dormant && d2 < wakeR * wakeR) this.wake();
    if (this.dormant) {
      this.root.rotation.y += Math.sin(performance.now() * 0.0008 + this.x) * dt * 0.08;
      return;
    }

    const ang = angleToXZ(this.x, this.z, p.x, p.z);
    this.root.rotation.y = ang;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.specialCooldown = Math.max(0, this.specialCooldown - dt);

    if (this.def.kind === "patient_zero") this.updatePatientPhase(player);

    if (this.def.kind === "spitter" && Math.sqrt(d2) < this.def.attackRange && this.specialCooldown <= 0) {
      this.fireSpit(player, projectiles);
      this.specialCooldown = 2.4;
    } else if (this.def.kind === "screamer" && Math.sqrt(d2) < this.def.attackRange && this.specialCooldown <= 0) {
      callbacks.onScream(this);
      this.specialCooldown = 5.0;
    }

    const dist = Math.sqrt(d2);
    if (dist > this.def.attackRange || this.def.kind === "spitter" || this.def.kind === "screamer") {
      const speedMul = this.def.kind === "patient_zero" && this.phase === 3 ? 1.75 : 1;
      const step = this.def.speed * speedMul * dt;
      this.root.position.x += Math.sin(ang) * step;
      this.root.position.z += Math.cos(ang) * step;
    } else if (this.attackCooldown <= 0) {
      callbacks.onPlayerDamaged(this.def.damage);
      this.attackCooldown = this.def.attackCooldown;
    }

    if (this.knock.lengthSquared() > 0.0001) {
      this.root.position.x += this.knock.x * dt;
      this.root.position.z += this.knock.z * dt;
      const decay = Math.pow(0.03, dt);
      this.knock.scaleInPlace(decay);
      if (this.knock.lengthSquared() < 0.002) this.knock.set(0, 0, 0);
    }
    callbacks.clampPosition(this.root.position, this.def.radius);
  }

  private updatePatientPhase(player: Player): void {
    const ratio = this.hp / this.def.hp;
    if (ratio < 0.34) this.phase = 3;
    else if (ratio < 0.67) this.phase = 2;
    if (this.phase === 2 && this.specialCooldown < 0.5) this.specialCooldown = 0.5;
    if (player.noise > 0.3) this.def.speed = clamp(this.def.speed + 0.001, 1.35, 1.75);
  }

  private fireSpit(player: Player, projectiles: HostileProjectile[]): void {
    const pos = new Vector3(this.x, 0.8, this.z);
    const dir = player.position.subtract(pos);
    dir.y = 0;
    dir.normalize();
    const mesh = MeshBuilder.CreateSphere("spit", { diameter: 0.22, segments: 8 }, this.scene);
    mesh.position.copyFrom(pos);
    mesh.material = makeMat(this.scene, `spitMat_${Math.random()}`, new Color3(0.45, 0.62, 0.12), new Color3(0.18, 0.28, 0.04));
    projectiles.push({ pos, vel: dir.scale(6.5), life: 2.0, radius: 0.22, damage: this.def.damage, mesh });
  }

  private createSilhouetteDetails(shadow: ShadowGenerator, mat: StandardMaterial, height: number): void {
    const darkMat = makeMat(this.scene, `enemyDark_${this.def.kind}_${Math.random()}`, new Color3(0.020, 0.016, 0.014), new Color3(0.004, 0.002, 0.002));
    const boneMat = makeMat(this.scene, `enemyBone_${this.def.kind}_${Math.random()}`, new Color3(0.48, 0.42, 0.31), new Color3(0.020, 0.014, 0.008));
    const wetMat = makeMat(this.scene, `enemyWet_${this.def.kind}_${Math.random()}`, new Color3(0.16, 0.035, 0.028), new Color3(0.050, 0.006, 0.004));
    const eyeMat = makeMat(this.scene, `enemyEyes_${this.def.kind}_${Math.random()}`, new Color3(0.10, 0.018, 0.014), new Color3(0.18, 0.032, 0.020));
    const addBox = (name: string, size: { width: number; height: number; depth: number }, x: number, y: number, z: number): Mesh => {
      const mesh = MeshBuilder.CreateBox(name, size, this.scene);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.material = mat;
      mesh.isPickable = false;
      shadow.addShadowCaster(mesh);
      return mesh;
    };
    const addDetailBox = (name: string, size: { width: number; height: number; depth: number }, x: number, y: number, z: number, detailMat: StandardMaterial): Mesh => {
      const mesh = addBox(name, size, x, y, z);
      mesh.material = detailMat;
      return mesh;
    };
    const addLimb = (name: string, radius: number, limbHeight: number, x: number, y: number, z: number, rz: number): Mesh => {
      const mesh = MeshBuilder.CreateCylinder(name, { diameter: radius, height: limbHeight, tessellation: 6 }, this.scene);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.material = mat;
      mesh.isPickable = false;
      shadow.addShadowCaster(mesh);
      return mesh;
    };
    const addSphere = (name: string, diameter: number, x: number, y: number, z: number, detailMat: StandardMaterial): Mesh => {
      const mesh = MeshBuilder.CreateSphere(name, { diameter, segments: 8 }, this.scene);
      mesh.parent = this.root;
      mesh.position.set(x, y, z);
      mesh.material = detailMat;
      mesh.isPickable = false;
      return mesh;
    };

    if (this.def.kind !== "crawler") {
      addSphere("enemyEyeL", this.def.radius * 0.16, -this.def.radius * 0.18, height + this.def.radius * 0.46, this.def.radius * 0.66, eyeMat);
      addSphere("enemyEyeR", this.def.radius * 0.13, this.def.radius * 0.20, height + this.def.radius * 0.43, this.def.radius * 0.66, eyeMat);
      addDetailBox("enemySplitMouth", { width: this.def.radius * 0.50, height: 0.035, depth: this.def.radius * 0.18 }, 0, height + this.def.radius * 0.20, this.def.radius * 0.64, darkMat);
      addDetailBox("enemyFaceVoid", { width: this.def.radius * 0.34, height: this.def.radius * 0.48, depth: 0.035 }, 0, height + this.def.radius * 0.42, this.def.radius * 0.71, darkMat);
      for (let i = 0; i < 3; i++) {
        addLimb(
          "enemyHangingStrip",
          0.035,
          height * 0.34,
          (i - 1) * this.def.radius * 0.22,
          height * 0.78,
          -this.def.radius * 0.58,
          (i - 1) * 0.20
        ).material = wetMat;
      }
    }

    if (this.def.kind === "crawler") {
      addLimb("enemyCrawlerArmL", 0.09, 0.70, -0.34, 0.28, 0.08, 1.12);
      addLimb("enemyCrawlerArmR", 0.09, 0.70, 0.34, 0.28, 0.08, -1.12);
      addBox("enemyCrawlerBack", { width: this.def.radius * 1.3, height: 0.12, depth: 0.48 }, 0, height * 0.72, -0.08);
      addLimb("enemyCrawlerLegL", 0.07, 0.62, -0.44, 0.24, -0.18, 0.86);
      addLimb("enemyCrawlerLegR", 0.07, 0.62, 0.44, 0.24, -0.18, -0.86);
      addDetailBox("enemyCrawlerJaw", { width: this.def.radius * 0.86, height: 0.06, depth: 0.22 }, 0, height + 0.08, this.def.radius * 0.56, darkMat);
      addSphere("enemyCrawlerEye", this.def.radius * 0.14, -this.def.radius * 0.18, height + 0.18, this.def.radius * 0.62, eyeMat);
      for (let i = 0; i < 4; i++) addDetailBox("enemyCrawlerSpine", { width: 0.12, height: 0.10, depth: 0.08 }, 0, 0.38 + i * 0.11, -0.28 + i * 0.03, boneMat);
      return;
    }

    const armY = height * 0.58;
    addLimb("enemyArmL", this.def.radius * 0.18, height * 0.52, -this.def.radius * 0.78, armY, 0.02, 0.28);
    addLimb("enemyArmR", this.def.radius * 0.18, height * 0.52, this.def.radius * 0.78, armY, 0.02, -0.28);
    if (this.def.kind === "runner") {
      addBox("enemyRunnerRibs", { width: this.def.radius * 1.05, height: 0.10, depth: 0.18 }, 0, height * 0.72, -this.def.radius * 0.42);
      addLimb("enemyRunnerClawL", 0.055, height * 0.45, -this.def.radius * 1.10, height * 0.38, this.def.radius * 0.20, 0.18);
      addLimb("enemyRunnerClawR", 0.055, height * 0.45, this.def.radius * 1.10, height * 0.38, this.def.radius * 0.20, -0.18);
      addDetailBox("enemyRunnerBrokenMask", { width: this.def.radius * 0.64, height: 0.07, depth: 0.08 }, this.def.radius * 0.12, height + this.def.radius * 0.62, this.def.radius * 0.66, boneMat);
      for (let i = 0; i < 4; i++) addDetailBox("enemyRunnerRibSlat", { width: this.def.radius * 0.86, height: 0.035, depth: 0.05 }, 0, height * (0.58 + i * 0.055), this.def.radius * 0.46, boneMat);
    } else if (this.def.kind === "spitter") {
      addDetailBox("enemySpitterThroat", { width: this.def.radius * 0.72, height: 0.24, depth: 0.20 }, 0, height * 0.91, this.def.radius * 0.46, wetMat);
      addSphere("enemySpitterSac", this.def.radius * 0.52, 0, height * 0.84, this.def.radius * 0.55, wetMat);
    } else if (this.def.kind === "screamer") {
      addDetailBox("enemyScreamerJaw", { width: this.def.radius * 0.95, height: 0.14, depth: 0.22 }, 0, height + this.def.radius * 0.02, this.def.radius * 0.54, darkMat);
      addDetailBox("enemyScreamerThroat", { width: this.def.radius * 0.52, height: 0.44, depth: 0.08 }, 0, height * 0.86, this.def.radius * 0.58, wetMat);
      addLimb("enemyScreamerFingerL", 0.04, height * 0.62, -this.def.radius * 1.00, height * 0.42, this.def.radius * 0.16, 0.44);
      addLimb("enemyScreamerFingerR", 0.04, height * 0.62, this.def.radius * 1.00, height * 0.42, this.def.radius * 0.16, -0.44);
    } else if (this.def.kind === "brute" || this.def.kind === "patient_zero") {
      addBox("enemyBruteShoulderL", { width: this.def.radius * 0.65, height: 0.26, depth: 0.32 }, -this.def.radius * 0.62, height * 0.82, 0);
      addBox("enemyBruteShoulderR", { width: this.def.radius * 0.65, height: 0.26, depth: 0.32 }, this.def.radius * 0.62, height * 0.82, 0);
      for (let i = 0; i < 5; i++) addDetailBox("enemyBruteBackPlate", { width: this.def.radius * 0.46, height: 0.16, depth: 0.12 }, 0, height * (0.44 + i * 0.10), -this.def.radius * 0.54, boneMat);
      if (this.def.kind === "patient_zero") {
        addSphere("enemyPatientChest", this.def.radius * 0.44, 0, height * 0.62, this.def.radius * 0.54, wetMat);
        addDetailBox("enemyPatientCrown", { width: this.def.radius * 0.82, height: 0.16, depth: 0.18 }, 0, height + this.def.radius * 0.88, 0, boneMat);
        for (let i = 0; i < 7; i++) {
          const x = (i - 3) * this.def.radius * 0.18;
          addLimb("enemyPatientGateRod", 0.035, this.def.radius * (0.75 + i * 0.02), x, height + this.def.radius * 0.95, -this.def.radius * 0.05, (i - 3) * 0.12).material = boneMat;
        }
        addDetailBox("enemyPatientNameTag", { width: this.def.radius * 0.38, height: 0.07, depth: 0.05 }, -this.def.radius * 0.34, height * 0.70, this.def.radius * 0.64, boneMat);
      }
    } else {
      addDetailBox("enemyShamblerNeck", { width: this.def.radius * 0.30, height: 0.38, depth: this.def.radius * 0.22 }, -this.def.radius * 0.18, height * 0.92, this.def.radius * 0.18, darkMat);
      addLimb("enemyShamblerLooseArm", 0.065, height * 0.68, this.def.radius * 0.95, height * 0.42, -this.def.radius * 0.04, -0.12);
    }
  }

  dispose(): void {
    this.root.dispose(false, true);
  }
}

export class EnemyManager {
  enemies: Enemy[] = [];
  projectiles: HostileProjectile[] = [];

  constructor(private scene: Scene, private shadow: ShadowGenerator) {}

  spawn(kind: EnemyKind, x: number, z: number, dormant = false): Enemy {
    const enemy = new Enemy(this.scene, this.shadow, ENEMIES[kind], x, z, dormant);
    this.enemies.push(enemy);
    return enemy;
  }

  spawnAll(spawns: EnemySpawnDef[]): void {
    for (const s of spawns) this.spawn(s.kind, s.x, s.z, !!s.dormant);
  }

  clear(): void {
    for (const e of this.enemies) e.dispose();
    for (const p of this.projectiles) p.mesh.dispose();
    this.enemies.length = 0;
    this.projectiles.length = 0;
  }

  update(dt: number, player: Player, callbacks: EnemyCallbacks): void {
    for (const e of this.enemies) e.update(dt, player, callbacks, this.projectiles);
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (!this.enemies[i].alive) {
        callbacks.onEnemyKilled(this.enemies[i]);
        this.enemies[i].dispose();
        this.enemies.splice(i, 1);
      }
    }
    this.updateProjectiles(dt, player, callbacks);
  }

  aliveCount(): number {
    return this.enemies.filter((e) => e.alive).length;
  }

  wakeDormantNear(x: number, z: number, radius: number): void {
    const r2 = radius * radius;
    for (const e of this.enemies) {
      if (distSq2(e.x, e.z, x, z) < r2) e.wake();
    }
  }

  private updateProjectiles(dt: number, player: Player, callbacks: EnemyCallbacks): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.pos.addInPlace(p.vel.scale(dt));
      p.mesh.position.copyFrom(p.pos);
      const d2 = distSq2(p.pos.x, p.pos.z, player.position.x, player.position.z);
      if (d2 < (p.radius + player.radius) * (p.radius + player.radius)) {
        callbacks.onPlayerDamaged(p.damage);
        p.life = 0;
      }
      if (p.life <= 0) {
        p.mesh.dispose();
        this.projectiles.splice(i, 1);
      }
    }
  }
}
