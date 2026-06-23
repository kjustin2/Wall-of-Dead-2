import * as THREE from "three";
import type { Level } from "../world/Level";
import type { BuiltWorld } from "../world/Builder";
import type { Player } from "./Player";
import type { Stalker } from "./Stalker";
import type { Hud } from "../ui/Hud";
import type { AudioFX } from "../core/AudioFX";
import type { Cutscene } from "./Cinematic";
import type { SaveData } from "../core/Save";
import { ZONES, ITEMS, NAV, CELL, STALKER_START } from "../world/data";

export type InteractTarget =
  | { type: "item"; id: string }
  | { type: "door"; id: string };

/** main.ts injects this so the Director can run a cutscene without owning the
 *  game-state machine (camera handoff, pointer lock, wayfinder all live there). */
export type PlayCut = (cut: Cutscene, onDone?: () => void) => void;

const DEAD_TEXT =
  "It folds you into the dark without hurry, the way a hand closes around a moth. " +
  "Above, the surface feed keeps looping: survivors below — three hundred and twelve. " +
  "The number does not change. It never had to.";

const WIN_TEXT =
  "You come up into grey surface light and the hatch clamps shut behind you. Below, the " +
  "repeater is broadcasting again, clear and calm: 'Survivors below — three hundred and thirteen.' " +
  "You got out. The count did not. You do not ask who it just added.";

interface DelayedBeat { t: number; fn: () => void }

export class Director {
  fuses = 0;
  power = false;
  /** true once the signal is restored at the core — gates the escape */
  broadcast = false;
  chase = false;
  over = false;
  /** true from the instant of death until the death screen (drives the kill-cam) */
  dying = false;

  /** read by main each frame to drive the wayfinder HUD + the diegetic beacon */
  objectiveTarget: THREE.Vector3 | null = null;
  objectiveLabel = "";

  private visited = new Set<string>();
  private flags = new Set<string>();
  private beats: DelayedBeat[] = [];
  private scareT = 40;
  /** the first monster sighting is held back until the Act-I build-up has played
   *  (armed by finishing the build-up, or by collecting a fuse) */
  private sightingArmed = false;

  onDeath: ((text: string) => void) | null = null;
  onWin: ((text: string) => void) | null = null;
  /** main persists the checkpoint (and toasts it) */
  onCheckpoint: ((d: SaveData) => void) | null = null;
  /** main jolts the camera for scripted scares (build-up startles + jumpscares) */
  onScare: ((amount: number) => void) | null = null;

  constructor(
    private level: Level,
    private world: BuiltWorld,
    private player: Player,
    private stalker: Stalker,
    private hud: Hud,
    private fx: AudioFX,
    private playCut: PlayCut
  ) {
    stalker.onKill = () => this.kill();
    // it loses your trail and backs off — let the player feel the reprieve
    stalker.onLostPlayer = () => {
      if (this.over || this.chase) return;
      this.fx.groanDistant();
      this.hud.subtitle("The dragging fades, moving away. You've lost it — for now.", 4);
    };
  }

  // ---------- small helpers ----------
  private after(t: number, fn: () => void): void {
    this.beats.push({ t, fn });
  }
  private once(flag: string): boolean {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    return true;
  }
  cellWorld(cx: number, cy: number): [number, number] {
    return [cx * CELL + CELL / 2, cy * CELL + CELL / 2];
  }
  private vec(cx: number, cy: number, y = 1.4): THREE.Vector3 {
    const [x, z] = this.cellWorld(cx, cy);
    return new THREE.Vector3(x, y, z);
  }
  private item(id: string) {
    return this.world.items.get(id)!;
  }

  // ---------- save / restore ----------
  /** auto-save a checkpoint at the current spot */
  private checkpoint(beat: string): void {
    const [cx, cy] = this.level.worldToCell(this.player.x, this.player.z);
    this.onCheckpoint?.({
      v: 1,
      beat,
      fuses: this.fuses,
      fuseA: this.item("fuse_a").taken,
      fuseB: this.item("fuse_b").taken,
      power: this.power,
      battery: this.player.battery,
      bottles: this.player.bottles,
      seen: [...this.flags].filter((f) => f.startsWith("cs_")),
      spawn: [cx, cy, this.player.yaw]
    });
  }

