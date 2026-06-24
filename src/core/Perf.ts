import * as THREE from "three";

/**
 * PERF — the performance instrument the harness was missing.
 *
 * One `tick()`-style API the main loop drives each frame. It measures the things
 * that actually matter for a Three.js game and that the test harness can gate on:
 *
 *  - real frame time / fps via `performance.now()` (NOT the dt-capped game clock,
 *    which is useless for fps — it's clamped to 0.05s and runs ~3x slow headless)
 *  - a CPU vs render split (the loop marks `beforeRender()` so we can tell game-
 *    logic cost from the post-stack/draw cost)
 *  - the GPU workload from `renderer.info`: draw calls, triangles, geometries,
 *    textures, programs — the deterministic numbers an optimisation must move and
 *    a regression will quietly inflate. We turn OFF `info.autoReset` and reset once
 *    per frame so the count is the WHOLE frame (every EffectComposer pass), not just
 *    the last pass.
 *  - JS heap (where exposed) to catch leaks across a long run.
 *
 * It also renders a toggleable on-screen overlay (`` ` `` / F3, or `?perf`) so a
 * human — or a Claude vision pass on a screenshot — can SEE the numbers, and it
 * exposes `summary()` / `reset()` so `agent/perf.mjs` can sample a window of frames
 * per scenario and diff it against a baseline.
 */

export interface PerfSummary {
  frames: number;
  /** real-time fps over the sampled window (mean of per-frame fps) */
  fps: number;
  /** wall-clock frame time, ms: smoothed, plus distribution over the window */
  ms: { avg: number; min: number; max: number; p50: number; p95: number; p99: number };
  /** CPU (game update) vs render (post stack + draw) split, ms avg */
  cpuMs: number;
  renderMs: number;
  /** worst single CPU / render frame in the window, ms */
  cpuMax: number;
  renderMax: number;
  /** GPU workload from renderer.info (last frame in the window) */
  calls: number;
  triangles: number;
  lines: number;
  points: number;
  geometries: number;
  textures: number;
  programs: number;
  /** peak draw calls / triangles seen in the window (catches per-frame spikes) */
  callsMax: number;
  trianglesMax: number;
  /** JS heap in MB (Chromium only), else null */
  heapMB: number | null;
  heapMaxMB: number | null;
  /** frames whose wall time exceeded the spike threshold (jank) */
  spikes: number;
  spikeThresholdMs: number;
}

const RING = 240; // ~4s of history at 60fps

export class Perf {
  private renderer: THREE.WebGLRenderer;

  // wall-clock timestamps for the current frame
  private tFrame = 0; // performance.now() at frameStart
  private tBefore = 0; // at beforeRender

  // ring buffers (wall time, cpu, render — all ms; plus per-frame draw work)
  private ms = new Float32Array(RING);
  private cpu = new Float32Array(RING);
  private gpu = new Float32Array(RING);
  private callsRing = new Int32Array(RING);
  private trisRing = new Int32Array(RING);
  private head = 0;
  private count = 0;

  // smoothed read-outs for the overlay
  private msEma = 16.7;
  private fpsEma = 60;

  // last renderer.info snapshot (read after the full composer render)
  private info = { calls: 0, triangles: 0, lines: 0, points: 0, geometries: 0, textures: 0, programs: 0 };
  private callsMax = 0;
  private trianglesMax = 0;

  private heapMB: number | null = null;
  private heapMaxMB: number | null = null;

  private spikeMs = 50; // > 50ms ≈ a <20fps hitch
  private spikes = 0;
  private frameId = 0;

