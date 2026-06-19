import type { Level } from "../world/Level";
import type { BuiltWorld } from "../world/Builder";
import type { Player } from "./Player";
import type { Stalker } from "./Stalker";
import type { Hud } from "../ui/Hud";
import type { AudioFX } from "../core/AudioFX";
import { ZONES, ITEMS, CELL } from "../world/data";

export type InteractTarget =
  | { type: "item"; id: string }
  | { type: "door"; id: string };

const DEAD_TEXT =
  "It folds you into the dark without hurry, the way a hand closes around a moth. " +
  "Somewhere above, the surface feed keeps looping: survivors below — three hundred and twelve. " +
  "The number does not change.";

const WIN_TEXT =
  "You climb until the air stops tasting like metal. Behind you, the repeater is broadcasting " +
  "again, clear and calm: 'Survivors below — three hundred and eleven.' " +
  "You do not go back to ask who it subtracted.";

interface DelayedBeat {
  t: number;
  fn: () => void;
}

export class Director {
  fuses = 0;
  power = false;
  /** true once the signal is restored at the core — gates the escape */
  broadcast = false;
  chase = false;
  over = false;
  /** true from the instant of death until the death screen (drives the kill-cam) */
  dying = false;

  private visited = new Set<string>();
  private flags = new Set<string>();
  private beats: DelayedBeat[] = [];
  private scareT = 32;

  onDeath: ((text: string) => void) | null = null;
  onWin: ((text: string) => void) | null = null;

  constructor(
    private level: Level,
    private world: BuiltWorld,
    private player: Player,
    private stalker: Stalker,
    private hud: Hud,
    private fx: AudioFX
  ) {
    stalker.onKill = () => this.kill();
    hud.setObjective("Find the two missing breaker fuses  (0 / 2)");
    // Act I — arrival: you came down, and the only way back up needs power
    this.after(1.0, () => this.hud.subtitle("Lower concourse. The air tastes like old pennies.", 5));
    this.after(6.0, () => this.hud.subtitle("You came down the access shaft an hour ago. The lift won't lift and the hatch won't open until the grid is live.", 6.5));
    this.after(13.5, () => {
      this.fx.radioVoice(4);
      this.hud.subtitle("Overhead, the surface feed loops on a dead channel: '— survivors below: three hundred and twelve —'.", 6);
    });
  }

  private after(t: number, fn: () => void): void {
    this.beats.push({ t, fn });
  }

  private once(flag: string): boolean {
    if (this.flags.has(flag)) return false;
    this.flags.add(flag);
    return true;
  }

  update(dt: number): void {
    if (this.over) return;
    // delayed beats
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

    // battery warnings
    if (this.player.battery < 0.18 && this.player.lightOn && this.once("lowbat")) {
      this.hud.subtitle("The torch is dying.");
    }
    if (this.player.battery <= 0 && this.once("nobat")) {
      this.hud.subtitle("The torch gives out.");
    }

    // ambient dread: irregular, never while it is already close
    if (!this.chase) {
      this.scareT -= dt;
      if (this.scareT <= 0) {
        const d = Math.hypot(this.stalker.x - this.player.x, this.stalker.z - this.player.z);
        if (d < 13) {
          this.scareT = 9; // it IS the scare right now
        } else {
          this.scareT = 40 + Math.random() * 35;
          this.ambientScare();
        }
      }
    }
  }

  private ambientScare(): void {
    const [fwx, fwz] = this.player.forward();
    const roll = Math.floor(Math.random() * 4);
    switch (roll) {
      case 0: // a door slams somewhere behind you
        this.fx.slam(this.player.x - fwx * 14 + (Math.random() - 0.5) * 8, this.player.z - fwz * 14 + (Math.random() - 0.5) * 8, false);
        break;
      case 1:
        this.fx.groanDistant();
        break;
      case 2: // breath at your back
        this.fx.whisper(this.player.x - fwx * 3.5, this.player.z - fwz * 3.5);
        break;
      case 3: { // the nearest lights give up for a moment
        let n = 0;
        for (const lh of this.world.lights.values()) {
          if (!lh.on || lh.base <= 0 || n >= 2) continue;
          const dx = lh.light.position.x - this.player.x;
          const dz = lh.light.position.z - this.player.z;
          if (dx * dx + dz * dz < 360) {
            lh.dipT = 0.5 + Math.random() * 0.7;
            this.fx.pop(lh.light.position.x, lh.light.position.z);
            n++;
          }
        }
        if (n === 0) this.fx.groanDistant();
        break;
      }
    }
  }