  /**
   * Restore a checkpoint. Works both on a freshly-built world (title CONTINUE)
   * and in-place after death (one-click retry): every act/world/creature flag is
   * reset to the checkpoint, so it never leaves stale state behind.
   */
  restore(d: SaveData): void {
    // act flags back to the checkpoint
    this.over = false;
    this.dying = false;
    this.chase = false;
    this.broadcast = false;
    this.power = d.power;
    this.fuses = d.fuses;
    this.beats = [];
    this.scareT = 40;
    this.visited = new Set();
    this.flags = new Set(d.seen);
    this.sightingArmed = true; // past the intro build-up; allow the sighting if unseen

    // items: fuses match the checkpoint (consumables keep whatever was taken)
    this.item("fuse_a").taken = d.fuseA;
    this.item("fuse_a").obj.visible = !d.fuseA;
    this.item("fuse_b").taken = d.fuseB;
    this.item("fuse_b").obj.visible = !d.fuseB;

    // world visual state: clear anything the broadcast / chase had switched on
    this.world.coreScreen.emissive.setHex(0x882017);
    for (const id of ["l_em_lobby", "l_em_conc", "l_em_stair", "l_em_intake"]) {
      const lh = this.world.lights.get(id);
      if (lh) { lh.on = false; lh.base = 0; lh.pulse = false; }
    }
    for (const door of this.level.doors) door.broken = false;
    if (d.power) this.applyPowerState();
    else { this.world.panelLed.emissive.setHex(0xff2010); }
    this.level.door("d_stair").locked = !d.power;

    // player
    this.player.battery = d.battery;
    this.player.bottles = d.bottles;
    this.player.frozen = false;
    const [cx, cy, yaw] = d.spawn;
    const [x, z] = this.level.cellCenter(cx, cy);
    this.player.x = x;
    this.player.z = z;
    this.player.yaw = yaw;
    this.player.pitch = 0;

    // the creature resets to its dormant post, giving the player a breath
    this.stalker.endReveal();
    const [sx, sz] = this.level.cellCenter(STALKER_START.cx, STALKER_START.cy);
    this.stalker.setPos(sx, sz);
    this.stalker.state = "dormant";
    this.stalker.finalChase = false;
    this.stalker.suspicion = 0;
    this.stalker.alert = d.power || d.fuseB ? 2 : d.fuseA ? 1 : 0;

    this.refreshObjective(true);
  }

  /** world mutations that come up with main power (shared by cutscene + restore) */
  private applyPowerState(): void {
    this.world.panelLed.emissive.setHex(0x22ff44);
    const gen = this.world.lights.get("l_gen");
    if (gen) { gen.on = true; gen.base = 9; gen.light.color.setHex(0xffd28a); gen.mat.emissive.setHex(0xffd28a); }
    this.level.door("d_stair").locked = false;
  }

  // ---------- Act I: the descent ----------
  /** called by main once the world is ready: plays the intro cutscene */
  begin(): void {
    const [sx, , sz] = [this.player.x, 0, this.player.z];
    const eye = this.player.eyeY;
    // open framed on the dark station mouth, settle to eye level looking south
    const cut: Cutscene = {
      duration: 9.5,
      letterbox: true,
      keys: [
        { t: 0.0, pos: [sx, 2.5, sz - 1.2], look: [sx, 1.2, sz + 8], fov: 56 },
        { t: 3.0, pos: [sx, 1.95, sz - 0.4], look: [sx, 1.4, sz + 10], fov: 60 },
        { t: 6.2, pos: [sx, 1.78, sz + 0.2], look: [sx, 1.45, sz + 12], fov: 62 },
        { t: 9.5, pos: [sx, eye, sz], look: [sx, eye, sz + 14], fov: 66 }
      ],
      events: [
        { t: 0.0, fn: () => { this.hud.blackout(1, 0); this.fx.liftDescend(); } },
        { t: 0.4, fn: () => this.hud.blackout(0, 2.8) },
        { t: 0.6, fn: () => this.hud.caption("Cass — you reading me? Lift's logged you at the sub-level. Nice and easy down there.", "VESNA · CONTROL", 4.2) },
        { t: 1.2, fn: () => this.fx.radioVoice(2.4) },
        { t: 4.6, fn: () => { this.fx.liftClunk(); this.hud.caption("Two fuses back in the rack, restart the broadcast, ride up. Routine. You'll be topside by dawn.", "VESNA · CONTROL", 4.5) } },
        { t: 5.0, fn: () => this.fx.radioVoice(2.6) },
        { t: 8.6, fn: () => this.hud.subtitle("The cage opens onto the lower concourse. The air tastes like old pennies.", 5) }
      ]
    };
    this.refreshObjective(true);
    this.playCut(cut, () => {
      this.fx.groanDistant();
      this.checkpoint("Arrival — lower concourse");
      this.after(8, () => this.hud.caption("Surface feed's still looping the same count down there — 312. Reception's bad. Stay on this channel.", "VESNA · CONTROL", 5));
      // ---- Act I build-up: escalating dread + minor, creatureless jumpscares, so the
      // ---- monster is felt long before it is ever seen. The first sighting stays
      // ---- disarmed until this peaks (or a fuse is collected).
      this.after(14, () => { this.fx.drag(this.player.x + 9, this.player.z - 11); this.hud.subtitle("Something heavy drags across the floor, far off. Then stops.", 4); });
      this.after(22, () => { this.dipNearLights(0.7, 2); this.fx.creak(this.player.x + 4, this.player.z - 6); });
      this.after(30, () => {
        // minor jumpscare: a clang + camera jolt behind you, nothing there
        const [fwx, fwz] = this.player.forward();
        this.fx.slam(this.player.x - fwx * 7, this.player.z - fwz * 7, false);
        this.jumpscare({ shake: 0.4 });
        this.hud.subtitle("Metal clatters down a corridor behind you. When you look — empty.", 3.8);
      });
      this.after(38, () => { this.fx.whisper(this.player.x - 2, this.player.z - 3); this.hud.subtitle("A whisper, close enough to feel on your neck. There is no one there.", 4); });
      this.after(46, () => {
        // the dread peaks and the first sighting is now armed
        this.dipNearLights(0.9, 3); this.fx.groanDistant();
        this.sightingArmed = true;
        this.hud.subtitle("The lights are failing, one by one. Whatever is down here knows you are.", 4.5);
      });
    });
  }

