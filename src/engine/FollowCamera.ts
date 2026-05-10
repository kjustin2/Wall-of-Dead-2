import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { dampCoeff } from "../util/math";

export interface FollowCameraRig {
  camera: ArcRotateCamera;
  setTarget(target: TransformNode): void;
  snapToTarget(yaw: number): void;
  setTension(amount: number): void;
  shake(amount: number, duration?: number): void;
  update(dt: number): void;
}

export function createFollowCamera(scene: Scene, canvas: HTMLCanvasElement): FollowCameraRig {
  const baseRadius = 4.95;
  const baseBeta = 0.98;
  const shoulderOffset = 0.62;
  const camera = new ArcRotateCamera("followCam", Math.PI + shoulderOffset, baseBeta, baseRadius, new Vector3(0, 1.25, 0), scene);
  camera.lowerRadiusLimit = 4.6;
  camera.upperRadiusLimit = 5.8;
  camera.lowerBetaLimit = 0.86;
  camera.upperBetaLimit = 1.12;
  camera.wheelDeltaPercentage = 0;
  camera.angularSensibilityX = 1050;
  camera.angularSensibilityY = 1050;
  camera.minZ = 0.08;
  camera.maxZ = 120;
  camera.checkCollisions = true;
  camera.collisionRadius = new Vector3(0.45, 0.45, 0.45);
  camera.fov = 0.67;
  camera.attachControl(canvas, true);
  camera.inputs.clear();

  const desired = new Vector3();
  let target: TransformNode | null = null;
  let smoothedY = 0;
  let tension = 0;
  let shakeAmp = 0;
  let shakeTimer = 0;
  let shakeTotal = 0;

  return {
    camera,
    setTarget(t) {
      target = t;
      smoothedY = t.position.y;
      desired.copyFrom(t.position);
      desired.y += 1.25;
      camera.setTarget(desired.clone());
    },
    snapToTarget(yaw) {
      if (!target) return;
      desired.copyFrom(target.position);
      desired.y = target.position.y + 1.25;
      camera.alpha = yaw + shoulderOffset;
      camera.beta = baseBeta;
      camera.radius = baseRadius;
      camera.setTarget(desired.clone());
    },
    setTension(amount) {
      tension = Math.max(0, Math.min(1, amount));
      camera.fov = 0.67 - tension * 0.045;
    },
    shake(amount, duration = 0.22) {
      if (amount > shakeAmp) {
        shakeAmp = Math.min(0.42, amount);
        shakeTimer = duration;
        shakeTotal = duration;
      }
    },
    update(dt) {
      if (!target) return;
      smoothedY += (target.position.y - smoothedY) * Math.min(1, dt * 4);
      desired.copyFrom(target.position);
      desired.y = smoothedY + 1.25;
      const t = camera.target as Vector3;
      const k = dampCoeff(10, dt);
      t.x += (desired.x - t.x) * k;
      t.y += (desired.y - t.y) * k;
      t.z += (desired.z - t.z) * k;
      const desiredRadius = baseRadius - tension * 0.35;
      camera.radius += (desiredRadius - camera.radius) * dampCoeff(4, dt);
      camera.beta += (baseBeta - camera.beta) * dampCoeff(5, dt);
      if (shakeTimer > 0) {
        shakeTimer = Math.max(0, shakeTimer - dt);
        const r = shakeTotal > 0 ? shakeTimer / shakeTotal : 0;
        const s = shakeAmp * r * r;
        const n = performance.now() * 0.05;
        t.x += Math.sin(n * 1.7) * s;
        t.y += Math.sin(n * 2.3 + 1.4) * s * 0.45;
        t.z += Math.cos(n * 1.3) * s;
        if (shakeTimer === 0) shakeAmp = 0;
      }
    }
  };
}