  // overlay
  private el: HTMLDivElement | null = null;
  private spark: HTMLCanvasElement | null = null;
  private sctx: CanvasRenderingContext2D | null = null;
  private overlayOn = false;
  private overlayTick = 0;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    // count the WHOLE frame, not just the last composer pass
    renderer.info.autoReset = false;
    renderer.info.reset();

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.has("perf")) this.setOverlay(true);
      // `` ` `` (Backquote) or F3 toggles the overlay — classic debug-HUD keys,
      // and neither is used by gameplay.
      window.addEventListener("keydown", (e) => {
        if (e.code === "Backquote" || e.code === "F3") {
          this.setOverlay(!this.overlayOn);
          e.preventDefault();
        }
      });
    }
  }

  /** call first thing in the rAF callback */
  frameStart(): void {
    const now = performance.now();
    if (this.tFrame > 0) {
      const frameMs = now - this.tFrame;
      this.msEma += (frameMs - this.msEma) * 0.1;
      const fps = frameMs > 0 ? 1000 / frameMs : 0;
      this.fpsEma += (fps - this.fpsEma) * 0.1;
      this.ms[this.head] = frameMs;
      if (frameMs > this.spikeMs) this.spikes++;
    }
    this.tFrame = now;
    this.tBefore = now; // default if beforeRender() is never called
  }

  /** call right before the render/post pass so we can split CPU vs render cost */
  beforeRender(): void {
    this.tBefore = performance.now();
    this.cpu[this.head] = this.tBefore - this.tFrame;
  }

  /** call right after the render/post pass — reads renderer.info and advances the ring */
  afterRender(): void {
    const now = performance.now();
    this.gpu[this.head] = now - this.tBefore;

    const r = this.renderer.info.render;
    const m = this.renderer.info.memory;
    this.info = {
      calls: r.calls,
      triangles: r.triangles,
      lines: r.lines,
      points: r.points,
      geometries: m.geometries,
      textures: m.textures,
      programs: this.renderer.info.programs?.length ?? 0
    };
    if (r.calls > this.callsMax) this.callsMax = r.calls;
    if (r.triangles > this.trianglesMax) this.trianglesMax = r.triangles;
    this.callsRing[this.head] = r.calls;
    this.trisRing[this.head] = r.triangles;
    this.renderer.info.reset(); // start next frame's count clean

    // heap (Chromium-only, non-standard)
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    if (mem) {
      this.heapMB = mem.usedJSHeapSize / 1048576;
      this.heapMaxMB = Math.max(this.heapMaxMB ?? 0, this.heapMB);
    }

    this.head = (this.head + 1) % RING;
    this.count = Math.min(this.count + 1, RING);
    this.frameId++;
    if (this.overlayOn && (this.overlayTick++ & 7) === 0) this.drawOverlay();
  }

  /** clear the sampling window — `agent/perf.mjs` calls this before each scenario */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.spikes = 0;
    this.callsMax = 0;
    this.trianglesMax = 0;
    this.heapMaxMB = this.heapMB;
    this.ms.fill(0);
    this.cpu.fill(0);
    this.gpu.fill(0);
    this.callsRing.fill(0);
    this.trisRing.fill(0);
  }

  /** aggregate the current window into a plain object (read by the headless profiler) */
  summary(): PerfSummary {
    const n = this.count;
    const vals: number[] = [];
    const callsArr: number[] = [];
    const trisArr: number[] = [];
    let cpuSum = 0, gpuSum = 0, cpuMax = 0, gpuMax = 0, msSum = 0, fpsSum = 0;
    for (let i = 0; i < n; i++) {
      const idx = (this.head - 1 - i + RING * 2) % RING;
      const fv = this.ms[idx];
      if (fv > 0) { vals.push(fv); msSum += fv; fpsSum += 1000 / fv; }
      cpuSum += this.cpu[idx]; gpuSum += this.gpu[idx];
      if (this.cpu[idx] > cpuMax) cpuMax = this.cpu[idx];
      if (this.gpu[idx] > gpuMax) gpuMax = this.gpu[idx];
      if (this.callsRing[idx] > 0) callsArr.push(this.callsRing[idx]);
      if (this.trisRing[idx] > 0) trisArr.push(this.trisRing[idx]);
    }
    vals.sort((a, b) => a - b);
    const pct = (p: number) => (vals.length ? vals[Math.min(vals.length - 1, Math.floor((p / 100) * vals.length))] : 0);
    const safe = vals.length || 1;
    // median draw work over the window — stable across runs for a frozen beat,
    // so the regression gate isn't fooled by single-frame frustum/shadow jitter.
    const median = (a: number[], fallback: number) => {
      if (!a.length) return fallback;
      a.sort((x, y) => x - y);
      return a[a.length >> 1];
    };
    return {
      frames: n,
      fps: fpsSum / safe,
      ms: {
        avg: msSum / safe,
        min: vals[0] ?? 0,
        max: vals[vals.length - 1] ?? 0,
        p50: pct(50),
        p95: pct(95),
        p99: pct(99)
      },
      cpuMs: cpuSum / (n || 1),
      renderMs: gpuSum / (n || 1),
      cpuMax,
      renderMax: gpuMax,
      calls: median(callsArr, this.info.calls),
      triangles: median(trisArr, this.info.triangles),
      lines: this.info.lines,
      points: this.info.points,
      geometries: this.info.geometries,
      textures: this.info.textures,
      programs: this.info.programs,
      callsMax: this.callsMax,
      trianglesMax: this.trianglesMax,
      heapMB: this.heapMB,
      heapMaxMB: this.heapMaxMB,
      spikes: this.spikes,
      spikeThresholdMs: this.spikeMs
    };
  }

  /** live read-out for the overlay (smoothed) */
  now(): { fps: number; ms: number } {
    return { fps: this.fpsEma, ms: this.msEma };
  }

  isOverlayOn(): boolean {
    return this.overlayOn;
  }

  setOverlay(on: boolean): void {
    this.overlayOn = on;
    if (on) {
      this.ensureOverlay();
      this.el!.style.display = "block";
      this.drawOverlay();
    } else if (this.el) {
      this.el.style.display = "none";
    }
  }

  private ensureOverlay(): void {
    if (this.el) return;
    const el = document.createElement("div");
    el.id = "perf-overlay";
    el.style.cssText =
      "position:fixed;top:8px;left:8px;z-index:9999;pointer-events:none;" +
      "font:11px/1.45 ui-monospace,Consolas,'Courier New',monospace;" +
      "color:#bfeccb;background:rgba(4,8,10,0.72);border:1px solid rgba(120,200,160,0.28);" +
      "padding:7px 9px;border-radius:4px;white-space:pre;letter-spacing:0.02em;" +
      "text-shadow:0 1px 2px #000;min-width:188px;";
    const spark = document.createElement("canvas");
    spark.width = 188;
    spark.height = 34;
    spark.style.cssText = "display:block;margin-top:5px;border-radius:2px;";
    const text = document.createElement("div");
    text.id = "perf-overlay-text";
    el.appendChild(text);
    el.appendChild(spark);
    document.body.appendChild(el);
    this.el = el;
    this.spark = spark;
    this.sctx = spark.getContext("2d");
  }

  private drawOverlay(): void {
    if (!this.el) return;
    const s = this.summary();
    const live = this.now();
    const color = live.fps >= 55 ? "#bfeccb" : live.fps >= 30 ? "#e6d98a" : "#e89a8a";
    this.el.style.color = color;
    const heap = s.heapMB != null ? `${s.heapMB.toFixed(0)}mb` : "—";
    const txt = this.el.firstChild as HTMLDivElement;
    txt.textContent =
      `${live.fps.toFixed(0).padStart(3)} fps  ${live.ms.toFixed(1)}ms\n` +
      `cpu ${s.cpuMs.toFixed(1)}  render ${s.renderMs.toFixed(1)}\n` +
      `p95 ${s.ms.p95.toFixed(1)}  p99 ${s.ms.p99.toFixed(1)}  spk ${s.spikes}\n` +
      `calls ${s.calls}  tris ${(s.triangles / 1000).toFixed(1)}k\n` +
      `geo ${s.geometries}  tex ${s.textures}  prog ${s.programs}\n` +
      `heap ${heap}`;
    this.drawSpark();
  }

  private drawSpark(): void {
    const ctx = this.sctx;
    const cv = this.spark;
    if (!ctx || !cv) return;
    const w = cv.width, h = cv.height;
    ctx.clearRect(0, 0, w, h);
    // 60fps and 30fps reference lines (16.7ms / 33.3ms), scaled to a 50ms ceiling
    const ceil = 50;
    const y = (ms: number) => h - Math.min(h, (ms / ceil) * h);
    ctx.strokeStyle = "rgba(120,200,160,0.18)";
    ctx.lineWidth = 1;
    for (const ref of [16.7, 33.3]) {
      ctx.beginPath();
      ctx.moveTo(0, y(ref));
      ctx.lineTo(w, y(ref));
      ctx.stroke();
    }
    const n = Math.min(this.count, w);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const idx = (this.head - n + i + RING * 2) % RING;
      const v = this.ms[idx];
      const px = (i / w) * w;
      if (i === 0) ctx.moveTo(px, y(v));
      else ctx.lineTo(px, y(v));
    }
    ctx.strokeStyle = "#7fdca6";
    ctx.lineWidth = 1.25;
    ctx.stroke();
  }
}
