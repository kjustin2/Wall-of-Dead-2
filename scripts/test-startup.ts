import "../src/engine/babylonSideEffects";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { WorldBuilder } from "../src/game/WorldBuilder";
import { Player } from "../src/game/Player";
import { EnemyManager } from "../src/game/Enemies";
import { ZONE_BY_ID } from "../src/data/content";
import { moveCircleWithColliders } from "../src/game/Collision";

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok ${label}`);
  else {
    failures++;
    console.error(`  fail ${label}`);
  }
}

const engine = new NullEngine({
  renderWidth: 512,
  renderHeight: 256,
  textureSize: 256,
  deterministicLockstep: false,
  lockstepMaxSteps: 1
});
const scene = new Scene(engine);
new HemisphericLight("hemi", new Vector3(0, 1, 0), scene);
const sun = new DirectionalLight("sun", new Vector3(-0.4, -1, -0.2), scene);
const shadow = new ShadowGenerator(512, sun);

console.log("[test-startup] construct world, player, enemies");
const world = new WorldBuilder(scene, shadow).build(ZONE_BY_ID.apartment);
const player = new Player(scene, shadow);
const enemies = new EnemyManager(scene, shadow);
enemies.spawnAll(ZONE_BY_ID.apartment.enemies);

check(!!world.floor, "floor mesh exists");
check(world.walls.length === ZONE_BY_ID.apartment.walls.length, "runtime walls mirror authored walls");
check(world.colliders.length > world.walls.length, "runtime colliders include bounds and solid props");
check(world.interactables.length === ZONE_BY_ID.apartment.interactables.length, "interactables built");
check(!!player.body && !!player.weapon, "player built with visible body and weapon");
check(enemies.aliveCount() === ZONE_BY_ID.apartment.enemies.length, "enemies spawned");

const wallTest = { x: -6.2, z: -1.0 };
moveCircleWithColliders(wallTest, { x: -1.2, z: 0 }, player.radius, ZONE_BY_ID.apartment, world.colliders);
check(wallTest.x >= -8.2 + 0.4 + player.radius, "movement resolver blocks authored walls");

const boundTest = { x: 13.2, z: 0 };
moveCircleWithColliders(boundTest, { x: 4.0, z: 0 }, player.radius, ZONE_BY_ID.apartment, world.colliders);
check(boundTest.x <= ZONE_BY_ID.apartment.width / 2 - player.radius - 0.6, "movement resolver blocks outer bounds");

const propTest = { x: -4.0, z: -5.6 };
moveCircleWithColliders(propTest, { x: -1.2, z: 0 }, player.radius, ZONE_BY_ID.apartment, world.colliders);
check(propTest.x >= -5.8 + 0.9 + player.radius, "movement resolver blocks solid props");

let damaged = false;
for (let i = 0; i < 30; i++) {
  enemies.update(1 / 60, player, {
    onPlayerDamaged: () => { damaged = true; },
    onEnemyKilled: () => undefined,
    onScream: () => undefined,
    clampPosition: () => undefined
  });
}
check(!damaged, "startup enemies do not instantly damage player");

world.dispose();
player.dispose();
enemies.clear();
scene.dispose();
engine.dispose();

if (failures > 0) process.exit(1);
console.log("[test-startup] OK");
