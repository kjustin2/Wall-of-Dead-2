import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { clamp, dampCoeff } from "../util/math";

export interface FirstPersonCameraRig {
  camera: FreeCamera;
  setTarget(target: TransformNode): void;
  snapToTarget(yaw: number): void;
  lookAtPoint(x: number, z: number): void;
  setTension(amount: number): void;
  shake(amount: number, duration?: number): void;
  update(dt: number, lookDeltaX?: number, lookDeltaY?: number, moving?: boolean, sprinting?: boolean): void;
  getYaw(): number;
}

export function createFirstPersonCamera(scene: Scene): FirstPersonCameraRig {
  const camera = new FreeCamera("firstPersonCam", new Vector3(0, 1.45, 0), scene);
  camera.minZ = 0.035;
  camera.maxZ = 120;
  camera.fov = 0.79;
  camera.checkCollisions = false;
  camera.inputs.clear();

  let target: TransformNode | null = null;
  let yaw = Math.PI;
  let pitch = 0;
  let tension = 0;
  let shakeAmp = 0;
  let shakeTimer = 0;
  let shakeTotal = 0;
  let bobTimer = 0;
  const eye = new Vector3();

  function applyRotation(extraPitch = 0, extraYaw = 0): void {
    camera.rotation.x = clamp(pitch + extraPitch, -0.86, 0.72);
    camera.rotation.y = yaw + extraYaw;
    camera.rotation.z = 0;
  }

  return {
    camera,
    setTarget(nextTarget) {
      target = nextTarget;
      eye.copyFrom(nextTarget.position);
      eye.y += 1.48;
      camera.position.copyFrom(eye);
    },
    snapToTarget(nextYaw) {
      yaw = nextYaw;
      pitch = 0;
      if (target) {
        eye.copyFrom(target.position);
        eye.y += 1.48;
        camera.position.copyFrom(eye);
      }
      applyRotation();
    },
    lookAtPoint(x, z) {
      if (!target) return;
      const dx = x - target.position.x;
      const dz = z - target.position.z;
      if (Math.hypot(dx, dz) < 0.001) return;
      yaw = Math.atan2(dx, dz);
      pitch = 0;
      applyRotation();
    },
    setTension(amount) {
      tension = clamp(amount, 0, 1);
      camera.fov += ((0.79 - tension * 0.055) - camera.fov) * 0.18;
    },
    shake(amount, duration = 0.22) {
      if (amount > shakeAmp) {
        shakeAmp = Math.min(0.5, amount);
        shakeTimer = duration;
        shakeTotal = duration;
      }
    },
    update(dt, lookDeltaX = 0, lookDeltaY = 0, moving = false, sprinting = false) {
      yaw += lookDeltaX * 0.0021;
      pitch = clamp(pitch + lookDeltaY * 0.00175, -0.86, 0.72);

      if (moving) bobTimer += dt * (sprinting ? 9.8 : 6.2);
      else bobTimer += (0 - bobTimer) * dampCoeff(5, dt);

      if (target) {
        eye.copyFrom(target.position);
        eye.y += 1.47 + (moving ? Math.sin(bobTimer) * (sprinting ? 0.035 : 0.018) : 0);
        const k = dampCoeff(sprinting ? 22 : 16, dt);
        camera.position.x += (eye.x - camera.position.x) * k;
        camera.position.y += (eye.y - camera.position.y) * k;
        camera.position.z += (eye.z - camera.position.z) * k;
      }

      let extraPitch = 0;
      let extraYaw = 0;
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        const r = shakeTotal > 0 ? shakeTimer / shakeTotal : 0;
        const s = shakeAmp * r * r;
        const n = performance.now() * 0.045;
        camera.position.x += Math.sin(n * 1.7) * s * 0.035;
        camera.position.y += Math.sin(n * 2.1 + 1.2) * s * 0.020;
        camera.position.z += Math.cos(n * 1.3) * s * 0.035;
        extraPitch = Math.sin(n * 2.4) * s * 0.025;
        extraYaw = Math.cos(n * 1.6) * s * 0.018;
        if (shakeTimer === 0) shakeAmp = 0;
      }
      applyRotation(extraPitch, extraYaw);
    },
    getYaw() {
      return yaw;
    }
  };
}
