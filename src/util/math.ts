import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dampCoeff(rate: number, dt: number): number {
  return 1 - Math.exp(-rate * dt);
}

export function distSq2(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function normalizeXZ(v: Vector3): Vector3 {
  const len = Math.hypot(v.x, v.z);
  if (len < 1e-5) return v.set(0, 0, 0);
  v.x /= len;
  v.y = 0;
  v.z /= len;
  return v;
}

export function angleToXZ(ax: number, az: number, bx: number, bz: number): number {
  return Math.atan2(bx - ax, bz - az);
}

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function next() {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