  // ---------- main per-frame update (only while in normal play) ----------
  update(dt: number): void {
    if (this.over) return;

    for (const b of this.beats) b.t -= dt;
    const due = this.beats.filter((b) => b.t <= 0);
    this.beats = this.beats.filter((b) => b.t > 0);
    for (const b of due) b.fn();

    // zone triggers
    const [pcx, pcy] = this.level.worldToCell(this.player.x, this.player.z);
    for (const z of ZONES) {
      if (pcx >= z.x && pcx < z.x + z.w && pcy >= z.y && pcy < z.y + z.h && !this.visited.has(z.id)) {
        this.visited.add(z.id);
        this.enterZone(z.id);
      }
    }

    this.refreshObjective(false);

    // battery warnings
    if (this.player.battery < 0.18 && this.player.lightOn && this.once("lowbat")) this.hud.subtitle("The torch is dying.");
    if (this.player.battery <= 0 && this.once("nobat")) this.hud.subtitle("The torch gives out.");

    // ambient dread (never while it's already close or chasing)
    if (!this.chase) {
      this.scareT -= dt;
      if (this.scareT <= 0) {
        const d = Math.hypot(this.stalker.x - this.player.x, this.stalker.z - this.player.z);
        if (d < 13) this.scareT = 9;
        else { this.scareT = 42 + Math.random() * 34; this.ambientScare(); }
      }
    }
  }

  /** point the wayfinder + beacon at the current goal; update HUD objective text */
  private refreshObjective(force: boolean): void {
    let target: THREE.Vector3 | null = null;
    let label = "";
    let hudText = "";

    if (!this.power) {
      const a = this.item("fuse_a");
      const b = this.item("fuse_b");
      if (!a.taken || !b.taken) {
        // point at the nearer uncollected fuse
        let best: THREE.Vector3 | null = null;
        let bestD = Infinity;
        for (const f of [a, b]) {
          if (f.taken) continue;
          const v = this.vec(f.def.cx, f.def.cy, 0.7);
          const d = Math.hypot(v.x - this.player.x, v.z - this.player.z);
          if (d < bestD) { bestD = d; best = v; }
        }
        target = best;
        label = "BREAKER FUSE";
        hudText = `Restore main power — find the two breaker fuses  (${this.fuses} / 2)`;
      } else {
        target = this.vec(NAV.rack[0], NAV.rack[1], 1.4);
        label = "BREAKER RACK";
        hudText = "Refit the fuses at the breaker rack — generator hall";
      }
    } else if (!this.broadcast) {
      const [, pcy] = this.level.worldToCell(this.player.x, this.player.z);
      if (pcy < 33) {
        target = this.vec(NAV.stairDown[0], NAV.stairDown[1], 1.4);
        label = "SERVICE STAIR";
        hudText = "Restore the broadcast at the repeater core — service stair, below";
      } else {
        target = this.vec(NAV.core[0], NAV.core[1], 1.2);
        label = "REPEATER CORE";
        hudText = "Restore the broadcast at the repeater core";
      }
    } else {
      target = this.vec(NAV.hatch[0], NAV.hatch[1], 1.4);
      label = "SURFACE HATCH";
      hudText = "GET OUT — back up to the surface hatch. Slam the doors behind you.";
    }

    this.objectiveTarget = target;
    this.objectiveLabel = label;
    if (force || hudText !== this.flagsLastHud) {
      this.flagsLastHud = hudText;
      this.hud.setObjective(hudText);
    }
  }
  private flagsLastHud = "";