  private enterZone(id: string): void {
    switch (id) {
      case "concourse":
        this.fx.groanDistant();
        this.hud.subtitle("Far off, something drags across the tiles. Then it stops.");
        break;
      case "office":
        this.hud.subtitle("The maintenance office. Third shift never clocked out.");
        break;
      case "platform":
        this.after(0.8, () => {
          this.fx.whisper(this.stalker.x, this.stalker.z);
          this.hud.subtitle("At the far end of the platform, something that was sitting very still stands up.", 5.5);
          // walk away from wherever the player came in
          const [, pcy] = this.level.worldToCell(this.player.x, this.player.z);
          this.stalker.activate(pcy <= 21 ? [41, 29] : [38, 15]);
        });
        break;
      case "genRoom":
        this.hud.subtitle("The breaker rack. Two empty slots, pulled clean. Nothing blew them.");
        break;
      case "northCorr":
        if (!this.power) this.hud.subtitle("Fire doors on magnetic holds, all wedged open. Someone wanted a clear run.");
        break;
      case "shaft":
        if (!this.broadcast) this.hud.subtitle("The surface hatch. Its lock is electric — dead grid, dead bolt.");
        break;
      case "subHall":
        this.fx.whisper(this.player.x, this.player.z - 2);
        this.hud.subtitle("Sub-level 2. The intake hall. Photographs cover the wall floor to ceiling — every face ever sent down here to fix something.", 6.5);
        this.after(5, () => this.hud.subtitle("Beneath the last row, scratched deep into the plaster: THE COUNT STAYS AT 312 BECAUSE NOBODY LEAVES.", 6));
        break;
      case "core":
        this.hud.subtitle("The repeater core. The operator's chair still faces the dead mic. The signal was never coming from the surface — it comes from down here.", 7);
        break;
    }
  }

  /** prompt text for a target, or null if not interactable right now */
  promptFor(target: InteractTarget): string | null {
    if (target.type === "door") {
      const door = this.level.door(target.id);
      if (door.broken) return null;
      if (door.locked && !this.power) return "locked — no power";
      if (door.openT > 0.5) return door.def.kind === "fire" ? "slam the fire door" : "close the door";
      return "open the door";
    }
    const item = ITEMS.find((i) => i.id === target.id)!;
    const h = this.world.items.get(target.id)!;
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
    if (target.type === "door") {
      this.toggleDoor(target.id);
      return;
    }
    const def = ITEMS.find((i) => i.id === target.id)!;
    const h = this.world.items.get(target.id)!;
    switch (def.kind) {
      case "note":
        this.hud.openNote(def.noteTitle ?? def.label, def.noteBody ?? "");
        this.fx.pickup();
        break;
      case "battery":
        h.taken = true;
        h.obj.visible = false;
        this.player.addBattery(0.4);
        this.fx.pickup();
        break;
      case "bottles":
        h.taken = true;
        h.obj.visible = false;
        this.player.bottles += 2;
        this.fx.pickup();
        if (this.once("gotbottles")) {
          this.hud.subtitle("Glass. A sound can stand where you are not.");
        }
        break;
      case "fuse":
        h.taken = true;
        h.obj.visible = false;
        this.fuses++;
        this.fx.fuseClunk();
        this.hud.setObjective(
          this.fuses >= 2 ? "Refit the fuses at the breaker rack in the generator room" : `Find the two missing breaker fuses  (${this.fuses} / 2)`
        );
        if (def.id === "fuse_a") this.fuseAScare();
        if (def.id === "fuse_b") this.fuseBScare();
        break;
      case "panel":
        if (this.power) break;
        if (this.fuses < 2) {
          this.hud.subtitle(this.fuses === 0 ? "The rack is missing two fuses." : "One slot is still empty.");
          this.fx.uiClick();
        } else {
          this.powerOn();
        }
        break;
      case "console":
        if (this.broadcast) break;
        if (!this.power) {
          this.hud.subtitle("The core is dark. The grid has to come up first.");
          this.fx.uiClick();
        } else {
          this.restoreBroadcast();
        }
        break;
      case "hatch":
        if (!this.broadcast) {
          this.hud.subtitle(this.power ? "The hatch won't release until the signal is live again." : "The hatch bolt is magnetic. No power, no release.");
          this.fx.uiClick();
        } else {
          this.win();
        }
        break;
    }
  }

  private toggleDoor(id: string): void {
    const door = this.level.door(id);
    if (door.broken) return;
    if (door.locked && !this.power) {
      this.hud.subtitle(door.def.lockedText ?? "Locked.");
      this.fx.uiClick();
      return;
    }
    door.locked = false;
    const [x, z] = this.level.cellCenter(door.cx, door.cy);
    if (door.targetOpen) {
      door.targetOpen = false;
      const big = door.def.kind === "fire";
      this.fx.slam(x, z, big);
      this.level.addNoise(x, z, big ? 12 : 6);
      if (big && this.chase && this.once("firstslam")) {
        this.hud.subtitle("The door takes its weight a second later. The frame holds. For now.");
      }
    } else {
      door.targetOpen = true;
      this.fx.creak(x, z);
      this.level.addNoise(x, z, 5);
    }
  }

