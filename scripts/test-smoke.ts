import { existsSync } from "node:fs";
import { ZONES, ZONE_BY_ID, WEAPONS, ENEMIES, STARTING_INVENTORY } from "../src/data/content";

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok ${label}`);
  else {
    failures++;
    console.error(`  fail ${label}`);
  }
}

console.log("[test-smoke] content integrity");
check(ZONES.length >= 8, "campaign has at least eight zones");
check(ZONE_BY_ID.approach_road.id === "approach_road", "campaign starts on the intake road");
check(!("dream_room" in ZONE_BY_ID), "dream wake start has been removed");
check(ZONE_BY_ID.apartment.id === "apartment", "Building A intake zone exists");
check(ZONE_BY_ID.freedom.isEnding, "freedom ending zone exists");
check(STARTING_INVENTORY.length === 1 && STARTING_INVENTORY[0] === "bat", "player starts with bat only");
check(ZONE_BY_ID.approach_road.enemies.length === 0, "intake road starts with no direct enemies");
check(ZONE_BY_ID.apartment.enemies.length === 0, "apartment starts with no direct enemies");
check(ZONE_BY_ID.crypt.enemies.length === 0, "Patient Zero is staged by scare instead of pre-spawned");
check(ZONE_BY_ID.garage.interactables.some((i) => i.payload?.weapons?.includes("pistol")), "garage contains first pistol pickup");
check(ZONE_BY_ID.pharmacy.interactables.some((i) => i.payload?.weapons?.includes("shotgun")), "pharmacy contains shotgun pickup");
check(ZONE_BY_ID.subway.interactables.some((i) => i.payload?.weapons?.includes("flare")), "subway contains flare pickup");
check(ZONE_BY_ID.boiler.interactables.some((i) => i.payload?.weapons?.includes("pipebomb")), "boiler contains pipe bomb pickup");
check(existsSync("public/assets/generated/wod2-intake-signage-atlas.png"), "generated intake signage atlas exists");
check(existsSync("public/assets/generated/wod2-triage-prop-atlas.png"), "generated triage prop atlas exists");
check(existsSync("public/assets/generated/wod2-enemy-skin-atlas.png"), "generated enemy skin atlas exists");
for (const [id, weapon] of Object.entries(WEAPONS)) {
  check(weapon.id === id, `weapon ${id} id matches key`);
  check(weapon.damage > 0, `weapon ${id} has damage`);
  check(weapon.range > 0, `weapon ${id} has range`);
  check(weapon.fireRate > 0, `weapon ${id} has fire rate`);
  if (weapon.ammoType !== "none") check(weapon.startReserve <= weapon.magSize * 8, `weapon ${id} reserve is scarce`);
}
for (const [id, enemy] of Object.entries(ENEMIES)) {
  check(enemy.kind === id, `enemy ${id} kind matches key`);
  check(enemy.hp > 0 && enemy.speed > 0, `enemy ${id} has hp and speed`);
}
for (const zone of ZONES) {
  check(zone.width >= 20 && zone.depth >= 16, `${zone.id} has playable dimensions`);
  check(zone.objective.length > 0, `${zone.id} has objective`);
  check(zone.objective !== "Keep walking.", `${zone.id} objective is specific`);
  check(zone.enemies.length <= 1, `${zone.id} keeps starting enemies scarce`);
  const hasCinematicBeat =
    (zone.intro ?? []).some((beat) => beat.cinematic) ||
    zone.scares.some((scare) => (scare.beats ?? []).some((beat) => beat.cinematic));
  if (!zone.isEnding) check(hasCinematicBeat, `${zone.id} has an authored cinematic beat`);
  for (const supply of zone.interactables.filter((i) => !!i.payload)) {
    check(!("battery" in (supply.payload as object)), `${zone.id}.${supply.id} does not grant flashlight power`);
  }
  for (const door of zone.interactables.filter((i) => i.kind === "door")) {
    check(!!door.targetZone, `${zone.id}.${door.id} has target zone`);
    check(!door.targetZone || !!ZONE_BY_ID[door.targetZone], `${zone.id}.${door.id} target exists`);
  }
  for (const scare of zone.scares) {
    check(!!scare.id && !!scare.action, `${zone.id} scare ${scare.id} has action`);
    check(scare.sound !== "rat_skitter" && scare.sound !== "music_box", `${zone.id} scare ${scare.id} uses scary sound palette`);
    check((scare.spawns?.length ?? 0) <= 1, `${zone.id} scare ${scare.id} spawns at most one enemy`);
    if (scare.trigger === "interact") {
      check(zone.interactables.some((i) => i.id === scare.interactId), `${zone.id} scare ${scare.id} references interactable`);
    }
    for (const spawn of scare.spawns ?? []) {
      check(!!ENEMIES[spawn.kind], `${zone.id} scare ${scare.id} spawn kind exists`);
      check(Math.abs(spawn.x) <= zone.width / 2 && Math.abs(spawn.z) <= zone.depth / 2, `${zone.id} scare ${scare.id} spawn is inside zone`);
    }
    for (const beat of scare.beats ?? []) {
      check(beat.after > 0, `${zone.id} scare ${scare.id} beat is scheduled`);
      check(beat.sound !== "rat_skitter" && beat.sound !== "music_box", `${zone.id} scare ${scare.id} beat uses scary sound palette`);
      check((beat.spawns?.length ?? 0) <= 1, `${zone.id} scare ${scare.id} beat spawns at most one enemy`);
      for (const spawn of beat.spawns ?? []) {
        check(!!ENEMIES[spawn.kind], `${zone.id} scare ${scare.id} beat spawn kind exists`);
        check(Math.abs(spawn.x) <= zone.width / 2 && Math.abs(spawn.z) <= zone.depth / 2, `${zone.id} scare ${scare.id} beat spawn is inside zone`);
      }
    }
  }
  for (const beat of zone.intro ?? []) {
    check(beat.after >= 0, `${zone.id} intro beat is scheduled`);
    check(beat.sound !== "rat_skitter" && beat.sound !== "music_box", `${zone.id} intro beat uses scary sound palette`);
  }
}
check(ZONES.filter((zone) => zone.scares.some((s) => (s.beats?.length ?? 0) > 0)).length >= 3, "campaign has at least three sequenced scare setups");

if (failures > 0) process.exit(1);
console.log("[test-smoke] OK");