  /** briefly kill the nearest room lights (a flicker/brownout startle) */
  private dipNearLights(maxDip = 0.7, count = 3): number {
    let n = 0;
    for (const lh of this.world.lights.values()) {
      if (!lh.on || lh.base <= 0 || n >= count) continue;
      const dx = lh.light.position.x - this.player.x;
      const dz = lh.light.position.z - this.player.z;
      if (dx * dx + dz * dz < 360) { lh.dipT = 0.4 + Math.random() * maxDip; this.fx.pop(lh.light.position.x, lh.light.position.z); n++; }
    }
    return n;
  }

  /** a sharp sensory spike for a scripted scare: red startle flash + sting + camera jolt */
  private jumpscare(opts: { shake?: number; scream?: boolean; white?: boolean } = {}): void {
    if (opts.white) this.hud.flash(0.6);
    else this.hud.damageFlash(0.55);
    this.onScare?.(opts.shake ?? 0.8);
    if (opts.scream) this.fx.killScream();
    else this.fx.stinger();
  }

  private ambientScare(): void {
    const [fwx, fwz] = this.player.forward();
    switch (Math.floor(Math.random() * 4)) {
      case 0:
        this.fx.slam(this.player.x - fwx * 14 + (Math.random() - 0.5) * 8, this.player.z - fwz * 14 + (Math.random() - 0.5) * 8, false);
        break;
      case 1:
        this.fx.groanDistant();
        break;
      case 2:
        this.fx.whisper(this.player.x - fwx * 3.5, this.player.z - fwz * 3.5);
        break;
      default:
        if (this.dipNearLights(0.7, 2) === 0) this.fx.groanDistant();
    }
  }

  private enterZone(id: string): void {
    switch (id) {
      case "maint":
        this.hud.subtitle("Maintenance. Third shift never clocked out.");
        // fake-out startle: a clang + flicker, nothing there when you turn (build-up)
        this.after(3.6, () => {
          if (this.once("maint_scare")) {
            this.dipNearLights(0.9, 3);
            this.fx.slam(this.player.x - this.player.forward()[0] * 5, this.player.z - this.player.forward()[1] * 5, false);
            this.jumpscare({ shake: 0.45 });
            this.hud.subtitle("Something topples in the dark behind you. You turn — nothing.", 4);
          }
        });
        break;
      case "platform":
        if (!this.flags.has("cs_platform")) {
          if (this.sightingArmed) this.cutscenePlatform();
          else if (this.once("plat_empty")) this.hud.subtitle("Platform 2. Dust on every bench, the dark sitting very still. Nothing here. Not yet.", 5);
        }
        break;
      case "genHall":
        this.hud.subtitle("The breaker rack. Two empty slots, pulled clean. Nothing blew them.");
        break;
      case "serviceStair":
        if (this.power) this.hud.subtitle("The service stair. It goes down further than the plans admit.");
        break;
      case "intake":
        if (!this.flags.has("cs_intake")) this.cutsceneIntake();
        break;
      case "core":
        this.hud.subtitle("The repeater core. The operator's chair still faces the dead mic.");
        if (this.once("cp_core")) this.checkpoint("Repeater core"); // last save before the run
        break;
    }
  }

