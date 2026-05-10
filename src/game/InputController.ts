import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { KeyboardEventTypes } from "@babylonjs/core/Events/keyboardEvents";
import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";

export interface FrameInput {
  move: Vector3;
  sprint: boolean;
  firePressed: boolean;
  fireHeld: boolean;
  reloadPressed: boolean;
  interactPressed: boolean;
  medkitPressed: boolean;
  nextWeapon: number;
  selectedSlot: number | null;
  lookDeltaX: number;
  lookDeltaY: number;
  pointerLocked: boolean;
}

export class InputController {
  private keys = new Set<string>();
  private firePressed = false;
  private fireHeld = false;
  private reloadPressed = false;
  private interactPressed = false;
  private medkitPressed = false;
  private selectedSlot: number | null = null;
  private wheelDelta = 0;
  private lookDeltaX = 0;
  private lookDeltaY = 0;
  private pointerLocked = false;
  private pointerLockEnabled = false;
  private canvas: HTMLCanvasElement | null = null;
  private move = new Vector3();
  private frame: FrameInput = {
    move: this.move,
    sprint: false,
    firePressed: false,
    fireHeld: false,
    reloadPressed: false,
    interactPressed: false,
    medkitPressed: false,
    nextWeapon: 0,
    selectedSlot: null,
    lookDeltaX: 0,
    lookDeltaY: 0,
    pointerLocked: false
  };

  constructor(private scene: Scene) {
    this.canvas = scene.getEngine().getRenderingCanvas() as HTMLCanvasElement | null;

    scene.onKeyboardObservable.add((kb) => {
      const key = kb.event.key.toLowerCase();
      if (kb.type === KeyboardEventTypes.KEYDOWN) {
        if (!this.keys.has(key)) {
          if (key === "r") this.reloadPressed = true;
          if (key === "e") this.interactPressed = true;
          if (key === "h") this.medkitPressed = true;
          if (key >= "1" && key <= "6") this.selectedSlot = Number(key) - 1;
        }
        this.keys.add(key);
      } else if (kb.type === KeyboardEventTypes.KEYUP) {
        this.keys.delete(key);
      }
    });

    scene.onPointerObservable.add((pi) => {
      if (pi.type === PointerEventTypes.POINTERDOWN) {
        if (pi.event.button === 0) {
          if (!this.pointerLocked) {
            this.requestPointerLock();
            return;
          }
          this.firePressed = true;
          this.fireHeld = true;
        }
      } else if (pi.type === PointerEventTypes.POINTERUP) {
        if (pi.event.button === 0) this.fireHeld = false;
      } else if (pi.type === PointerEventTypes.POINTERMOVE) {
        if (this.pointerLocked) {
          const event = pi.event as PointerEvent;
          this.lookDeltaX += event.movementX;
          this.lookDeltaY += event.movementY;
        }
      } else if (pi.type === PointerEventTypes.POINTERWHEEL) {
        const ev = pi.event as WheelEvent;
        this.wheelDelta += ev.deltaY > 0 ? 1 : -1;
      }
    });

    this.canvas?.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (!this.pointerLocked) this.fireHeld = false;
    });
  }

  requestPointerLock(): void {
    if (!this.pointerLockEnabled || !this.canvas || document.pointerLockElement === this.canvas) return;
    void this.canvas.requestPointerLock();
  }

  setPointerLockEnabled(enabled: boolean): void {
    this.pointerLockEnabled = enabled;
    if (!enabled) this.exitPointerLock();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  consume(cameraForward: Vector3): FrameInput {
    let fx = cameraForward.x;
    let fz = cameraForward.z;
    const fl = Math.hypot(fx, fz);
    if (fl > 1e-5) {
      fx /= fl;
      fz /= fl;
    } else {
      fx = 0;
      fz = 1;
    }
    const rx = fz;
    const rz = -fx;
    let mx = 0;
    let mz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) {
      mx += fx;
      mz += fz;
    }
    if (this.keys.has("s") || this.keys.has("arrowdown")) {
      mx -= fx;
      mz -= fz;
    }
    if (this.keys.has("d") || this.keys.has("arrowright")) {
      mx += rx;
      mz += rz;
    }
    if (this.keys.has("a") || this.keys.has("arrowleft")) {
      mx -= rx;
      mz -= rz;
    }
    const ml = Math.hypot(mx, mz);
    if (ml > 1) {
      mx /= ml;
      mz /= ml;
    }
    this.move.set(mx, 0, mz);
    this.frame.sprint = this.keys.has("shift");
    this.frame.firePressed = this.firePressed;
    this.frame.fireHeld = this.fireHeld;
    this.frame.reloadPressed = this.reloadPressed;
    this.frame.interactPressed = this.interactPressed;
    this.frame.medkitPressed = this.medkitPressed;
    this.frame.nextWeapon = this.wheelDelta === 0 ? 0 : (this.wheelDelta > 0 ? 1 : -1);
    this.frame.selectedSlot = this.selectedSlot;
    this.frame.lookDeltaX = this.pointerLocked ? this.lookDeltaX : 0;
    this.frame.lookDeltaY = this.pointerLocked ? this.lookDeltaY : 0;
    this.frame.pointerLocked = this.pointerLocked;

    this.firePressed = false;
    this.reloadPressed = false;
    this.interactPressed = false;
    this.medkitPressed = false;
    this.selectedSlot = null;
    this.wheelDelta = 0;
    this.lookDeltaX = 0;
    this.lookDeltaY = 0;
    return this.frame;
  }
}
