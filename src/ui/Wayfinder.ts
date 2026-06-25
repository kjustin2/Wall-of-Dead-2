import * as THREE from "three";

/**
 * Player wayfinding. Given the current objective's world position, this drives:
 *  - a screen-space marker (diamond) when the objective is on-screen,
 *  - an edge arrow pointing toward it when it's off-screen or behind,
 *  - a compass pip showing the bearing relative to where you're looking.
 *
 * The diegetic 3D beacon at the objective lives in main.ts; this is the HUD half.
 * The whole thing fades out when there's no objective, when you're on top of it,
 * or during a chase (you already know where you're going: out).
 */
function el<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export class Wayfinder {
  private wrap = el("wayfinder");
  private marker = el("objmark");
  private label = el("objlabel");
  private compassPip = el("compass-pip");

  private target = new THREE.Vector3();
  private hasTarget = false;
  private hidden = false;
  private opacity = 0;

  private readonly tmpV = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();

  /** world position of the current objective, or null to clear */
  setObjective(world: THREE.Vector3 | null, label = ""): void {
    if (world) {
      this.target.copy(world);
      this.hasTarget = true;
      this.label.textContent = label;
    } else {
      this.hasTarget = false;
    }
  }

  /** chase / cutscene hides the wayfinder without clearing the objective */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  update(camera: THREE.PerspectiveCamera, dt: number): void {
    const W = window.innerWidth;
    const H = window.innerHeight;

    const dist = this.hasTarget ? this.target.distanceTo(camera.position) : 0;
    // fade in when we have a far-enough objective and aren't hidden
    const want = this.hasTarget && !this.hidden && dist > 2.2 ? 1 : 0;
    this.opacity += (want - this.opacity) * Math.min(1, 8 * dt);
    this.wrap.style.opacity = this.opacity.toFixed(3);
    if (this.opacity < 0.02) {
      this.wrap.classList.add("idle");
      return;
    }
    this.wrap.classList.remove("idle");

    // project objective to normalized device coords
    this.tmpV.copy(this.target);
    this.tmpV.project(camera);
    camera.getWorldDirection(this.fwd);
    const toTarget = this.toTarget.copy(this.target).sub(camera.position);
    const inFront = toTarget.dot(this.fwd) > 0;

    const onScreen =
      inFront && this.tmpV.x >= -0.96 && this.tmpV.x <= 0.96 && this.tmpV.y >= -0.94 && this.tmpV.y <= 0.94;

    if (onScreen) {
      const sx = (this.tmpV.x * 0.5 + 0.5) * W;
      const sy = (-this.tmpV.y * 0.5 + 0.5) * H;
      this.marker.classList.remove("edge");
      this.marker.style.left = `${sx}px`;
      this.marker.style.top = `${sy}px`;
      this.marker.style.transform = "translate(-50%, -50%)";
      this.label.style.left = `${sx}px`;
      this.label.style.top = `${sy + 22}px`;
      this.label.style.opacity = "1";
    } else {
      // edge arrow: point from screen center toward the (possibly behind) target
      let nx = this.tmpV.x;
      let ny = this.tmpV.y;
      if (!inFront) {
        nx = -nx;
        ny = -ny;
      }
      const ang = Math.atan2(ny, nx); // NDC, +y up
      const mx = Math.cos(ang);
      const my = Math.sin(ang);
      // clamp onto a centered rectangle inset from the edge
      const insetX = W * 0.5 - 46;
      const insetY = H * 0.5 - 46;
      const scale = Math.min(insetX / Math.abs(mx || 1e-3), insetY / Math.abs(my || 1e-3));
      const sx = W * 0.5 + mx * scale;
      const sy = H * 0.5 - my * scale; // screen y is down
      this.marker.classList.add("edge");
      this.marker.style.left = `${sx}px`;
      this.marker.style.top = `${sy}px`;
      // rotate the arrow glyph to point outward (screen space, y down)
      this.marker.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(-my, mx)}rad)`;
      this.label.style.opacity = "0";
    }

    // compass pip: signed bearing between look dir and target dir on the XZ plane
    const bearing = Math.atan2(toTarget.x, toTarget.z);
    const facing = Math.atan2(this.fwd.x, this.fwd.z);
    let rel = bearing - facing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const pct = 50 + Math.max(-1, Math.min(1, rel / (Math.PI * 0.85))) * 50;
    this.compassPip.style.left = `${pct}%`;
    this.compassPip.style.opacity = (1 - Math.min(1, Math.abs(rel) / Math.PI) * 0.65).toFixed(2);
  }
}
