import type { Input } from "../core/Input";
import type { AudioFX } from "../core/AudioFX";
import type { Level } from "../world/Level";

const WALK = 3.1;
const SPRINT = 5.1;
const CROUCH = 1.5;
const EYE_STAND = 1.62;
const EYE_CROUCH = 0.95;
export const PLAYER_R = 0.32;

export class Player {
  x = 0;
  z = 0;
  yaw = 0;
  pitch = 0;
  eyeY = EYE_STAND;
  private vx = 0;
  private vz = 0;

  stamina = 1;
  exhausted = false;
  crouching = false;
  sprinting = false;
  moving = false;

  battery = 0.7;
  lightOn = false;
  bottles = 0;

  frozen = false; // director can lock input

  /** mouse-look radians per pixel of movement, scaled by the sensitivity option */
  lookSpeed = 0.0022;
  /** invert vertical look (Options → INVERT LOOK Y) */
  invertY = false;

  private bobT = 0;
  bobOffset = 0;
  /** camera roll from strafing, radians */
  lean = 0;
  private strideAcc = 0;

  constructor(
    private input: Input,
    private fx: AudioFX,
    private level: Level
  ) {}

  get speedFrac(): number {
    return Math.hypot(this.vx, this.vz) / SPRINT;
  }

  update(dt: number): void {
    const input = this.input;
    if (!this.frozen) {
      this.yaw -= input.mouseDX * this.lookSpeed;
      this.pitch -= input.mouseDY * this.lookSpeed * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    }

    // movement intent
    let fwd = 0;
    let strafe = 0;
    if (!this.frozen) {
      if (input.isDown("KeyW") || input.isDown("ArrowUp")) fwd += 1;
      if (input.isDown("KeyS") || input.isDown("ArrowDown")) fwd -= 1;
      if (input.isDown("KeyA") || input.isDown("ArrowLeft")) strafe -= 1;
      if (input.isDown("KeyD") || input.isDown("ArrowRight")) strafe += 1;
    }
    const wantMove = fwd !== 0 || strafe !== 0;
    this.crouching = !this.frozen && (input.isDown("ControlLeft") || input.isDown("KeyC"));
    const wantSprint = input.isDown("ShiftLeft") && fwd > 0 && !this.crouching;

    // stamina
    if (wantSprint && !this.exhausted && wantMove) {
      this.stamina = Math.max(0, this.stamina - dt * 0.21);
      if (this.stamina <= 0) this.exhausted = true;
      this.sprinting = true;
    } else {
      this.stamina = Math.min(1, this.stamina + dt * 0.13);
      if (this.exhausted && this.stamina > 0.3) this.exhausted = false;
      this.sprinting = false;
    }
    if (this.exhausted) this.sprinting = false;
    const speed = this.sprinting ? SPRINT : this.crouching ? CROUCH : WALK;

    // direction in world space
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    let dx = (-sin * fwd + cos * strafe);
    let dz = (-cos * fwd - sin * strafe);
    const len = Math.hypot(dx, dz);
    if (len > 0.001) {
      dx /= len;
      dz /= len;
    }

    // smooth accelerate
    const accel = wantMove ? 14 : 11;
    this.vx += (dx * speed - this.vx) * Math.min(1, accel * dt);
    this.vz += (dz * speed - this.vz) * Math.min(1, accel * dt);
    const moved = Math.hypot(this.vx, this.vz) * dt;
    [this.x, this.z] = this.level.moveCircle(this.x, this.z, this.vx * dt, this.vz * dt, PLAYER_R);
    this.moving = moved > 0.005;

    // crouch height
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND;
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, 10 * dt);

    // strafe lean
    this.lean += (strafe * -0.016 - this.lean) * Math.min(1, 7 * dt);

    // head bob + footsteps
    if (this.moving) {
      const rate = this.sprinting ? 9.4 : this.crouching ? 4.2 : 6.4;
      this.bobT += dt * rate;
      this.bobOffset = Math.sin(this.bobT) * (this.sprinting ? 0.055 : 0.032);
      this.strideAcc += moved;
      const stride = this.crouching ? 1.5 : this.sprinting ? 2.4 : 2.0;
      if (this.strideAcc >= stride) {
        this.strideAcc = 0;
        this.fx.stepPlayer(this.speedFrac, this.crouching);
        const loud = this.crouching ? 1.2 : this.sprinting ? 9 : 4;
        this.level.addNoise(this.x, this.z, loud);
      }
    } else {
      this.bobOffset *= 1 - Math.min(1, 8 * dt);
      this.strideAcc = 0;
    }

    // flashlight
    if (!this.frozen && input.justPressed("KeyF")) {
      if (this.battery > 0 || this.lightOn) {
        this.lightOn = !this.lightOn;
        this.fx.uiClick();
      }
    }
    if (this.lightOn) {
      this.battery = Math.max(0, this.battery - dt * 0.0042);
      if (this.battery <= 0) this.lightOn = false;
    }

    this.fx.setListener(this.x, this.z, this.yaw);
  }

  addBattery(amount: number): void {
    this.battery = Math.min(1, this.battery + amount);
  }

  /** forward unit vector (XZ) */
  forward(): [number, number] {
    return [-Math.sin(this.yaw), -Math.cos(this.yaw)];
  }
}