  // ---------- C2: first sighting on the platform ----------
  private cutscenePlatform(): void {
    this.once("cs_platform");
    // the creature has been hidden in the sub-level until now — bring it up to the
    // platform's far end for the reveal, before we read its head position.
    const [revx, revz] = this.level.cellCenter(47, 25);
    this.stalker.setPos(revx, revz);
    this.stalker.faceToward(this.player.x, this.player.z);
    const px = this.player.x;
    const pz = this.player.z;
    const eye = this.player.eyeY;
    const sHead = new THREE.Vector3(this.stalker.x, 1.65, this.stalker.z);
    // start looking where the player was looking, then pan + push to the far end
    const [fwx, fwz] = this.player.forward();
    const ahead: [number, number, number] = [px + fwx * 10, eye, pz + fwz * 10];
    const cut: Cutscene = {
      duration: 5.2,
      keys: [
        { t: 0.0, pos: [px, eye, pz], look: ahead, fov: 62 },
        { t: 1.6, pos: [px, eye, pz], look: [sHead.x, sHead.y, sHead.z], fov: 52 },
        { t: 3.4, pos: [px, eye + 0.05, pz], look: [sHead.x, sHead.y, sHead.z], fov: 44 },
        { t: 5.2, pos: [px, eye, pz], look: [sHead.x, sHead.y, sHead.z], fov: 46 }
      ],
      events: [
        { t: 1.5, fn: () => { this.stalker.beginReveal(px, pz); this.fx.whisper(this.stalker.x, this.stalker.z); } },
        { t: 1.7, fn: () => { this.fx.stinger(); this.onScare?.(0.35); this.hud.caption("At the far end of the platform, something that was sitting very still stands up.", "", 3.6); } },
        { t: 3.6, fn: () => { for (const lh of this.world.lights.values()) if (lh.on && lh.base > 0) lh.dipT = 0.6 + Math.random() * 0.5; this.fx.groanDistant(); } }
      ]
    };
    this.playCut(cut, () => {
      this.stalker.endReveal();
      this.stalker.activate();
      this.stalker.alert = Math.max(this.stalker.alert, 1);
      this.level.addNoise(px, pz, 6);
      // it locks on the instant control returns — jumpscare punch into the chase
      this.jumpscare({ shake: 0.85, scream: true, white: true });
      this.hud.subtitle("It sees the light. Switch it off — or run.", 4);
    });
  }

  // ---------- C4: the archive ----------
  private cutsceneIntake(): void {
    this.once("cs_intake");
    // dolly along the wall of faces (north wall), settle on the operator's desk / ledger
    const wallZ = 71.5; // just inside the intake hall's north wall
    const cut: Cutscene = {
      duration: 7.4,
      keys: [
        { t: 0.0, pos: [62, 1.7, 78], look: [60, 1.7, wallZ], fov: 50 },
        { t: 3.2, pos: [48, 1.65, 77], look: [46, 1.7, wallZ], fov: 46 },
        { t: 5.2, pos: [40, 1.6, 79], look: [35, 1.4, 81], fov: 42 },
        { t: 7.4, pos: [37, 1.55, 80], look: [35, 1.3, 81], fov: 40 }
      ],
      events: [
        { t: 0.3, fn: () => this.hud.caption("Photographs cover the wall, floor to ceiling. Every face ever sent down to fix something.", "", 4) },
        { t: 0.5, fn: () => this.fx.whisper(50, 73) },
        { t: 3.6, fn: () => this.hud.caption("An intake ledger lies open on the desk. Every line ends the same way, in a different hand: did not return.", "", 4) },
        { t: 5.6, fn: () => { this.fx.stinger(); this.onScare?.(0.45); this.hud.caption("The last entry is already filled in. It's your name.", "", 3); } },
        { t: 6.0, fn: () => { const lh = this.world.lights.get("l_intake_a"); if (lh) lh.dipT = 1.2; } }
      ]
    };
    this.playCut(cut, () => {
      this.checkpoint("Sub-level — the archive");
      this.hud.subtitle("Control briefed you on a routine repair. Nobody mentioned the wall.", 5);
      this.after(3, () => this.hud.caption("...Cass? You're breaking up. Say again your... say again.", "VESNA · CONTROL", 4));
      this.after(3.4, () => this.fx.radioVoice(2.2));
    });
  }

  // ---------- prompts + interaction ----------
  promptFor(target: InteractTarget): string | null {
    if (target.type === "door") {
      const door = this.level.door(target.id);
      if (door.broken) return null;
      if (door.locked && !this.power) return "locked — no power";
      if (door.openT > 0.5) return door.def.kind === "fire" ? "slam the fire door" : "close the door";
      return "open the door";
    }
    const item = ITEMS.find((i) => i.id === target.id)!;
    const h = this.item(target.id);
    if (h.taken) return null;
    switch (item.kind) {
      case "note": return `read — ${item.label}`;
      case "fuse": return "take the breaker fuse";
      case "battery": return "take the battery";
      case "bottles": return "take the bottles";
      case "panel": return this.power ? null : this.fuses >= 2 ? "refit the fuses" : `breaker rack — ${this.fuses} / 2 fuses`;
      case "console": return this.broadcast ? null : this.power ? "restore the broadcast" : "dead — no power";
      case "hatch": return this.broadcast ? "open the hatch — climb out" : this.power ? "sealed — restore the signal first" : "sealed — no power";
    }
  }

