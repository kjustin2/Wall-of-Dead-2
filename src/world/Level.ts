import {
  CELL, GRID_W, GRID_H, ROOMS, DOOR_DEFS, PILLARS, PROPS,
  type DoorDef
} from "./data";

export interface Door {
  def: DoorDef;
  cx: number;
  cy: number;
  /** 0 = closed, 1 = fully open */
  openT: number;
  targetOpen: boolean;
  locked: boolean;
  broken: boolean;
}

export interface Noise {
  x: number;
  z: number;
  loud: number; // hearing radius ~ loud * 2.2 meters
}

export class Level {
  /** true = solid wall cell */
  solid: boolean[] = [];
  /** blocked by pillar or prop (subset of solid visuals but separate flag) */
  obstacle: boolean[] = [];
  doors: Door[] = [];
  doorAt = new Map<number, Door>();
  noises: Noise[] = [];

  constructor() {
    for (let i = 0; i < GRID_W * GRID_H; i++) {
      this.solid.push(true);
      this.obstacle.push(false);
    }
    for (const r of ROOMS) {
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) this.solid[this.idx(x, y)] = false;
      }
    }
    for (const d of DOOR_DEFS) {
      this.solid[this.idx(d.cx, d.cy)] = false;
      const door: Door = {
        def: d, cx: d.cx, cy: d.cy,
        openT: d.open ? 1 : 0,
        targetOpen: !!d.open,
        locked: !!d.locked,
        broken: false
      };
      this.doors.push(door);
      this.doorAt.set(this.idx(d.cx, d.cy), door);
    }
    for (const [x, y] of PILLARS) this.obstacle[this.idx(x, y)] = true;
    for (const p of PROPS) this.obstacle[this.idx(p.cx, p.cy)] = true;
  }

  idx(x: number, y: number): number {
    return y * GRID_W + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < GRID_W && y < GRID_H;
  }

  door(id: string): Door {
    const d = this.doors.find((d) => d.def.id === id);
    if (!d) throw new Error(`no door ${id}`);
    return d;
  }

  /** physical blocking (player + stalker bodies) */
  isBlocked(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    const i = this.idx(cx, cy);
    if (this.solid[i] || this.obstacle[i]) return true;
    const door = this.doorAt.get(i);
    if (door && door.openT < 0.6) return true;
    return false;
  }

  /** blocking for line-of-sight (closed doors block sight) */
  blocksSight(cx: number, cy: number): boolean {
    if (!this.inBounds(cx, cy)) return true;
    const i = this.idx(cx, cy);
    if (this.solid[i] || this.obstacle[i]) return true;
    const door = this.doorAt.get(i);
    if (door && door.openT < 0.35) return true;
    return false;
  }

  /** can the stalker eventually pass (it opens/bashes doors)? */
  passableForStalker(cx: number, cy: number, canBash: boolean): boolean {
    if (!this.inBounds(cx, cy)) return false;
    const i = this.idx(cx, cy);
    if (this.solid[i] || this.obstacle[i]) return false;
    const door = this.doorAt.get(i);
    if (door && door.openT < 0.6) {
      if (door.locked) return false;
      if (door.def.kind === "fire" && !canBash && !door.broken) return false;
      return true;
    }
    return true;
  }

  worldToCell(x: number, z: number): [number, number] {
    return [Math.floor(x / CELL), Math.floor(z / CELL)];
  }

  cellCenter(cx: number, cy: number): [number, number] {
    return [cx * CELL + CELL / 2, cy * CELL + CELL / 2];
  }

  /** 2D DDA line of sight between world points */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.001) return true;
    const steps = Math.ceil(dist / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [cx, cy] = this.worldToCell(ax + dx * t, az + dz * t);
      if (this.blocksSight(cx, cy)) return false;
    }
    return true;
  }

  // BFS scratch, reused across calls — the stalker repaths several times a second
  // during a chase; reallocating a GRID_W*GRID_H buffer each time was pure GC churn.
  private pathPrev = new Int32Array(GRID_W * GRID_H);
  private pathQ: number[] = [];

  /** BFS path in cell coords; returns list of cells excluding start, including goal */
  findPath(sx: number, sy: number, gx: number, gy: number, canBash: boolean): Array<[number, number]> | null {
    if (!this.inBounds(gx, gy)) return null;
    const start = this.idx(sx, sy);
    const goal = this.idx(gx, gy);
    if (start === goal) return [];
    const prev = this.pathPrev;
    prev.fill(-1);
    prev[start] = start;
    const q = this.pathQ;
    q.length = 0;
    q.push(start);
    let head = 0;
    while (head < q.length) {
      const cur = q[head++];
      if (cur === goal) break;
      const cx = cur % GRID_W;
      const cy = (cur / GRID_W) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + ox;
        const ny = cy + oy;
        if (!this.passableForStalker(nx, ny, canBash) && this.idx(nx, ny) !== goal) continue;
        if (!this.inBounds(nx, ny)) continue;
        const ni = this.idx(nx, ny);
        if (prev[ni] !== -1) continue;
        if (this.solid[ni] || this.obstacle[ni]) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (prev[goal] === -1) return null;
    const path: Array<[number, number]> = [];
    let cur = goal;
    while (cur !== start) {
      path.push([cur % GRID_W, (cur / GRID_W) | 0]);
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  addNoise(x: number, z: number, loud: number): void {
    this.noises.push({ x, z, loud });
  }

  /** circle vs blocked-cell collision resolve, axis-separated */
  moveCircle(x: number, z: number, dx: number, dz: number, r: number): [number, number] {
    let nx = x + dx;
    if (this.circleHits(nx, z, r)) nx = x;
    let nz = z + dz;
    if (this.circleHits(nx, nz, r)) nz = z;
    return [nx, nz];
  }

  private circleHits(x: number, z: number, r: number): boolean {
    const minX = Math.floor((x - r) / CELL);
    const maxX = Math.floor((x + r) / CELL);
    const minZ = Math.floor((z - r) / CELL);
    const maxZ = Math.floor((z + r) / CELL);
    for (let cy = minZ; cy <= maxZ; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (!this.isBlocked(cx, cy)) continue;
        const rx = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL));
        const rz = Math.max(cy * CELL, Math.min(z, (cy + 1) * CELL));
        if ((x - rx) ** 2 + (z - rz) ** 2 < r * r) return true;
      }
    }
    return false;
  }
}
