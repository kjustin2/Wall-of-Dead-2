# Engine Notes

Wall of Dead 2 uses Babylon.js through Vite and Electron.

- `src/engine/babylonSideEffects.ts` is imported before other Babylon modules.
- `src/engine/BabylonRuntimeCheck.ts` probes side-effect-sensitive APIs in browser and NullEngine tests.
- `src/engine/Quality.ts` gates expensive visuals such as SSAO, high shadow maps, bloom, and volumetric-style effects.
- The world is authored as connected `ZoneDef` records. The player moves through doors and route choices inside the 3D scene.
- Tests use Babylon `NullEngine` where possible so content and runtime wiring fail before manual play.

The implementation intentionally favors procedural meshes and texture generation for performance and iteration speed.