  interact(target: InteractTarget): void {
    if (target.type === "door") { this.toggleDoor(target.id); return; }
    const def = ITEMS.find((i) => i.id === target.id)!;
    const h = this.item(target.id);
    switch (def.kind) {
      case "note":
        this.hud.openNote(def.noteTitle ?? def.label, def.noteBody ?? "");
        this.fx.pickup();
        break;
      case "battery":
        h.taken = true; h.obj.visible = false; this.player.addBattery(0.4); this.fx.pickup();
        break;
      case "bottles":
        h.taken = true; h.obj.visible = false; this.player.bottles += 2; this.fx.pickup();
        if (this.once("gotbottles")) this.hud.subtitle("Glass. A sound can stand where you are not.");
        break;
      case "fuse":
        h.taken = true; h.obj.visible = false; this.fuses++; this.fx.fuseClunk();
        if (def.id === "fuse_a") this.fuseAScare();
        if (def.id === "fuse_b") this.fuseBScare();
        break;
      case "panel":
        if (this.power) break;
        if (this.fuses < 2) { this.hud.subtitle(this.fuses === 0 ? "The rack is missing two fuses." : "One slot is still empty."); this.fx.uiClick(); }
        else this.cutscenePowerOn();
        break;
      case "console":
        if (this.broadcast) break;
        if (!this.power) { this.hud.subtitle("The core is dark. The grid has to come up first."); this.fx.uiClick(); }
        else this.cutsceneRearm();
        break;
      case "hatch":
        if (!this.broadcast) { this.hud.subtitle(this.power ? "The hatch won't release until the signal is live again." : "The hatch bolt is magnetic. No power, no release."); this.fx.uiClick(); }
        else this.cutsceneEscape();
        break;
    }
  }

  private toggleDoor(id: string): void {
    const door = this.level.door(id);
    if (door.broken) return;
    if (door.locked && !this.power) { this.hud.subtitle(door.def.lockedText ?? "Locked."); this.fx.uiClick(); return; }
    door.locked = false;
    const [x, z] = this.level.cellCenter(door.cx, door.cy);
    if (door.targetOpen) {
      door.targetOpen = false;
      const big = door.def.kind === "fire";
      this.fx.slam(x, z, big);
      this.level.addNoise(x, z, big ? 12 : 6);
      if (big && this.chase && this.once("firstslam")) this.hud.subtitle("The door takes its weight a second later. The frame holds. For now.");
    } else {
      door.targetOpen = true;
      this.fx.creak(x, z);
      this.level.addNoise(x, z, 5);
    }
  }

  private fuseAScare(): void {
    const m = this.world.lights.get("l_maint");
    if (m) m.on = false;
    this.sightingArmed = true; // a milestone reached — the first sighting can now land
    this.jumpscare({ shake: 0.6 }); // the light dies and the dark snaps shut
    this.hud.subtitle("The maintenance light dies the moment the fuse comes free.", 4.5);
    this.stalker.alert = Math.max(this.stalker.alert, 1);
    if (this.stalker.state !== "dormant") this.stalker.activate();
    this.checkpoint("Breaker fuse — maintenance");
    this.after(5, () => { if (this.once("post_fuse_a")) this.fx.groanDistant(); });
  }

  private fuseBScare(): void {
    this.sightingArmed = true;
    this.hud.subtitle("The rails hum once, like a struck wire. Then nothing.", 4);
    this.stalker.activate();
    this.stalker.alert = 2;
    for (const lh of this.world.lights.values()) if (lh.on && lh.base > 0) lh.dipT = 1.2 + Math.random() * 0.7;
    this.fx.groanDistant();
    this.level.addNoise(this.player.x, this.player.z, 36);
    this.checkpoint("Breaker fuse — platform");
    // safety net: if the player reached fuse B *on the platform* without the entry
    // sighting having fired, reveal the creature now (it's here with them)
    const [pcx, pcy] = this.level.worldToCell(this.player.x, this.player.z);
    if (!this.flags.has("cs_platform") && pcx >= 39 && pcx < 50 && pcy >= 11 && pcy < 27) this.cutscenePlatform();
  }

