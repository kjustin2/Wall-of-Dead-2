import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { getQuality } from "./Quality";

export interface SceneBundle {
  engine: Engine;
  scene: Scene;
  shadow: ShadowGenerator;
  moon: DirectionalLight;
  ambient: HemisphericLight;
  playerLight: PointLight;
  flashlight: SpotLight;
  attachPostFx(camera: Camera): DefaultRenderingPipeline;
  setDreadVisuals(dread: number, damageFlash: number): void;
  disposeHeavyFx(): void;
}

export function createSceneBundle(canvas: HTMLCanvasElement): SceneBundle {
  const q = getQuality();
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    powerPreference: "high-performance"
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.006, 0.006, 0.01, 1);
  scene.ambientColor = new Color3(0.08, 0.075, 0.07);
  scene.collisionsEnabled = true;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = q.fogDensity;
  scene.fogColor = new Color3(0.025, 0.022, 0.027);

  const ambient = new HemisphericLight("deadSky", new Vector3(0, 1, 0), scene);
  ambient.intensity = 0.16;
  ambient.diffuse = new Color3(0.45, 0.48, 0.52);
  ambient.groundColor = new Color3(0.05, 0.035, 0.035);

  const moon = new DirectionalLight("deadMoon", new Vector3(-0.25, -1, -0.18).normalize(), scene);
  moon.position = new Vector3(24, 40, 18);
  moon.intensity = 0.74;
  moon.diffuse = new Color3(0.66, 0.72, 0.82);

  const shadow = new ShadowGenerator(q.shadowMapSize, moon);
  shadow.useBlurExponentialShadowMap = true;
  shadow.blurKernel = q.shadowBlurKernel;
  shadow.darkness = 0.58;
  const shadowMap = shadow.getShadowMap();
  if (shadowMap) shadowMap.refreshRate = q.shadowRefreshRate;

  const playerLight = new PointLight("flashlightPool", new Vector3(0, 2.1, 0), scene);
  playerLight.intensity = 1.0;
  playerLight.range = 12;
  playerLight.diffuse = new Color3(1.0, 0.88, 0.68);

  const flashlight = new SpotLight("flashlightCone", new Vector3(0, 1.3, 0), new Vector3(0, -0.08, 1), Math.PI * 0.18, 8, scene);
  flashlight.diffuse = new Color3(1.0, 0.84, 0.58);
  flashlight.specular = new Color3(0.6, 0.48, 0.32);
  flashlight.range = 18;
  flashlight.intensity = 2.4;

  let pipeline: DefaultRenderingPipeline | null = null;
  let ssao: SSAO2RenderingPipeline | null = null;

  function attachPostFx(camera: Camera): DefaultRenderingPipeline {
    pipeline = new DefaultRenderingPipeline("wod2Pipeline", true, scene, [camera]);
    pipeline.fxaaEnabled = true;
    pipeline.bloomEnabled = q.bloomEnabled;
    pipeline.bloomThreshold = 0.72;
    pipeline.bloomWeight = 0.18;
    pipeline.bloomKernel = q.bloomKernel;
    pipeline.imageProcessing.contrast = 1.34;
    pipeline.imageProcessing.exposure = 0.78;
    pipeline.imageProcessing.vignetteEnabled = true;
    pipeline.imageProcessing.vignetteWeight = 2.35;
    pipeline.imageProcessing.vignetteColor = new Color4(0, 0, 0, 1);
    if (q.ssaoEnabled) {
      ssao = new SSAO2RenderingPipeline("wod2Ssao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
      ssao.radius = 1.15;
      ssao.totalStrength = 1.1;
      ssao.samples = 8;
      ssao.expensiveBlur = false;
    }
    return pipeline;
  }

  function setDreadVisuals(dread: number, damageFlash: number): void {
    if (!pipeline) return;
    const d = Math.max(0, Math.min(1, dread));
    const f = Math.max(0, Math.min(1, damageFlash));
    pipeline.imageProcessing.vignetteWeight = 2.55 + d * 1.75 + f * 0.6;
    pipeline.imageProcessing.exposure = 0.78 - d * 0.20 + f * 0.08;
    pipeline.imageProcessing.contrast = 1.32 + d * 0.28;
    pipeline.bloomWeight = q.bloomEnabled ? 0.14 + d * 0.18 + f * 0.22 : 0;
  }

  function disposeHeavyFx(): void {
    ssao?.dispose();
    ssao = null;
  }

  window.addEventListener("resize", () => engine.resize());

  return { engine, scene, shadow, moon, ambient, playerLight, flashlight, attachPostFx, setDreadVisuals, disposeHeavyFx };
}
