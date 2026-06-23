import * as THREE from "three";
import type { Hud } from "../ui/Hud";

/**
 * In-engine cinematic system: a data-driven rail camera with letterbox bars and
 * timed events (dialogue, audio cues, world mutations). The main loop ticks this
 * while the game is in its "cinematic" state, reads {@link pos}/{@link look}/
 * {@link fov} each frame, and hands control back via the play() callback.
 *
 * A cutscene is authored as a list of camera keyframes (interpolated with
 * smoothstep) plus a list of {t, fn} events. Cutscenes are short and skippable.
 */
export interface CamKey {
  t: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov?: number;
}

export interface CineEvent {
  t: number;
  fn: () => void;
}

export interface Cutscene {
  duration: number;
  keys: CamKey[];
  events?: CineEvent[];
  /** show letterbox bars (default true) */
  letterbox?: boolean;
  /** allow the player to skip (default true) */
  skippable?: boolean;
}

const smooth = (a: number, b: number, t: number): number => {
  const k = Math.max(0, Math.min(1, t));
  return a + (b - a) * (k * k * (3 - 2 * k));
};

export class Cinematic {
  active = false;
  skippable = true;

  pos = new THREE.Vector3();
  look = new THREE.Vector3(0, 0, -1);
  fov = 72;

  private cut: Cutscene | null = null;
  private t = 0;
  private fired = new Set<number>();
  private onDone: (() => void) | null = null;

  constructor(private hud: Hud) {}

  play(cut: Cutscene, onDone?: () => void): void {
    this.cut = cut;
    this.t = 0;
    this.fired.clear();
    this.onDone = onDone ?? null;
    this.active = true;
    this.skippable = cut.skippable !== false;
    if (cut.letterbox !== false) this.hud.letterbox(true);
    // seed pose from the first keyframe so frame 0 is already framed
    if (cut.keys.length) this.apply(cut.keys[0].t);
  }

  /** jump to the end: fire every remaining event, then finish */
  skip(): void {
    if (!this.cut || !this.skippable) return;
    this.t = this.cut.duration;
    this.flushEvents();
    this.finish();
  }

  update(dt: number): void {
    if (!this.active || !this.cut) return;
    this.t += dt;
    this.flushEvents();
    this.apply(this.t);
    if (this.t >= this.cut.duration) this.finish();
  }

  private flushEvents(): void {
    const evs = this.cut!.events;
    if (!evs) return;
    for (let i = 0; i < evs.length; i++) {
      if (this.fired.has(i)) continue;
      if (this.t >= evs[i].t) {
        this.fired.add(i);
        evs[i].fn();
      }
    }
  }

  /** interpolate the camera pose at time t along the keyframe path */
  private apply(time: number): void {
    const keys = this.cut!.keys;
    if (keys.length === 0) return;
    if (keys.length === 1 || time <= keys[0].t) {
      this.set(keys[0]);
      return;
    }
    const last = keys[keys.length - 1];
    if (time >= last.t) {
      this.set(last);
      return;
    }
    let a = keys[0];
    let b = keys[1];
    for (let i = 0; i < keys.length - 1; i++) {
      if (time >= keys[i].t && time <= keys[i + 1].t) {
        a = keys[i];
        b = keys[i + 1];
        break;
      }
    }
    const span = b.t - a.t || 1;
    const k = (time - a.t) / span;
    this.pos.set(
      smooth(a.pos[0], b.pos[0], k),
      smooth(a.pos[1], b.pos[1], k),
      smooth(a.pos[2], b.pos[2], k)
    );
    this.look.set(
      smooth(a.look[0], b.look[0], k),
      smooth(a.look[1], b.look[1], k),
      smooth(a.look[2], b.look[2], k)
    );
    this.fov = smooth(a.fov ?? 60, b.fov ?? 60, k);
  }

  private set(key: CamKey): void {
    this.pos.set(key.pos[0], key.pos[1], key.pos[2]);
    this.look.set(key.look[0], key.look[1], key.look[2]);
    this.fov = key.fov ?? 60;
  }

  private finish(): void {
    if (!this.active) return;
    this.active = false;
    const cb = this.onDone;
    this.cut = null;
    this.onDone = null;
    this.hud.letterbox(false);
    cb?.();
  }
}