  // ---------- C3: power on (Act II -> III) ----------
  private cutscenePowerOn(): void {
    this.once("cs_power");
    this.power = true;
    const px = this.player.x;
    const pz = this.player.z;
    const eye = this.player.eyeY;
    const ledX = 46 * CELL + CELL / 2;
    const cut: Cutscene = {
      duration: 5.6,
      keys: [
        { t: 0.0, pos: [px, eye, pz], look: [ledX, 2.0, 9], fov: 58 },
        { t: 1.8, pos: [px, eye + 0.1, pz - 0.6], look: [ledX, 2.0, 9], fov: 50 },
        { t: 3.4, pos: [px, eye, pz], look: [px - 1, 0.3, pz + 2], fov: 60 }, // attention pulled down
        { t: 5.6, pos: [px, eye, pz], look: [px, eye - 0.2, pz + 6], fov: 64 }
      ],
      events: [
        { t: 0.1, fn: () => this.fx.fuseClunk() },
        { t: 0.5, fn: () => this.fx.fuseClunk() },
        { t: 0.9, fn: () => {
          this.fx.powerOn();
          this.hud.flash(0.5);
          this.applyPowerState();
        } },
        { t: 2.2, fn: () => {
          // station-wide brownout — the feed isn't coming from up here
          for (const lh of this.world.lights.values()) if (lh.on && lh.base > 0) lh.dipT = 1.6;
          this.hud.caption("Power floods back — then the speakers cough static and die. The feed isn't coming from up here. It never was.", "", 4.4);
        } },
        { t: 3.2, fn: () => { this.fx.slam(53, 47, true); } },
        { t: 4.0, fn: () => { this.fx.groanDistant(); this.hud.caption("...service stair just unsealed. That shouldn't— Cass, do not go down there. Cass?", "VESNA · CONTROL", 4); } },
        { t: 4.2, fn: () => this.fx.radioVoice(2.4) }
      ]
    };
    this.playCut(cut, () => {
      this.refreshObjective(true);
      this.checkpoint("Main power restored");
      this.stalker.activate();
      this.stalker.alert = 2;
    });
  }

  // ---------- C5: re-arm the broadcast (Act III -> IV) ----------
  private cutsceneRearm(): void {
    this.once("cs_rearm");
    this.broadcast = true;
    const px = this.player.x;
    const pz = this.player.z;
    const eye = this.player.eyeY;
    const scr: [number, number, number] = [px, 1.5, pz - 2]; // the core screen, north of the console
    const cut: Cutscene = {
      duration: 6.0,
      keys: [
        { t: 0.0, pos: [px, eye, pz], look: scr, fov: 58 },
        { t: 2.4, pos: [px, eye, pz - 0.8], look: scr, fov: 40 },
        { t: 3.0, pos: [px + 2.5, 2.4, pz + 2.5], look: [px, 1.2, pz], fov: 70 }, // a glimpse from somewhere it shouldn't be
        { t: 4.2, pos: [px, eye, pz], look: scr, fov: 50 },
        { t: 6.0, pos: [px, eye, pz], look: [px, eye, pz + 6], fov: 64 }
      ],
      events: [
        { t: 0.2, fn: () => { this.fx.fuseClunk(); this.world.coreScreen.emissive.setHex(0x22ff44); } },
        { t: 1.4, fn: () => { this.fx.powerOn(); this.hud.flash(0.7);
          for (const id of ["l_em_lobby", "l_em_conc", "l_em_stair", "l_em_intake"]) { const lh = this.world.lights.get(id); if (lh) { lh.on = true; lh.base = 7; lh.pulse = true; } }
        } },
        { t: 1.8, fn: () => { this.fx.radioVoice(7); this.hud.caption("Every speaker at once: '— survivors below: three hundred and twelve —'. The dark answers it.", "", 4); } },
        { t: 2.9, fn: () => { this.fx.stinger(); this.hud.flash(0.4); } }
      ]
    };
    this.playCut(cut, () => {
      this.refreshObjective(true);
      // it cuts off the way back, hard — drop it at the top of the service stair
      const [sx, sz] = this.level.cellCenter(26, 30);
      this.stalker.setPos(sx, sz);
      this.stalker.endReveal();
      this.stalker.startFinalChase();
      this.chase = true;
      this.hud.chase(true);
      this.player.stamina = 1;
      this.player.exhausted = false;
      this.fx.bash(sx, sz);
      this.jumpscare({ shake: 0.9, scream: true, white: true }); // the chase explodes to life
      this.hud.subtitle("It stops pretending to be far away. RUN.", 4);
    });
  }

