import { ZoneDef } from "../data/content";

export interface XzPosition {
  x: number;
  z: number;
}

export interface XzDelta {
  x: number;
  z: number;
}

export interface RectCollider {
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
}

const EDGE_MARGIN = 0.6;

export function clampToZone(pos: XzPosition, zone: ZoneDef, radius: number): void {
  pos.x = clampNumber(pos.x, -zone.width / 2 + radius + EDGE_MARGIN, zone.width / 2 - radius - EDGE_MARGIN);
  pos.z = clampNumber(pos.z, -zone.depth / 2 + radius + EDGE_MARGIN, zone.depth / 2 - radius - EDGE_MARGIN);
}

export function moveCircleWithColliders(
  pos: XzPosition,
  delta: XzDelta,
  radius: number,
  zone: ZoneDef,
  colliders: RectCollider[]
): void {
  if (Math.abs(delta.x) > 0.00001) {
    pos.x += delta.x;
    resolveCircleColliders(pos, radius, zone, colliders, "x");
  }
  if (Math.abs(delta.z) > 0.00001) {
    pos.z += delta.z;
    resolveCircleColliders(pos, radius, zone, colliders, "z");
  }
  resolveCircleColliders(pos, radius, zone, colliders);
}

export function resolveCircleColliders(
  pos: XzPosition,
  radius: number,
  zone: ZoneDef,
  colliders: RectCollider[],
  preferredAxis?: "x" | "z"
): void {
  clampToZone(pos, zone, radius);
  for (let pass = 0; pass < 2; pass++) {
    for (const collider of colliders) {
      resolveCircleRect(pos, radius, collider, preferredAxis);
    }
    clampToZone(pos, zone, radius);
  }
}

function resolveCircleRect(pos: XzPosition, radius: number, collider: RectCollider, preferredAxis?: "x" | "z"): void {
  const minX = collider.x - collider.w / 2;
  const maxX = collider.x + collider.w / 2;
  const minZ = collider.z - collider.d / 2;
  const maxZ = collider.z + collider.d / 2;

  if (pos.x < minX - radius || pos.x > maxX + radius || pos.z < minZ - radius || pos.z > maxZ + radius) {
    return;
  }

  const closestX = clampNumber(pos.x, minX, maxX);
  const closestZ = clampNumber(pos.z, minZ, maxZ);
  const dx = pos.x - closestX;
  const dz = pos.z - closestZ;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return;

  if (preferredAxis === "x") {
    pos.x = pos.x < collider.x ? minX - radius : maxX + radius;
    return;
  }
  if (preferredAxis === "z") {
    pos.z = pos.z < collider.z ? minZ - radius : maxZ + radius;
    return;
  }

  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    pos.x = closestX + (dx / d) * radius;
    pos.z = closestZ + (dz / d) * radius;
    return;
  }

  const left = Math.abs(pos.x - minX);
  const right = Math.abs(maxX - pos.x);
  const top = Math.abs(pos.z - minZ);
  const bottom = Math.abs(maxZ - pos.z);
  const side = Math.min(left, right, top, bottom);
  if (side === left) pos.x = minX - radius;
  else if (side === right) pos.x = maxX + radius;
  else if (side === top) pos.z = minZ - radius;
  else pos.z = maxZ + radius;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
