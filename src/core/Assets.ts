import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GRID_W, GRID_H } from "../world/data";

/**
 * Loads CC0 PBR materials (fetched into public/textures/ by scripts/fetch-assets.mjs)
 * and hands Builder ready-to-use MeshStandardMaterials. Materials are built
 * synchronously with a believable flat colour so the world can be constructed
 * immediately; the texture maps stream in and are assigned to the same material
 * objects as they arrive. If the assets aren't present (e.g. CI without
 * `npm run assets`), the flat-colour fallback is kept and the game still runs.
 *
 * Per-texture AO is intentionally omitted — the post pipeline's GTAO pass
 * (src/core/Post.ts) provides screen-space ambient occlusion globally.
 */
interface MatCfg {
  /** which public/textures/<dir> the maps come from (ceiling reuses wall) */
  dir: string;
  repeat: [number, number];
  /** multiplier applied once the real albedo is present (≈white = true colour) */
  tint: number;
  /** flat colour shown before/without textures */
  fallback: number;
  roughness: number;
  metalness: number;
}

// Tints are deliberately dark: the real CC0 albedo is far lighter than the
// near-black originals, so without darkening the bunker reads as a bright room
// instead of a horror space. Detail still resolves under the torch / fixtures.
const CONFIG: Record<string, MatCfg> = {
  wall: { dir: "wall", repeat: [1, 1], tint: 0x5b5852, fallback: 0x5b5852, roughness: 1, metalness: 0 },
  floor: { dir: "floor", repeat: [GRID_W, GRID_H], tint: 0x423f3a, fallback: 0x423f3a, roughness: 1, metalness: 0 },
  ceiling: { dir: "wall", repeat: [GRID_W / 2, GRID_H / 2], tint: 0x2e2c29, fallback: 0x2e2c29, roughness: 1, metalness: 0 },
  metal: { dir: "metal", repeat: [1.5, 1.5], tint: 0x7c8288, fallback: 0x53575b, roughness: 0.55, metalness: 1 },
  rust: { dir: "rust", repeat: [1, 1], tint: 0x6e503e, fallback: 0x4a3022, roughness: 0.85, metalness: 0.6 },
  wood: { dir: "wood", repeat: [1, 1], tint: 0x665033, fallback: 0x3e3225, roughness: 0.9, metalness: 0 },
  tile: { dir: "tile", repeat: [1, 1], tint: 0x5c6268, fallback: 0x4a4e52, roughness: 0.5, metalness: 0 }
};

type Manifest = Record<string, { id: string; maps: string[] }>;
type ModelManifest = Record<string, { id: string; path: string }>;

// per-kind placement fixups for the CC0 props (real-world metre scale, Y-up)
const MODEL_TWEAK: Record<string, { scale: number; y: number }> = {
  crates: { scale: 1.3, y: 0 },
  barrel: { scale: 1, y: 0 },
  desk: { scale: 1, y: 0 },
  bench: { scale: 1, y: 0 }
};

export class Assets {
  private maxAniso: number;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private models = new Map<string, THREE.Group>();
  loaded = false;

  constructor(renderer: THREE.WebGLRenderer) {
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    for (const [name, cfg] of Object.entries(CONFIG)) {
      this.mats.set(name, new THREE.MeshStandardMaterial({
        color: cfg.fallback, roughness: cfg.roughness, metalness: cfg.metalness
      }));
    }
  }

  material(name: string): THREE.MeshStandardMaterial {
    return this.mats.get(name) ?? this.mats.get("wall")!;
  }

  /** A fresh, shadow-casting clone of a loaded prop model, or null if absent. */
  model(kind: string): THREE.Object3D | null {
    const tmpl = this.models.get(kind);
    if (!tmpl) return null;
    const obj = tmpl.clone(true);
    const tw = MODEL_TWEAK[kind] ?? { scale: 1, y: 0 };
    obj.scale.setScalar(tw.scale);
    obj.position.y = tw.y;
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return obj;
  }

  private async loadModels(): Promise<void> {
    let mani: ModelManifest | null = null;
    try {
      const r = await fetch("/models/manifest.json");
      if (r.ok) mani = (await r.json()) as ModelManifest;
    } catch {
      /* models not downloaded — Builder keeps its primitive props */
    }
    if (!mani) return;
    const loader = new GLTFLoader();
    await Promise.all(
      Object.entries(mani).map(async ([kind, info]) => {
        try {
          const gltf = await loader.loadAsync(info.path);
          this.models.set(kind, gltf.scene);
        } catch {
          /* leave this kind as a primitive */
        }
      })
    );
  }

  /** Fetch the manifest and stream PBR maps onto the pre-built materials. */
  async load(onProgress?: (frac: number) => void): Promise<void> {
    let manifest: Manifest | null = null;
    try {
      const r = await fetch("/textures/manifest.json");
      if (r.ok) manifest = (await r.json()) as Manifest;
    } catch {
      /* assets not downloaded — keep flat-colour fallback */
    }
    if (!manifest) {
      await this.loadModels();
      this.loaded = true;
      onProgress?.(1);
      return;
    }

    const mgr = new THREE.LoadingManager();
    const loader = new THREE.TextureLoader(mgr);
    mgr.onProgress = (_url, done, total) => onProgress?.(total ? done / total : 1);
    const finished = new Promise<void>((res) => {
      mgr.onLoad = () => res();
      mgr.onError = () => { /* tolerate a missing map; LoadingManager still completes */ };
    });

    let requested = 0;
    for (const [name, cfg] of Object.entries(CONFIG)) {
      const entry = manifest[cfg.dir];
      if (!entry) continue;
      const mat = this.material(name);
      const has = (m: string) => entry.maps.includes(m);
      const tex = (file: string, srgb: boolean): THREE.Texture => {
        const t = loader.load(`/textures/${cfg.dir}/${file}.jpg`);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(cfg.repeat[0], cfg.repeat[1]);
        t.anisotropy = this.maxAniso;
        t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        requested++;
        return t;
      };
      if (has("albedo")) { mat.map = tex("albedo", true); mat.color.set(cfg.tint); }
      if (has("normal")) mat.normalMap = tex("normal", false);
      if (has("roughness")) { mat.roughnessMap = tex("roughness", false); mat.roughness = 1; }
      if (has("metalness")) { mat.metalnessMap = tex("metalness", false); mat.metalness = 1; }
      mat.needsUpdate = true;
    }

    if (requested === 0) { await this.loadModels(); this.loaded = true; onProgress?.(1); return; }
    await finished;
    await this.loadModels();
    this.loaded = true;
    onProgress?.(1);
  }
}