  // ---------- C6: escape ----------
  private cutsceneEscape(): void {
    if (this.over) return;
    this.over = true;
    this.player.frozen = true;
    this.hud.closeNote();
    this.chase = false;
    this.hud.chase(false);
    const px = this.player.x;
    const pz = this.player.z;
    const eye = this.player.eyeY;
    const cut: Cutscene = {
      duration: 8.4,
      skippable: false,
      keys: [
        { t: 0.0, pos: [px, eye, pz], look: [px, 2.6, pz - 2], fov: 60 },
        { t: 2.6, pos: [px, 2.8, pz - 0.4], look: [px, 3.0, pz - 3], fov: 64 },
        { t: 4.4, pos: [px, 3.2, pz - 0.4], look: [px, 3.4, pz - 4], fov: 68 },
        // hold on grey surface light, then a slow turn back down toward the shaft
        { t: 6.2, pos: [px, 3.3, pz - 0.2], look: [px, 2.2, pz + 1.5], fov: 56 },
        { t: 8.4, pos: [px, 3.3, pz - 0.2], look: [px, 1.4, pz + 3], fov: 48 }
      ],
      events: [
        { t: 0.2, fn: () => { this.fx.slam(px, pz, true); this.fx.liftDescend(); } },
        { t: 1.4, fn: () => this.hud.flash(0.5) },
        { t: 1.8, fn: () => { this.hud.blackout(1, 2.4); } },
        { t: 2.2, fn: () => { this.fx.radioVoice(5); this.hud.caption("There you are. Topside by dawn, just like I said. Welcome back, Cass.", "VESNA · CONTROL", 3); } },
        // the big reveal: you got out, but the broadcast is already working again —
        // the count climbed, which means it has already taken your replacement.
        { t: 4.6, fn: () => { this.hud.blackout(0, 2.2); this.fx.groanDistant(); } },
        { t: 5.4, fn: () => { this.fx.radioVoice(4); this.hud.caption("Far below, the repeater answers — clear and calm.", "", 3); } },
        { t: 6.6, fn: () => { this.fx.stinger(); this.onScare?.(0.3); this.hud.caption("SURVIVORS BELOW — THREE HUNDRED AND THIRTEEN.", "", 3.4); } },
        { t: 7.8, fn: () => { this.hud.caption("The number went up. You do not ask who it just added.", "", 3); } }
      ]
    };
    this.playCut(cut, () => this.onWin?.(WIN_TEXT));
  }

  // ---------- debug / automated-test hooks ----------
  /** allow the first sighting to fire (normally gated behind the Act-I build-up) */
  armSighting(): void {
    this.sightingArmed = true;
  }
  /** restore main power without the cutscene (generator lit, stair unlocked) */
  debugPower(): void {
    this.power = true;
    this.applyPowerState();
    this.refreshObjective(true);
  }
  /** jump straight into the live final-chase state (broadcast armed, alarm lights) */
  debugArmChase(): void {
    this.power = true;
    this.broadcast = true;
    this.applyPowerState();
    this.world.coreScreen.emissive.setHex(0x22ff44);
    for (const id of ["l_em_lobby", "l_em_conc", "l_em_stair", "l_em_intake"]) {
      const lh = this.world.lights.get(id);
      if (lh) { lh.on = true; lh.base = 7; lh.pulse = true; }
    }
    this.chase = true;
    this.hud.chase(true);
    this.stalker.startFinalChase();
    this.refreshObjective(true);
  }
  /** play the ending reveal cutscene (the 313 count) */
  debugEscape(): void {
    this.cutsceneEscape();
  }

  private kill(): void {
    if (this.over) return;
    this.over = true;
    this.dying = true;
    this.player.frozen = true;
    this.hud.closeNote();
    this.hud.letterbox(true);
    this.fx.killScream();
    this.hud.damageFlash(1);
    this.hud.chase(false);
    setTimeout(() => this.hud.blackout(1, 0.3), 650);
    setTimeout(() => { this.hud.letterbox(false); this.onDeath?.(DEAD_TEXT); }, 2100);
  }

  /** player position lit by any active room light? */
  playerLit(): boolean {
    for (const lh of this.world.lights.values()) {
      if (!lh.on || lh.base <= 0) continue;
      const dx = lh.light.position.x - this.player.x;
      const dz = lh.light.position.z - this.player.z;
      if (dx * dx + dz * dz < 30) return true;
    }
    return false;
  }
}
