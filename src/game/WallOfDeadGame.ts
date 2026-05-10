import "../engine/babylonSideEffects";

import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { createSceneBundle, SceneBundle } from "../engine/SceneSetup";
import { createFirstPersonCamera, FirstPersonCameraRig } from "../engine/FirstPersonCamera";
import { validateBabylonRuntime } from "../engine/BabylonRuntimeCheck";
import { InputController } from "./InputController";
import { Player } from "./Player";
import { Enemy, EnemyManager } from "./Enemies";
import { moveCircleWithColliders, RectCollider, resolveCircleColliders } from "./Collision";
import { RuntimeInteractable, WorldBuilder, WorldRuntime } from "./WorldBuilder";
import { Hud } from "../ui/Hud";
import { DeathMenuChoice, MenuSystem, PauseMenuChoice, StartMenuChoice } from "../ui/MenuSystem";
import { AudioSystem } from "../audio/AudioSystem";
import { EnemySpawnDef, LookAtDef, ScareAction, ScareBeat, ScareTrigger, WEAPONS, WeaponDef, ZONE_BY_ID, ZoneDef } from "../data/content";
import { clamp, distSq2 } from "../util/math";
import { makeMat } from "./ProceduralArt";
import { WeaponViewModel } from "./WeaponViewModel";

interface TimedMesh {
  mesh: Mesh;
  ttl: number;
  light?: PointLight;
}

interface Bomb {
  pos: Vector3;
  timer: number;
  radius: number;
  damage: number;
  mesh: Mesh;
  light: PointLight;
}

interface QueuedScareBeat {
  zoneId: string;
  due: number;
  beat: ScareBeat;
}

interface ScareEvent {
  action?: ScareAction;
  text?: string;
  sound?: string;
  objective?: string;
  spawns?: EnemySpawnDef[];
  x?: number;
  z?: number;
  flicker?: number;
  blackout?: number;
  dread?: number;
  cinematic?: boolean;
  lockInput?: number;
  lookAt?: LookAtDef;
}

export class WallOfDeadGame {
  private bundle: SceneBundle;
  private cam: FirstPersonCameraRig;
  private input: InputController;
  private player: Player;
  private weaponView: WeaponViewModel;
  private enemies: EnemyManager;
  private worldBuilder: WorldBuilder;
  private world: WorldRuntime | null = null;
  private hud: Hud;
  private menus: MenuSystem;
  private audio = new AudioSystem();
  private started = false;
  private paused = false;
  private menuInFlight = false;
  private currentZone: ZoneDef = ZONE_BY_ID.approach_road;
  private firedScares = new Set<string>();
  private flags = new Set<string>();
  private zoneElapsed = 0;
  private dread = 0.25;
  private damageFlash = 0;
  private flickerTimer = 0;
  private blackoutTimer = 0;
  private chaseActive = false;
  private effects: TimedMesh[] = [];
  private bombs: Bomb[] = [];
  private movementStep = new Vector3();
  private lastInteractId: string | null = null;
  private endingTimer = 0;
  private queuedScareBeats: QueuedScareBeat[] = [];
  private cinematicTimer = 0;
  private cinematicTotal = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.bundle = createSceneBundle(canvas);
    this.cam = createFirstPersonCamera(this.bundle.scene);
    this.bundle.attachPostFx(this.cam.camera);
    validateBabylonRuntime(this.bundle.scene, this.cam.camera);

    this.input = new InputController(this.bundle.scene);
    this.hud = new Hud();
    this.menus = new MenuSystem(this.bundle.scene);
    this.player = new Player(this.bundle.scene, this.bundle.shadow);
    this.weaponView = new WeaponViewModel(this.bundle.scene, this.cam.camera);
    this.cam.setTarget(this.player.root);
    this.enemies = new EnemyManager(this.bundle.scene, this.bundle.shadow);
    this.worldBuilder = new WorldBuilder(this.bundle.scene, this.bundle.shadow);
    this.hud.setGameplayVisible(false);
    this.hud.setStartVisible(false);
    this.hud.showDeath(false);

    window.addEventListener("keydown", (event) => {
      const skipKey = event.key === "Escape" || event.code === "Space";
      if (skipKey && this.cinematicTimer > 0) {
        const elapsed = this.cinematicTotal - this.cinematicTimer;
        if (elapsed > 0.35) this.endCinematic();
        event.preventDefault();
        return;
      }
      if (event.key !== "Escape") return;
      if (this.menus.handleEscape()) return;
      if (this.started && !this.player.dead) void this.openPauseMenu();
    });
    document.addEventListener("pointerlockchange", () => {
      if (!this.started || this.paused || this.menuInFlight || this.player.dead || this.menus.isOpen || this.cinematicTimer > 0) return;
      if (!this.input.isPointerLocked()) void this.openPauseMenu();
    });
    canvas.addEventListener("click", () => {
      if (this.started && !this.paused && !this.player.dead && !this.menus.isOpen) this.input.requestPointerLock();
    });

