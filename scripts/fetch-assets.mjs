/**
 * Downloads the CC0 PBR material sets used by DEAD AIR from ambientCG
 * (https://ambientcg.com — all assets are CC0, no attribution required) into
 * public/textures/<name>/, renaming the maps to canonical names and writing a
 * manifest.json the runtime loader (src/core/Assets.ts) reads.
 *
 *   npm run assets            # download everything (idempotent — skips existing)
 *   npm run assets -- --force # re-download even if present
 *
 * public/textures/ is gitignored; this script makes the set reproducible.
 */
import { mkdirSync, existsSync, writeFileSync, readdirSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import extract from "extract-zip";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "public", "textures");
const MODELS_OUT = join(ROOT, "public", "models");
const FORCE = process.argv.includes("--force");
const RES = "2K-JPG";

// logical prop kind (PropDef.kind in src/world/data.ts) -> Poly Haven CC0 model id
const MODELS = [
  { kind: "crates", id: "wooden_crate_02" },
  { kind: "barrel", id: "Barrel_02" },
  { kind: "desk", id: "metal_office_desk" },
  { kind: "bench", id: "painted_wooden_bench" }
];
const MODEL_RES = "1k";

// logical material name -> ambientCG asset id. All CC0.
const ASSETS = [
  { name: "wall", id: "Concrete034" },
  { name: "floor", id: "Concrete036" },
  { name: "metal", id: "MetalPlates006" },
  { name: "rust", id: "Rust004" },
  { name: "wood", id: "Planks016" },
  { name: "tile", id: "Tiles074" }
];

// ambientCG map suffix -> our canonical file name (others are ignored)
const MAP_SUFFIX = {
  _Color: "albedo",
  _NormalGL: "normal",
  _Roughness: "roughness",
  _AmbientOcclusion: "ao",
  _Metalness: "metalness",
  _Displacement: "disp"
};

async function fetchOne(a) {
  const destDir = join(OUT, a.name);
  if (!FORCE && existsSync(join(destDir, "albedo.jpg"))) {
    console.log(`skip ${a.name} (already present)`);
    return readManifestDir(destDir);
  }
  const url = `https://ambientcg.com/get?file=${a.id}_${RES}.zip`;
  console.log(`download ${a.name} <- ${a.id}_${RES}.zip`);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${a.id}: HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());

  const tmp = join(OUT, `_tmp_${a.id}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const zipPath = join(tmp, "a.zip");
  writeFileSync(zipPath, buf);
  await extract(zipPath, { dir: tmp });

  mkdirSync(destDir, { recursive: true });
  const maps = [];
  for (const f of readdirSync(tmp)) {
    if (!/\.(jpg|jpeg|png)$/i.test(f)) continue;
    for (const [suffix, canon] of Object.entries(MAP_SUFFIX)) {
      if (f.includes(suffix)) {
        copyFileSync(join(tmp, f), join(destDir, `${canon}.jpg`));
        maps.push(canon);
        break;
      }
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log(`  ${a.name}: ${maps.join(", ")}`);
  return maps;
}

function readManifestDir(destDir) {
  const maps = [];
  for (const [, canon] of Object.entries(MAP_SUFFIX)) {
    if (existsSync(join(destDir, `${canon}.jpg`))) maps.push(canon);
  }
  return maps;
}

async function dl(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
}

// Poly Haven (CC0) glTF models are multi-file (.gltf + .bin + textures/); we
// mirror the relative layout so three's GLTFLoader resolves them.
async function fetchModel(m) {
  const destDir = join(MODELS_OUT, m.kind);
  const r = await fetch(`https://api.polyhaven.com/files/${m.id}`);
  if (!r.ok) throw new Error(`${m.id}: HTTP ${r.status}`);
  const g = (await r.json()).gltf?.[MODEL_RES]?.gltf;
  if (!g?.url) throw new Error(`${m.id}: no ${MODEL_RES} gltf`);
  const gltfName = basename(g.url);
  if (!FORCE && existsSync(join(destDir, gltfName))) {
    console.log(`skip model ${m.kind} (already present)`);
    return `/models/${m.kind}/${gltfName}`;
  }
  console.log(`download model ${m.kind} <- ${m.id}`);
  await dl(g.url, join(destDir, gltfName));
  for (const [rel, info] of Object.entries(g.include || {})) {
    if (info?.url) await dl(info.url, join(destDir, rel));
  }
  return `/models/${m.kind}/${gltfName}`;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const manifest = {};
  for (const a of ASSETS) {
    try {
      manifest[a.name] = { id: a.id, maps: await fetchOne(a) };
    } catch (e) {
      console.error(`FAILED ${a.name}: ${e.message}`);
    }
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  mkdirSync(MODELS_OUT, { recursive: true });
  const modelManifest = {};
  for (const m of MODELS) {
    try {
      modelManifest[m.kind] = { id: m.id, path: await fetchModel(m) };
    } catch (e) {
      console.error(`FAILED model ${m.kind}: ${e.message}`);
    }
  }
  writeFileSync(join(MODELS_OUT, "manifest.json"), JSON.stringify(modelManifest, null, 2));

  // the creature: a rigged humanoid ("Xbot", Mixamo) shipped with three.js
  // examples — featureless mannequin we redress as the gaunt thing in the dark.
  const creatureDest = join(MODELS_OUT, "creature", "creature.glb");
  if (FORCE || !existsSync(creatureDest)) {
    try {
      console.log("download creature <- three.js Xbot.glb");
      await dl("https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Xbot.glb", creatureDest);
    } catch (e) {
      console.error(`FAILED creature: ${e.message}`);
    }
  } else {
    console.log("skip creature (already present)");
  }

  const credits = [
    "# Asset credits",
    "",
    "All assets are CC0 (public domain). No attribution is legally required;",
    "listed here as courtesy.",
    "",
    "## PBR materials — ambientCG (https://ambientcg.com)",
    "",
    ...ASSETS.map((a) => `- ${a.name}: ${a.id} (${RES}) — https://ambientcg.com/view?id=${a.id}`),
    "",
    "## Models — Poly Haven (https://polyhaven.com)",
    "",
    ...MODELS.map((m) => `- ${m.kind}: ${m.id} (${MODEL_RES}) — https://polyhaven.com/a/${m.id}`),
    "",
    "## Creature rig — Mixamo via three.js examples (royalty-free)",
    "",
    "- creature: Xbot.glb (rigged humanoid mannequin) — github.com/mrdoob/three.js/tree/dev/examples/models/gltf"
  ].join("\n");
  writeFileSync(join(ROOT, "CREDITS.md"), credits + "\n");
  console.log("wrote manifest.json + CREDITS.md");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
