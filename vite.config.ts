import { defineConfig } from "vite";

const BABYLON_SIDE_EFFECTS = [
  "@babylonjs/core/Culling/ray",
  "@babylonjs/core/Collisions/collisionCoordinator",
  "@babylonjs/core/Particles/particleSystemComponent",
  "@babylonjs/core/Rendering/edgesRenderer",
  "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent",
  "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput",
  "@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput",
  "@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput",
  "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent",
  "@babylonjs/core/Rendering/prePassRendererSceneComponent",
  "@babylonjs/core/Rendering/geometryBufferRendererSceneComponent",
  "@babylonjs/core/Rendering/depthRendererSceneComponent"
];

export default defineConfig({
  base: "./",
  server: {
    port: 5173,
    open: false
  },
  build: {
    target: "es2022",
    sourcemap: true
  },
  optimizeDeps: {
    include: BABYLON_SIDE_EFFECTS
  }
});