  private fuseAScare(): void {
    const office = this.world.lights.get("l_office")!;
    office.on = false;
    this.fx.stinger();
    this.hud.subtitle("The office light dies the moment the fuse comes free.", 5);
    this.stalker.activate();
    this.stalker.alert = Math.max(this.stalker.alert, 1);
    this.after(6, () => {
      if (this.once("post_fuse_a")) this.fx.groanDistant();
    });
  }

  private fuseBScare(): void {
    this.hud.subtitle("The rails hum once, like a struck wire. Somewhere in the dark, it stops moving.", 5);
    this.stalker.activate();
    this.stalker.alert = 2;
    // every light in the station dips while it listens
    for (const lh of this.world.lights.values()) {
      if (lh.on && lh.base > 0) lh.dipT = 1.3 + Math.random() * 0.8;
    }
    this.fx.groanDistant();
    // it knows where you are
    this.level.addNoise(this.player.x, this.player.z, 40);
  }

  // Act II -> III: the grid comes up, but the broadcast feed is dead. The core
  // is below — power unlocks the service stair instead of the escape route.
  private powerOn(): void {
    this.power = true;
    this.fx.fuseClunk();
    this.after(0.4, () => this.fx.fuseClunk());
    this.after(0.9, () => {
      this.fx.powerOn();
      this.world.panelLed.emissive.setHex(0x22ff44);
      const gen = this.world.lights.get("l_gen")!;
      gen.light.color.setHex(0xffd28a);
      gen.mat.emissive.setHex(0xffd28a);
      // the sealed service stair releases now there's grid power
      this.level.door("d_service").locked = false;
      this.hud.setObjective("The broadcast is dead. Restore the signal at the repeater core — service stair below the stairwell.");
    });
    this.after(2.0, () => {
      this.hud.subtitle("Power floods back — then the speakers cough static and go quiet. The feed isn't coming from up here. It never was.", 6.5);
    });
    this.after(3.0, () => {
      // it stops pretending to be far away
      this.fx.groanDistant();
      this.stalker.activate();
      this.stalker.alert = 2;
    });
  }

  // Act III -> IV: restore the signal at the core. The thing comes, and the
  // way out finally unlocks — now you run all the way back up.
  private restoreBroadcast(): void {
    if (this.broadcast) return;
    this.broadcast = true;
    this.fx.fuseClunk();
    this.world.coreScreen.emissive.setHex(0x22ff44);
    this.after(0.6, () => {
      this.fx.powerOn();
      // emergency circuit lights the way out: corridor red, station browns out
      for (const id of ["l_corr_a", "l_corr_b", "l_corr_c", "l_corr_d"]) {
        const lh = this.world.lights.get(id)!;
        lh.on = true;
        lh.base = 8;
        lh.pulse = true;
      }
      const conc = this.world.lights.get("l_conc_a")!;
      conc.base = 4;
      this.level.door("d_north").locked = false;
      this.hud.setObjective("GET OUT — back up to the surface hatch. Slam the doors behind you.");
    });
    this.after(1.6, () => {
      this.fx.radioVoice(7);
      this.hud.subtitle("Every speaker at once: '— survivors below: three hundred and twelve —'. The dark answers it.", 6);
    });
    this.after(2.8, () => {
      // it cuts off the way back, hard
      const [sx, sz] = this.level.cellCenter(12, 38);
      this.stalker.setPos(sx, sz);
      this.stalker.startFinalChase();
      this.chase = true;
      this.hud.chase(true);
      this.player.stamina = 1;
      this.player.exhausted = false;
      this.fx.bash(sx, sz);
    });
  }

  private kill(): void {
    if (this.over) return;
    this.over = true;
    this.dying = true;
    this.player.frozen = true;
    this.hud.closeNote(); // never leave a note open under the kill-cam
    this.fx.killScream();
    this.hud.damageFlash(1);
    this.hud.chase(false);
    // a beat of forced eye contact before it goes dark
    setTimeout(() => this.hud.blackout(1, 0.3), 650);
    setTimeout(() => this.onDeath?.(DEAD_TEXT), 2100);
  }

  private win(): void {
    if (this.over) return;
    this.over = true;
    this.player.frozen = true;
    this.hud.closeNote();
    this.chase = false;
    this.hud.chase(false);
    this.fx.slam(this.player.x, this.player.z, true);
    this.hud.blackout(1, 1.8);
    setTimeout(() => this.fx.radioVoice(5), 1200);
    setTimeout(() => this.onWin?.(WIN_TEXT), 2600);
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

  cellWorld(cx: number, cy: number): [number, number] {
    return [cx * CELL + CELL / 2, cy * CELL + CELL / 2];
  }
}
