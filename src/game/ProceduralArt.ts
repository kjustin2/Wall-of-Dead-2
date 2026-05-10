import { Scene } from "@babylonjs/core/scene";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { EnemyKind } from "../data/content";

export const GENERATED_ASSET_BASE = "./assets/generated/";

function colorToCss(c: Color3, alpha = 1): string {
  const r = Math.round(c.r * 255);
  const g = Math.round(c.g * 255);
  const b = Math.round(c.b * 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function makeMat(scene: Scene, name: string, color: Color3, emissive?: Color3): StandardMaterial {
  const mat = new StandardMaterial(name, scene);
  mat.diffuseColor = color;
  mat.specularColor = new Color3(0.05, 0.045, 0.04);
  mat.emissiveColor = emissive ?? new Color3(0, 0, 0);
  return mat;
}

export function makeGeneratedMaterial(scene: Scene, name: string, fileName: string, alpha = 1): StandardMaterial {
  const mat = makeMat(scene, name, new Color3(0.78, 0.74, 0.68), new Color3(0.01, 0.008, 0.006));
  if (typeof document === "undefined") {
    mat.alpha = alpha;
    return mat;
  }
  const tex = new Texture(`${GENERATED_ASSET_BASE}${fileName}`, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  tex.uScale = 1;
  tex.vScale = 1;
  mat.diffuseTexture = tex;
  mat.alpha = alpha;
  mat.backFaceCulling = false;
  return mat;
}

export function makeEnemyMaterial(scene: Scene, name: string, kind: EnemyKind, color: Color3, emissive: Color3): StandardMaterial {
  const mat = makeMat(scene, name, color, emissive);
  mat.specularColor = new Color3(0.018, 0.015, 0.012);
  if (typeof document === "undefined") return mat;
  const tex = new DynamicTexture(`${name}Tex`, { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = colorToCss(color);
  ctx.fillRect(0, 0, 512, 512);

  const stain = kind === "patient_zero" ? "rgba(98,10,8," : kind === "spitter" ? "rgba(76,95,22," : "rgba(18,13,11,";
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 4 + Math.random() * 80;
    const h = 2 + Math.random() * 22;
    ctx.fillStyle = `${stain}${0.08 + Math.random() * 0.20})`;
    ctx.fillRect(x, y, w, h);
  }

  ctx.strokeStyle = kind === "screamer" || kind === "runner" ? "rgba(205,174,122,0.28)" : "rgba(26,18,15,0.38)";
  for (let i = 0; i < 38; i++) {
    ctx.lineWidth = 1 + Math.random() * 5;
    ctx.beginPath();
    const sx = Math.random() * 512;
    const sy = Math.random() * 512;
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + Math.random() * 110 - 55, sy + 20 + Math.random() * 120, sx + Math.random() * 120 - 60, sy + 80 + Math.random() * 160, sx + Math.random() * 140 - 70, sy + 160 + Math.random() * 210);
    ctx.stroke();
  }

  if (kind === "brute" || kind === "patient_zero") {
    ctx.fillStyle = "rgba(28,8,6,0.42)";
    for (let i = 0; i < 9; i++) ctx.fillRect(70 + i * 42, 70 + (i % 2) * 16, 22, 360);
  } else if (kind === "crawler") {
    ctx.fillStyle = "rgba(215,199,151,0.20)";
    for (let i = 0; i < 16; i++) ctx.fillRect(20 + i * 31, 330 + Math.sin(i) * 14, 18, 4);
  }

  tex.update();
  mat.diffuseTexture = tex;
  const atlas = new Texture(`${GENERATED_ASSET_BASE}wod2-enemy-skin-atlas.png`, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  atlas.uScale = kind === "patient_zero" || kind === "brute" ? 0.7 : 1;
  atlas.vScale = kind === "crawler" ? 0.55 : 1;
  mat.ambientTexture = atlas;
  return mat;
}

export function makeGrimeMaterial(scene: Scene, name: string, base: Color3, accent: Color3): StandardMaterial {
  const mat = makeMat(scene, name, base);
  if (typeof document === "undefined") return mat;
  const generated = new Texture(`${GENERATED_ASSET_BASE}wod2-texture-atlas-concrete.png`, scene, true, false, Texture.TRILINEAR_SAMPLINGMODE);
  generated.uScale = name.includes("floor") ? 4 : 2;
  generated.vScale = name.includes("floor") ? 4 : 2;
  mat.diffuseTexture = generated;
  const tex = new DynamicTexture(`${name}Tex`, { width: 512, height: 512 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = colorToCss(base);
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 520; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const w = 1 + Math.random() * 18;
    const h = 1 + Math.random() * 10;
    ctx.fillStyle = colorToCss(accent, 0.05 + Math.random() * 0.18);
    ctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.16})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(Math.random() * 512, Math.random() * 512);
    ctx.lineTo(Math.random() * 512, Math.random() * 512);
    ctx.stroke();
  }
  tex.update();
  if (!name.includes("floor") && !name.includes("wall")) mat.diffuseTexture = tex;
  return mat;
}

export function makePosterMaterial(scene: Scene, name: string, text: string): StandardMaterial {
  const mat = makeMat(scene, name, new Color3(0.45, 0.36, 0.25), new Color3(0.025, 0.012, 0.006));
  if (typeof document === "undefined") return mat;
  const tex = new DynamicTexture(`${name}Tex`, { width: 512, height: 768 }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = "#241a14";
  ctx.fillRect(0, 0, 512, 768);
  ctx.fillStyle = "#b9a77d";
  ctx.fillRect(30, 34, 452, 700);
  ctx.fillStyle = "#4a1414";
  ctx.fillRect(48, 56, 416, 120);
  ctx.fillStyle = "#f0ddaa";
  ctx.font = "bold 42px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 132);
  ctx.fillStyle = "#221814";
  ctx.font = "bold 28px sans-serif";
  ctx.fillText("DO NOT STOP", 256, 260);
  ctx.fillText("DO NOT ANSWER", 256, 320);
  ctx.fillText("THE TUNNELS", 256, 380);
  ctx.strokeStyle = "rgba(40,0,0,0.55)";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(70, 620);
  ctx.bezierCurveTo(150, 570, 250, 720, 430, 590);
  ctx.stroke();
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.18})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 768, 2 + Math.random() * 24, 1 + Math.random() * 12);
  }
  tex.update();
  mat.diffuseTexture = tex;
  mat.emissiveColor = new Color3(0.02, 0.012, 0.006);
  return mat;
}