    this.bundle.scene.onBeforeRenderObservable.add(() => this.tick());
    this.bundle.engine.runRenderLoop(() => this.bundle.scene.render());
    void this.openStartMenu();
  }

  startCampaign(): void {
    this.audio.init();
    this.started = true;
    this.paused = false;
    this.menuInFlight = false;
    this.input.setPointerLockEnabled(true);
    this.menus.hide();
    this.hud.setGameplayVisible(true);
    this.flags.clear();
    this.chaseActive = false;
    this.endingTimer = 0;
    this.dread = 0.18;
    this.damageFlash = 0;
    this.flickerTimer = 0;
    this.blackoutTimer = 0;
    this.cinematicTimer = 0;
    this.cinematicTotal = 0;
    this.queuedScareBeats.length = 0;
    this.clearTransientEffects();
    this.player.hp = this.player.maxHp;
    this.player.stamina = this.player.maxStamina;
    this.player.medkits = 1;
    this.player.dead = false;
    this.player.resetInventory();
    this.player.selected = 0;
    for (const weapon of this.player.inventory) {
      weapon.mag = weapon.def.magSize;
      weapon.reserve = WEAPONS[weapon.id].startReserve;
      weapon.cooldown = 0;
      weapon.reloadTimer = 0;
    }
    this.hud.setStartVisible(false);
    this.hud.showDeath(false);
    this.loadZone("approach_road");
    this.input.requestPointerLock();
    this.hud.showNarrative("The road to the Freedom Gate is still lit.", 4.0);
  }

  dispose(): void {
    this.clearTransientEffects();
    this.world?.dispose();
    this.enemies.clear();
    this.weaponView.dispose();
    this.player.dispose();
    this.menus.dispose();
    this.bundle.disposeHeavyFx();
    this.bundle.scene.dispose();
    this.bundle.engine.dispose();
  }

  private loadZone(zoneId: string): void {
    const zone = ZONE_BY_ID[zoneId];
    if (!zone) throw new Error(`Unknown zone "${zoneId}"`);
    this.currentZone = zone;
    this.zoneElapsed = 0;
    this.chaseActive = false;
    this.firedScares.clear();
    this.queuedScareBeats.length = 0;
    this.lastInteractId = null;
    this.flickerTimer = 0;
    this.blackoutTimer = 0;
    this.cinematicTimer = 0;
    this.cinematicTotal = 0;
    this.world?.dispose();
    this.enemies.clear();
    this.world = this.worldBuilder.build(zone);
    this.enemies.spawnAll(zone.enemies);
    this.player.position.set(zone.entry.x, 0, zone.entry.z);
    const entryYaw = zone.entry.yaw ?? Math.PI;
    this.player.root.rotation.y = entryYaw;
    this.cam.snapToTarget(entryYaw);
    this.bundle.scene.fogColor.copyFrom(zone.fog);
    this.audio.setAmbientPool(zone.ambient);
    this.hud.setObjective(zone.objective);
    this.hud.setPrompt("");
    this.updateWorldLights(0);
    this.cam.update(1 / 60);
    this.bundle.setDreadVisuals(this.dread, this.damageFlash);
    if (zone.isEnding) {
      this.endingTimer = 7.0;
      this.dread = 0.1;
    }
    for (const beat of zone.intro ?? []) {
      this.queuedScareBeats.push({ zoneId: zone.id, due: this.zoneElapsed + beat.after, beat });
    }
    for (const scare of zone.scares.filter((s) => s.trigger === "enter")) this.fireScare(scare);
  }

  private tick(): void {
    const dt = Math.min(this.bundle.engine.getDeltaTime() / 1000, 1 / 30);
    if (!this.started || !this.world) {
      this.cam.update(dt);
      this.weaponView.update(dt, this.player.weapon, false, false);
      return;
    }
    if (this.paused) {
      this.cam.update(dt);
      this.weaponView.update(dt, this.player.weapon, false, false);
      return;
    }
    if (this.player.dead) {
      if (!this.menuInFlight) void this.openDeathMenu();
      this.cam.update(dt);
      return;
    }

    this.zoneElapsed += dt;
    this.updateCinematic(dt);
    const cinematicActive = this.cinematicTimer > 0;
    const frame = this.input.consume(this.cam.camera.getForwardRay().direction);
    if (!cinematicActive) {
      if (frame.selectedSlot !== null) this.player.select(frame.selectedSlot);
      if (frame.nextWeapon) this.player.cycle(frame.nextWeapon);
      if (frame.reloadPressed && this.player.startReload()) {
        this.audio.play("reload");
        this.weaponView.onReload();
      }
      if (frame.medkitPressed && this.player.useMedkit()) this.hud.showNarrative("You press gauze into the wound until your hand stops shaking.", 2.5);
    }

    const moving = !cinematicActive && frame.move.lengthSquared() > 0.01;
    const sprinting = frame.sprint && moving && this.player.stamina > 2;
    const speed = (sprinting ? 4.4 : 2.55) * (this.chaseActive ? 1.04 : 1);
    this.movementStep.copyFrom(frame.move).scaleInPlace(speed * dt);
    if (!cinematicActive) this.moveActor(this.player.position, this.movementStep, this.player.radius);
    this.cam.setTension(this.dread);
    this.cam.update(dt, cinematicActive ? 0 : frame.lookDeltaX, cinematicActive ? 0 : frame.lookDeltaY, moving, sprinting);
    if (cinematicActive) this.hud.setPrompt("");
    else {
      this.handleInteraction(frame.interactPressed);
      this.handleFire(frame.firePressed, frame.fireHeld);
    }

    this.player.update(dt, moving, sprinting, this.cam.getYaw());
    this.weaponView.update(dt, this.player.weapon, moving, sprinting);
    if (!cinematicActive) this.updateEnemies(dt);
    this.updateScares();
    this.updateScareBeats();
    this.updateWorldLights(dt);
    this.updateEffects(dt);
    this.updateDread(dt);
    this.cam.setTension(this.dread);
    this.bundle.setDreadVisuals(this.dread, this.damageFlash);
    this.audio.tick(dt, this.dread, this.chaseActive);
    this.hud.update(dt, this.player, this.dread);
    if (this.endingTimer > 0) {
      this.endingTimer = Math.max(0, this.endingTimer - dt);
      if (this.endingTimer === 0) this.hud.showNarrative("You made it past the wall. The road beyond is not empty.", 8);
    }
  }

  private async openStartMenu(): Promise<void> {
    if (this.menuInFlight) return;
    this.menuInFlight = true;
    this.input.setPointerLockEnabled(false);
    this.hud.setGameplayVisible(false);
    const choice = await this.menus.showStartMenu();
    this.menuInFlight = false;
    this.handleStartChoice(choice);
  }

  private async openPauseMenu(): Promise<void> {
    if (this.menuInFlight || !this.started || this.player.dead) return;
    this.menuInFlight = true;
    this.paused = true;
    this.input.setPointerLockEnabled(false);
    this.hud.setGameplayVisible(false);
    const choice = await this.menus.showPauseMenu();
    this.menuInFlight = false;
    this.handlePauseChoice(choice);
  }

  private async openDeathMenu(): Promise<void> {
    if (this.menuInFlight) return;
    this.menuInFlight = true;
    this.paused = true;
    this.input.setPointerLockEnabled(false);
    this.hud.setGameplayVisible(false);
    const choice = await this.menus.showDeathMenu();
    this.menuInFlight = false;
    this.handleDeathChoice(choice);
  }

  private handleStartChoice(choice: StartMenuChoice): void {
    if (choice === "begin") {
      this.startCampaign();
      return;
    }
    this.requestQuit();
  }

  private handlePauseChoice(choice: PauseMenuChoice): void {
    if (choice === "resume") {
      this.paused = false;
      this.input.setPointerLockEnabled(true);
      this.hud.setGameplayVisible(true);
      this.input.requestPointerLock();
      return;
    }
    if (choice === "mainMenu") {
      this.started = false;
      this.paused = false;
      this.input.setPointerLockEnabled(false);
      this.hud.setGameplayVisible(false);
      void this.openStartMenu();
      return;
    }
    this.requestQuit();
  }

  private handleDeathChoice(choice: DeathMenuChoice): void {
    if (choice === "restart") {
      this.startCampaign();
      return;
    }
    this.player.dead = false;
    this.started = false;
    this.paused = false;
    this.input.setPointerLockEnabled(false);
    this.hud.setGameplayVisible(false);
    if (choice === "mainMenu") void this.openStartMenu();
    else this.requestQuit();
  }

  private requestQuit(): void {
    window.close();
    if (!window.closed) {
      this.hud.showNarrative("Use the window controls to leave the browser preview.", 3.0);
      if (!this.started) void this.openStartMenu();
      else {
        this.paused = false;
        this.input.setPointerLockEnabled(true);
        this.hud.setGameplayVisible(true);
      }
    }
  }

  private handleFire(pressed: boolean, held: boolean): void {
    const weapon = this.player.weapon;
    const wantsFire = pressed || (weapon.def.automatic && held);
    if (!wantsFire || !this.player.canFire(!pressed && held)) return;
    if (weapon.def.ammoType !== "none" && weapon.mag <= 0) {
      this.player.startReload();
      this.audio.play("reload");
      this.weaponView.onReload();
      return;
    }
    this.player.spendShot();
    this.weaponView.onFire(weapon.id);
    this.audio.play(weapon.id === "pipebomb" ? "pipebomb" : weapon.id);
    this.cam.shake(weapon.def.recoil * 0.55, 0.16 + weapon.def.recoil * 0.12);
    this.enemies.wakeDormantNear(this.player.position.x, this.player.position.z, 10 + weapon.def.noise * 18);
    const forward = this.cam.camera.getForwardRay().direction.clone();
    if (weapon.def.explosive) this.throwBomb(forward, weapon.def);
    else if (weapon.def.flare) this.fireFlare(forward, weapon.def);
    else this.applyWeaponHit(forward, weapon.def);
  }

  private applyWeaponHit(forward: Vector3, def: WeaponDef): void {
    const origin = this.cam.camera.position.clone();
    origin.y -= 0.08;
    const flatLen = Math.hypot(forward.x, forward.z);
    if (flatLen < 0.001) return;
    const base = Math.atan2(forward.x / flatLen, forward.z / flatLen);
    for (let i = 0; i < def.pellets; i++) {
      const spread = (Math.random() - 0.5) * def.spread * 2;
      const a = base + spread;
      const dir = new Vector3(Math.sin(a), 0, Math.cos(a));
      let hit: Enemy | null = null;
      let hitDist = def.range;
      for (const enemy of this.enemies.enemies) {
        if (!enemy.alive) continue;
        const ex = enemy.x - origin.x;
        const ez = enemy.z - origin.z;
        const along = ex * dir.x + ez * dir.z;
        if (along < 0 || along > hitDist) continue;
        const perpSq = ex * ex + ez * ez - along * along;
        const hitRadius = enemy.radius + (def.melee ? 0.55 : 0.14);
        if (perpSq <= hitRadius * hitRadius) {
          if (def.melee) {
            const forward = new Vector3(Math.sin(this.player.root.rotation.y), 0, Math.cos(this.player.root.rotation.y));
            const dot = (ex * forward.x + ez * forward.z) / Math.max(0.001, Math.hypot(ex, ez));
            if (dot < 0.25) continue;
          }
          hit = enemy;
          hitDist = along;
        }
      }
      const end = origin.add(dir.scale(hitDist));
      end.y = def.melee ? origin.y - 0.1 : origin.y;
      this.spawnTracer(origin, end, def.melee ? new Color3(0.75, 0.60, 0.38) : new Color3(1.0, 0.70, 0.24), def.melee ? 0.11 : 0.055);
      if (hit) {
        const killed = hit.takeDamage(def.damage, origin, def.recoil * 8);
        this.audio.play(killed ? "body_drop" : "hit");
        if (killed) this.player.noise = Math.min(1, this.player.noise + 0.12);
      }
    }
  }

  private groundPointInView(forward: Vector3, range: number): Vector3 {
    const flatLen = Math.hypot(forward.x, forward.z);
    if (flatLen < 0.001) {
      return new Vector3(this.player.position.x, 0, this.player.position.z + range);
    }
    return new Vector3(
      this.player.position.x + (forward.x / flatLen) * range,
      0,
      this.player.position.z + (forward.z / flatLen) * range
    );
  }

  private fireFlare(forward: Vector3, def: WeaponDef): void {
    const pos = this.groundPointInView(forward, def.range);
    pos.y = 0.25;
    const mesh = MeshBuilder.CreateSphere("flareOrb", { diameter: 0.42, segments: 12 }, this.bundle.scene);
    mesh.position.copyFrom(pos);
    const mat = makeMat(this.bundle.scene, `flareMat_${performance.now()}`, new Color3(1, 0.35, 0.12), new Color3(1.2, 0.42, 0.12));
    mat.disableLighting = true;
    mesh.material = mat;
    const light = new PointLight(`flareLight_${performance.now()}`, new Vector3(pos.x, 1.0, pos.z), this.bundle.scene);
    light.diffuse = new Color3(1.0, 0.33, 0.12);
    light.range = 12;
    light.intensity = 2.6;
    this.effects.push({ mesh, ttl: 12, light });
    for (const enemy of this.enemies.enemies) {
      if (distSq2(enemy.x, enemy.z, pos.x, pos.z) < 5.5 * 5.5) enemy.takeDamage(def.damage, pos, 2);
    }
    this.dread = Math.max(0.15, this.dread - 0.28);
  }

  private throwBomb(forward: Vector3, def: WeaponDef): void {
    const pos = this.groundPointInView(forward, def.range);
    pos.y = 0.28;
    const mesh = MeshBuilder.CreateSphere("pipeBomb", { diameter: 0.35, segments: 8 }, this.bundle.scene);
    mesh.position.copyFrom(pos);
    mesh.material = makeMat(this.bundle.scene, `bombMat_${performance.now()}`, new Color3(0.22, 0.20, 0.14), new Color3(0.12, 0.04, 0.01));
    const light = new PointLight(`bombBlink_${performance.now()}`, new Vector3(pos.x, 0.8, pos.z), this.bundle.scene);
    light.diffuse = new Color3(1.0, 0.12, 0.04);
    light.range = 3;
    light.intensity = 0.8;
    this.bombs.push({ pos, timer: 1.55, radius: 4.2, damage: def.damage, mesh, light });
  }

  private explode(pos: Vector3, radius: number, damage: number): void {
    this.audio.play("explosion");
    this.cam.shake(0.42, 0.42);
    this.damageFlash = 1;
    for (const enemy of this.enemies.enemies) {
      const d2 = distSq2(enemy.x, enemy.z, pos.x, pos.z);
      if (d2 > radius * radius) continue;
      const t = 1 - d2 / (radius * radius);
      enemy.takeDamage(Math.floor(damage * (0.35 + t * 0.65)), pos, 12);
    }
    if (distSq2(this.player.position.x, this.player.position.z, pos.x, pos.z) < radius * radius) {
      this.player.takeDamage(Math.floor(damage * 0.22));
    }
    const mesh = MeshBuilder.CreateSphere("explosionFx", { diameter: radius * 2, segments: 16 }, this.bundle.scene);
    mesh.position.set(pos.x, 0.65, pos.z);
    const mat = new StandardMaterial(`explosionMat_${performance.now()}`, this.bundle.scene);
    mat.diffuseColor = new Color3(1.0, 0.18, 0.05);
    mat.emissiveColor = new Color3(1.0, 0.20, 0.06);
    mat.alpha = 0.22;
    mat.disableLighting = true;
    mesh.material = mat;
    this.effects.push({ mesh, ttl: 0.28 });
  }

  private spawnTracer(start: Vector3, end: Vector3, color: Color3, radius: number): void {
    const mesh = MeshBuilder.CreateTube("shotTracer", { path: [start, end], radius, tessellation: 6 }, this.bundle.scene);
    const mat = makeMat(this.bundle.scene, `tracerMat_${performance.now()}`, color, color);
    mat.alpha = 0.68;
    mat.disableLighting = true;
    mesh.material = mat;
    this.effects.push({ mesh, ttl: 0.10 });
  }

  private handleInteraction(pressed: boolean): void {
    if (!this.world) return;
    let nearest: RuntimeInteractable | null = null;
    let best = Infinity;
    for (const it of this.world.interactables) {
      if (it.used && it.def.oneShot !== false) continue;
      const d2 = distSq2(it.def.x, it.def.z, this.player.position.x, this.player.position.z);
      const r = it.def.radius ?? 1.7;
      if (d2 < r * r && d2 < best) {
        nearest = it;
        best = d2;
      }
    }
    this.hud.setPrompt(nearest ? `E - ${nearest.def.label}` : "");
    if (!nearest || !pressed) return;
    this.lastInteractId = nearest.def.id;
    this.useInteractable(nearest);
  }

  private useInteractable(it: RuntimeInteractable): void {
    const def = it.def;
    if (def.kind === "door") {
      if (def.lockedUntil && !this.flags.has(def.lockedUntil)) {
        this.hud.showNarrative(def.lockedText ?? "The lock refuses to move. Something behind you is getting closer.", 3.5);
        return;
      }
      if (def.targetZone) {
        this.fireInteractScares(def.id);
        this.loadZone(def.targetZone);
      }
      return;
    }
    if (def.kind === "seal") {
      this.closeSeal(it);
      return;
    }
    if (def.kind === "note" || def.kind === "radio") {
      this.hud.showNarrative(def.text ?? "", def.kind === "radio" ? 5.5 : 5);
      this.audio.play(def.kind === "radio" ? "pa_broken" : "cloth_rustle");
    } else if (def.kind === "supply") {
      const weapons = def.payload?.weapons ?? [];
      const gainedWeapons = weapons.filter((id) => this.player.addWeapon(id));
      this.player.addSupplies(def.payload?.ammo, def.payload?.medkits ?? 0);
      this.hud.showNarrative(
        gainedWeapons.length > 0
          ? `You take the ${WEAPONS[gainedWeapons[0]].name}. It feels heavier than help.`
          : "You take what is useful and leave the rest.",
        gainedWeapons.length > 0 ? 3.0 : 2.2
      );
      this.audio.play("cloth_rustle");
      it.mesh.setEnabled(false);
      it.used = true;
    } else if (def.kind === "fuse") {
      this.flickerTimer = 2.4;
      this.dread = Math.min(1, this.dread + 0.18);
      this.audio.play("flicker_buzz");
      this.hud.showNarrative("The lights die in pieces.", 2.5);
      it.used = true;
    } else if (def.kind === "gascan") {
      this.explode(new Vector3(def.x, 0.2, def.z), 4.8, 72);
      it.mesh.setEnabled(false);
      it.used = true;
    } else if (def.kind === "hanging" || def.kind === "mannequin") {
      this.audio.play(def.kind === "hanging" ? "body_drop" : "whisper");
      this.hud.showNarrative(def.kind === "hanging" ? "It swings though the air is still." : "It was never alive. You still aimed at it.", 3);
    }
    this.fireInteractScares(def.id);
  }

  private closeSeal(it: RuntimeInteractable): void {
    if (!this.world || it.used) return;
    const def = it.def;
    it.used = true;
    it.light?.dispose();
    it.light = undefined;
    it.mesh.unfreezeWorldMatrix();
    it.mesh.getChildMeshes().forEach((mesh) => mesh.unfreezeWorldMatrix());
    it.mesh.position.set(def.x, (def.h ?? 2.3) / 2, def.z);
    it.mesh.scaling.x = 1;
    it.mesh.rotation.y = def.rot ?? 0;
    const collider: RectCollider = {
      x: def.x,
      z: def.z,
      w: def.w ?? 2.0,
      d: def.d ?? 0.25,
      label: def.id
    };
    this.world.colliders.push(collider);
    if (this.currentZone.id === "maintenance_escape") {
      const clearance = (collider.d / 2) + this.player.radius + 0.22;
      this.player.position.z = Math.min(this.player.position.z, def.z - clearance);
      this.clampPosition(this.player.position, this.player.radius);
    }
    if (def.grantsFlag) this.flags.add(def.grantsFlag);
    if (def.objective) this.hud.setObjective(def.objective);
    this.dread = Math.min(1, this.dread + 0.10);
    this.flickerTimer = Math.max(this.flickerTimer, 0.55);
    this.cam.shake(0.22, 0.18);
    this.audio.play(def.id === "seal_b" ? "metal_groan" : "door_slam");
    this.hud.showNarrative(def.text ?? "The metal shuts hard enough to hurt your teeth.", 2.2);
    this.fireInteractScares(def.id);
  }

  private fireInteractScares(id: string): void {
    for (const scare of this.currentZone.scares) {
      if (scare.trigger === "interact" && scare.interactId === id) this.fireScare(scare);
    }
  }

  private updateEnemies(dt: number): void {
    this.enemies.update(dt, this.player, {
      onPlayerDamaged: (amount) => {
        if (this.player.takeDamage(amount)) {
          this.audio.play("hurt");
          this.damageFlash = 1;
          this.cam.shake(0.24, 0.25);
          this.dread = Math.min(1, this.dread + 0.18);
        }
      },
      onEnemyKilled: () => {
        this.dread = Math.min(1, this.dread + 0.05);
      },
      onScream: (enemy) => {
        this.audio.play("distant_scream");
        this.dread = Math.min(1, this.dread + 0.28);
        this.enemies.spawn("runner", enemy.x + 1.0, enemy.z + 1.0);
        this.enemies.spawn("runner", enemy.x - 1.1, enemy.z + 0.6);
      },
      clampPosition: (pos, radius) => this.clampPosition(pos, radius)
    });
  }

  private updateScares(): void {
    for (const scare of this.currentZone.scares) {
      if (this.firedScares.has(scare.id)) continue;
      if (scare.trigger === "time" && this.zoneElapsed >= (scare.after ?? 0)) this.fireScare(scare);
      else if (scare.trigger === "approach" && scare.x != null && scare.z != null) {
        const r = scare.radius ?? 2;
        if (distSq2(this.player.position.x, this.player.position.z, scare.x, scare.z) < r * r) this.fireScare(scare);
      } else if (scare.trigger === "lowHp" && this.player.hp / this.player.maxHp < (scare.hpFrac ?? 0.5)) {
        this.fireScare(scare);
      } else if (scare.trigger === "enemyCountBelow" && this.enemies.aliveCount() <= (scare.count ?? 0)) {
        this.fireScare(scare);
      }
    }
  }

  private fireScare(scare: ScareTrigger): void {
    if (this.firedScares.has(scare.id)) return;
    this.firedScares.add(scare.id);
    this.applyScareEvent(scare);
    for (const beat of scare.beats ?? []) {
      this.queuedScareBeats.push({ zoneId: this.currentZone.id, due: this.zoneElapsed + beat.after, beat });
    }
  }

  private updateScareBeats(): void {
    for (let i = this.queuedScareBeats.length - 1; i >= 0; i--) {
      const queued = this.queuedScareBeats[i];
      if (queued.zoneId !== this.currentZone.id) {
        this.queuedScareBeats.splice(i, 1);
        continue;
      }
      if (this.zoneElapsed < queued.due) continue;
      this.applyScareEvent(queued.beat);
      this.queuedScareBeats.splice(i, 1);
    }
  }

  private updateCinematic(dt: number): void {
    if (this.cinematicTimer <= 0) return;
    this.cinematicTimer = Math.max(0, this.cinematicTimer - dt);
    if (this.cinematicTimer === 0) this.cinematicTotal = 0;
  }

  private startCinematic(duration: number, lookAt?: LookAtDef): void {
    const lock = Math.max(0.45, duration);
    this.cinematicTimer = Math.max(this.cinematicTimer, lock);
    this.cinematicTotal = Math.max(this.cinematicTotal, lock);
    if (lookAt) this.cam.lookAtPoint(lookAt.x, lookAt.z);
  }

  private endCinematic(): void {
    this.cinematicTimer = 0;
    this.cinematicTotal = 0;
  }

  private applyScareEvent(event: ScareEvent): void {
    if (event.cinematic || event.lockInput) this.startCinematic(event.lockInput ?? 1.0, event.lookAt);
    else if (event.lookAt) this.cam.lookAtPoint(event.lookAt.x, event.lookAt.z);
    if (event.text) this.hud.showNarrative(event.text, 4.0);
    if (event.objective) this.hud.setObjective(event.objective);
    if (event.flicker) this.flickerTimer = Math.max(this.flickerTimer, event.flicker);
    if (event.blackout) this.blackoutTimer = Math.max(this.blackoutTimer, event.blackout);
    if (event.dread != null) this.dread = Math.max(this.dread, event.dread);
    if (!event.action) {
      if (event.sound) this.audio.play(event.sound);
      return;
    }
    switch (event.action) {
      case "flicker":
        this.flickerTimer = Math.max(this.flickerTimer, event.flicker ?? 2.2);
        this.audio.play(event.sound ?? "flicker_buzz");
        this.dread = Math.min(1, this.dread + 0.16);
        break;
      case "whisper":
        this.audio.play(event.sound ?? "whisper");
        this.dread = Math.min(1, this.dread + 0.09);
        break;
      case "bodyDrop":
        this.audio.play(event.sound ?? "body_drop");
        this.cam.shake(0.28, 0.24);
        this.damageFlash = Math.max(this.damageFlash, 0.45);
        break;
      case "distantScream":
        this.audio.play(event.sound ?? "distant_scream");
        this.dread = Math.min(1, this.dread + 0.18);
        break;
      case "lightsOut":
        this.flickerTimer = Math.max(this.flickerTimer, event.flicker ?? 4.0);
        this.blackoutTimer = Math.max(this.blackoutTimer, event.blackout ?? 1.4);
        this.audio.play(event.sound ?? "light_pop");
        this.dread = Math.min(1, this.dread + 0.22);
        break;
      case "spawnRunner":
        this.spawnScareEnemies(event.spawns, [
          { kind: "runner", x: this.player.position.x + 3.0, z: this.player.position.z + 3.5 }
        ]);
        this.enemies.wakeDormantNear(this.player.position.x, this.player.position.z, 18);
        this.audio.play(event.sound ?? "wall_scrape");
        break;
      case "startChase":
        this.chaseActive = true;
        this.spawnScareEnemies(event.spawns, [
          { kind: "brute", x: this.player.position.x + 8.8, z: this.player.position.z + 0.8 },
          { kind: "runner", x: this.player.position.x + 6.5, z: this.player.position.z - 1.8 }
        ]);
        this.audio.play(event.sound ?? "chain_drag");
        this.dread = 0.88;
        break;
      case "gasLeak":
        this.audio.play(event.sound ?? "flicker_buzz");
        window.setTimeout(() => {
          const pos = new Vector3(event.x ?? this.player.position.x, 0.2, event.z ?? this.player.position.z);
          this.explode(pos, 3.5, 35);
        }, 850);
        break;
      case "patientStalk":
        this.dread = 0.76;
        this.spawnScareEnemies(event.spawns, [{ kind: "patient_zero", x: 0, z: -7.6 }]);
        this.enemies.wakeDormantNear(this.player.position.x, this.player.position.z, 28);
        this.audio.play(event.sound ?? "shrine_hum");
        this.cam.shake(0.22, 0.28);
        break;
      case "openGate":
        this.flags.add("gate_open");
        this.hud.setObjective(event.objective ?? "The gate is open. Stop fighting and run.");
        this.audio.play(event.sound ?? "flicker_buzz");
        break;
    }
  }

  private spawnScareEnemies(spawns: EnemySpawnDef[] | undefined, fallback: EnemySpawnDef[]): void {
    for (const spawn of spawns ?? fallback) {
      const enemy = this.enemies.spawn(spawn.kind, spawn.x, spawn.z, !!spawn.dormant);
      this.clampPosition(enemy.root.position, enemy.radius);
    }
  }

  private updateWorldLights(dt: number): void {
    this.damageFlash = Math.max(0, this.damageFlash - dt * 2.6);
    this.flickerTimer = Math.max(0, this.flickerTimer - dt);
    this.blackoutTimer = Math.max(0, this.blackoutTimer - dt);
    const fixtureLight =
      this.blackoutTimer > 0
        ? 0.02
        : this.flickerTimer > 0
          ? 0.18 + 0.82 * Math.max(0, Math.sin(performance.now() * 0.055))
          : 1;
    this.setFixtureLightLevel(fixtureLight);
    const eye = this.cam.camera.position;
    this.bundle.playerLight.position.set(this.player.position.x, 1.2, this.player.position.z);
    this.bundle.playerLight.range = 7.5;
    this.bundle.playerLight.intensity = 0.72;
    this.bundle.flashlight.position.set(eye.x, eye.y - 0.12, eye.z);
    const dir = this.cam.camera.getForwardRay().direction.clone();
    dir.normalize();
    this.bundle.flashlight.direction = dir;
    this.bundle.flashlight.range = 18;
    this.bundle.flashlight.intensity = 2.75;
    this.bundle.ambient.intensity = 0.045 + fixtureLight * 0.055;
  }

  private setFixtureLightLevel(level: number): void {
    if (!this.world) return;
    for (const it of this.world.interactables) {
      if (!it.light) continue;
      const metadata = (it.light.metadata ?? {}) as { baseIntensity?: number };
      const base = metadata.baseIntensity ?? it.light.intensity;
      it.light.metadata = { ...metadata, baseIntensity: base };
      it.light.intensity = base * level;
    }
  }

  private clearTransientEffects(): void {
    for (const effect of this.effects) {
      effect.light?.dispose();
      effect.mesh.dispose();
    }
    this.effects.length = 0;
    for (const bomb of this.bombs) {
      bomb.light.dispose();
      bomb.mesh.dispose();
    }
    this.bombs.length = 0;
  }

  private updateEffects(dt: number): void {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const fx = this.effects[i];
      fx.ttl -= dt;
      if (fx.light) {
        fx.light.intensity = Math.max(0, fx.light.intensity - dt * 0.10);
      }
      const mat = fx.mesh.material as StandardMaterial | null;
      if (mat) mat.alpha = Math.max(0, Math.min(mat.alpha, fx.ttl * 5));
      if (fx.ttl <= 0) {
        fx.light?.dispose();
        fx.mesh.dispose();
        this.effects.splice(i, 1);
      }
    }
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.timer -= dt;
      b.light.intensity = 0.3 + Math.max(0, Math.sin(performance.now() * 0.02)) * 1.0;
      if (b.timer <= 0) {
        b.mesh.dispose();
        b.light.dispose();
        this.explode(b.pos, b.radius, b.damage);
        this.bombs.splice(i, 1);
      }
    }
  }

  private updateDread(dt: number): void {
    const hpFear = (1 - this.player.hp / this.player.maxHp) * 0.72;
    let nearestFear = 0;
    for (const enemy of this.enemies.enemies) {
      const d2 = distSq2(enemy.x, enemy.z, this.player.position.x, this.player.position.z);
      nearestFear = Math.max(nearestFear, clamp(1 - Math.sqrt(d2) / 9, 0, 1) * 0.64);
    }
    const target = clamp(0.18 + hpFear + nearestFear + (this.chaseActive ? 0.22 : 0), 0, 1);
    this.dread += (target - this.dread) * Math.min(1, dt * 1.35);
    if (this.currentZone.isEnding) this.dread += (0.08 - this.dread) * Math.min(1, dt * 0.7);
  }

  private moveActor(pos: Vector3, delta: Vector3, radius: number): void {
    if (!this.world) return;
    moveCircleWithColliders(pos, delta, radius, this.world.zone, this.world.colliders);
  }

  private clampPosition(pos: Vector3, radius: number): void {
    if (!this.world) return;
    resolveCircleColliders(pos, radius, this.world.zone, this.world.colliders);
  }
}
