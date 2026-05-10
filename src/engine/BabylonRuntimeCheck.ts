import { Scene } from "@babylonjs/core/scene";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { SSAO2RenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/ssao2RenderingPipeline";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";

const CLASS_TO_IMPORT: Record<string, string> = {
  Ray: "@babylonjs/core/Culling/ray",
  DefaultCollisionCoordinator: "@babylonjs/core/Collisions/collisionCoordinator",
  ParticleSystem: "@babylonjs/core/Particles/particleSystemComponent",
  ShadowGenerator: "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent",
  DefaultRenderingPipeline: "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent",
  PrePassRenderer: "@babylonjs/core/Rendering/prePassRendererSceneComponent",
  GeometryBufferRenderer: "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent",
  DepthRenderer: "@babylonjs/core/Rendering/depthRendererSceneComponent"
};

function importHintFromError(message: string): string | null {
  const match = /^(\w+) needs to be imported before/.exec(message);
  return match ? CLASS_TO_IMPORT[match[1]] ?? null : null;
}

export function validateBabylonRuntime(scene: Scene, camera: Camera): void {
  const failures: string[] = [];

  function probe(label: string, fn: () => unknown, fallbackHint: string): void {
    try {
      fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const hint = importHintFromError(msg) ?? fallbackHint;
      failures.push(`${label}: ${msg} | import ${hint}`);
    }
  }

  probe("camera.getForwardRay", () => camera.getForwardRay(), "@babylonjs/core/Culling/ray");
  probe("scene.pick", () => scene.pick(0, 0, () => false), "@babylonjs/core/Culling/ray");
  probe("scene.createPickingRay", () => scene.createPickingRay(0, 0, null, camera), "@babylonjs/core/Culling/ray");
  probe(
    "scene.collisionCoordinator",
    () => (scene as unknown as { collisionCoordinator: unknown }).collisionCoordinator,
    "@babylonjs/core/Collisions/collisionCoordinator"
  );
  probe(
    "ParticleSystem.start",
    () => {
      const ps = new ParticleSystem("__probeParticles", 1, scene);
      ps.start();
      ps.stop();
      ps.dispose();
    },
    "@babylonjs/core/Particles/particleSystemComponent"
  );
  probe(
    "SSAO2RenderingPipeline",
    () => {
      const ssao = new SSAO2RenderingPipeline("__probeSsao", scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
      ssao.dispose();
    },
    "@babylonjs/core/Rendering/prePassRendererSceneComponent"
  );
  probe(
    "mesh edges renderer",
    () => {
      const box = MeshBuilder.CreateBox("__probeEdges", { size: 1 }, scene);
      box.enableEdgesRendering();
      box.dispose();
    },
    "@babylonjs/core/Rendering/edgesRenderer"
  );

  if (failures.length > 0) {
    throw new Error(`[BabylonRuntimeCheck] ${failures.length} probe(s) failed:\n${failures.join("\n")}`);
  }
}
