import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

export type Quality = "off" | "low" | "medium" | "high";

/**
 * Final colour grade in one pass: radial chromatic aberration (lens fringe that
 * leans in during a chase / death), a cold desaturated film tint, and the
 * atmospheric vignette. Replaces the old CSS #vignette/#grain overlays — the
 * dynamic event overlays (#damage, #blackout, #chase-vignette) stay in the DOM.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uVignette: { value: 0.55 },
    uCA: { value: 0.0016 },
    uDesat: { value: 0.12 },
    uTint: { value: new THREE.Color(0.95, 0.99, 1.07) }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    varying vec2 vUv;
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uCA;
    uniform float uDesat;
    uniform vec3 uTint;
    void main() {
      vec2 toC = vUv - 0.5;
      float r2 = dot(toC, toC);
      float ca = uCA * r2 * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - toC * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + toC * ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l), uDesat);
      col *= uTint;
      float vig = 1.0 - uVignette * smoothstep(0.16, 0.78, r2);
      col *= vig;
      gl_FragColor = vec4(col, 1.0);
    }`
};

/** Reads ?nofx / ?lowfx so headless tests (slow SwiftShader GL) can opt out. */
function queryQuality(): Quality | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.has("nofx")) return "off";
  if (q.has("lowfx")) return "low";
  return null;
}

export class Post {
  readonly composer: EffectComposer;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private bokeh: BokehPass;
  private smaa: SMAAPass;
  private fxaa: ShaderPass;
  private grade: ShaderPass;

  private quality: Quality = "high";
  private renderScale = 1;
  private dof = false;
  private locked = false;
  private maxPR: number;
  private w = 1;
  private h = 1;

  // chromatic-aberration mood
  private caBase = 0.0016;
  private caTarget = 0.0016;
  private caCur = 0.0016;

  // perf auto-tune
  private frames = 0;
  private dtAccum = 0;

  /** fired whenever the tier changes (startup, pause-menu, or auto-tune) so the
   *  caller can scale tier-dependent costs it owns — shadows, dust, etc. */
  onQuality: ((q: Quality) => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.maxPR = renderer.getPixelRatio();
    const size = renderer.getSize(new THREE.Vector2());
    this.w = size.x;
    this.h = size.y;

    this.composer = new EffectComposer(renderer);

    // 1. base scene (linear HDR — no tone mapping here, OutputPass does it)
    this.composer.addPass(new RenderPass(scene, camera));

    // 2. ground-truth ambient occlusion — contact darkening in corners
    this.gtao = new GTAOPass(scene, camera, this.w, this.h);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.blendIntensity = 0.9;
    this.gtao.updateGtaoMaterial({ radius: 0.4, distanceExponent: 1, thickness: 1, scale: 1 });
    this.composer.addPass(this.gtao);

    // 3. bloom — only the torch hotspot, signs, LEDs, emergency lights
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.5, 0.6, 0.62);
    this.composer.addPass(this.bloom);

    // 4. depth of field — subtle, high tier only, off by default (tuned in M6)
    this.bokeh = new BokehPass(scene, camera, { focus: 6.0, aperture: 0.0006, maxblur: 0.006 });
    this.bokeh.enabled = false;
    this.composer.addPass(this.bokeh);

    // 5. tone mapping + linear->sRGB (reads renderer.toneMapping / exposure)
    this.composer.addPass(new OutputPass());

    // 6. antialiasing on the resolved LDR image
    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);

    // 7. finish passes after AA so they aren't smeared by it
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new FilmPass(0.22, false));

    const forced = queryQuality();
    if (forced) {
      this.locked = true;
      this.setQuality(forced);
    } else {
      this.setQuality("high");
    }
    this.setSize(this.w, this.h);
  }

  /** swap render targets / pass toggles for a quality tier */
  setQuality(q: Quality): void {
    this.quality = q;
    this.onQuality?.(q);
    if (q === "off") {
      this.renderScale = 1;
      return; // render() takes the passthrough path
    }
    const high = q === "high";
    const med = q === "medium";
    this.gtao.enabled = high || med;
    this.bokeh.enabled = high && this.dof;
    this.smaa.enabled = high || med;
    this.fxaa.enabled = q === "low";
    this.bloom.strength = q === "low" ? 0.4 : 0.5;
    this.renderScale = high ? 1 : med ? 0.85 : 0.66;
    this.applyScale();
  }

  getQuality(): Quality {
    return this.quality;
  }

  /** manual override from the pause menu — pins the tier so auto-tune stops */
  lockQuality(q: Quality): void {
    this.locked = true;
    this.setQuality(q);
  }

  setDof(on: boolean): void {
    this.dof = on;
    this.bokeh.enabled = this.quality === "high" && on;
  }

  /** lens fringe leans in during a chase, hard during the kill-cam */
  setMood(chase: boolean, dying: boolean): void {
    this.caTarget = this.caBase + (chase ? 0.004 : 0) + (dying ? 0.012 : 0);
  }

  private applyScale(): void {
    const pr = this.maxPR * this.renderScale;
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.w, this.h);
    // FXAA needs its texel size in device pixels; SMAA/bloom self-size
    const ew = this.w * pr;
    const eh = this.h * pr;
    (this.fxaa.material.uniforms.resolution.value as THREE.Vector2).set(1 / ew, 1 / eh);
  }

  setSize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.applyScale();
  }

  /** Precompile every pass's shaders up front so the first gameplay frame
   *  doesn't hitch (which on slow software GL is a visible startup stutter). */
  warmup(): void {
    if (this.quality === "off") {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(0);
  }

  render(dt: number): void {
    if (this.quality === "off") {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (!this.locked) this.autoTune(dt);
    this.caCur += (this.caTarget - this.caCur) * Math.min(1, 6 * dt);
    this.grade.uniforms.uCA.value = this.caCur;
    this.composer.render(dt);
  }

  private autoTune(dt: number): void {
    this.frames++;
    this.dtAccum += dt;
    if (this.frames < 90) return;
    const avg = this.dtAccum / this.frames;
    this.frames = 0;
    this.dtAccum = 0;
    if (avg > 0.024) {
      if (this.quality === "high") this.setQuality("medium");
      else if (this.quality === "medium") this.setQuality("low");
    }
  }
}
