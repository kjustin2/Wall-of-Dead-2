import "../src/engine/babylonSideEffects";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { validateBabylonRuntime } from "../src/engine/BabylonRuntimeCheck";

const engine = new NullEngine({
  renderWidth: 256,
  renderHeight: 256,
  textureSize: 256,
  deterministicLockstep: false,
  lockstepMaxSteps: 1
});
const scene = new Scene(engine);
const camera = new ArcRotateCamera("probeCam", Math.PI * 0.5, Math.PI * 0.4, 8, new Vector3(0, 1, 0), scene);
camera.checkCollisions = true;
camera.collisionRadius = new Vector3(0.6, 0.6, 0.6);

validateBabylonRuntime(scene, camera);

scene.dispose();
engine.dispose();
console.log("[verify-babylon-runtime] OK");
