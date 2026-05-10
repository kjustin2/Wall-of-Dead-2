import { ZONE_BY_ID } from "../src/data/content";

let failures = 0;
function check(cond: unknown, label: string): void {
  if (cond) console.log(`  ok ${label}`);
  else {
    failures++;
    console.error(`  fail ${label}`);
  }
}

function walk(path: string[]): string {
  let current = "approach_road";
  for (const next of path) {
    const zone = ZONE_BY_ID[current];
    const door = zone.interactables.find((i) => i.kind === "door" && i.targetZone === next);
    check(!!door, `${current} connects to ${next}`);
    if (!door) break;
    current = next;
  }
  return current;
}

console.log("[test-campaign] route graph");
check(walk(["apartment", "garage", "pharmacy", "boiler", "crypt", "freedom"]) === "freedom", "pharmacy route reaches ending");
check(walk(["apartment", "garage", "subway", "maintenance_escape", "boiler", "crypt", "freedom"]) === "freedom", "subway escape route reaches ending");
check(ZONE_BY_ID.approach_road.scares.some((s) => s.beats?.some((beat) => beat.cinematic)), "intake road opens with a staged approach");
check(ZONE_BY_ID.garage.scares.some((s) => s.beats?.some((beat) => beat.spawns?.some((spawn) => spawn.kind === "runner"))), "first contact is delayed until the garage");
check(ZONE_BY_ID.crypt.interactables.some((i) => i.id === "door_freedom" && i.lockedUntil === "gate_open"), "crypt gate starts locked by story flag");
check(ZONE_BY_ID.crypt.scares.some((s) => s.action === "openGate"), "crypt has gate-opening scare");
check(ZONE_BY_ID.crypt.scares.some((s) => s.action === "patientStalk" && s.spawns?.some((spawn) => spawn.kind === "patient_zero")), "Patient Zero is an authored reveal");
check(ZONE_BY_ID.subway.scares.some((s) => s.action === "startChase"), "subway has a forced chase trigger");
check(!!ZONE_BY_ID.maintenance_escape, "maintenance escape zone exists");
check(
  ZONE_BY_ID.maintenance_escape.interactables.filter((i) => i.kind === "seal").length >= 3,
  "maintenance escape has close-behind doors"
);
check(
  ZONE_BY_ID.maintenance_escape.interactables.some((i) => i.id === "door_boiler_from_escape" && i.lockedUntil === "escape_sealed"),
  "maintenance escape locks boiler exit until the corridor is sealed"
);
check(
  Object.values(ZONE_BY_ID).filter((zone) => zone.scares.some((s) => s.action === "startChase" && (s.spawns?.length ?? 0) > 0)).length >= 2,
  "campaign has at least two authored chase sequences"
);
check(
  Object.values(ZONE_BY_ID).filter((zone) => zone.scares.some((s) => (s.beats?.length ?? 0) >= 2)).length >= 3,
  "campaign has multiple multi-beat scares"
);
check(
  Object.values(ZONE_BY_ID).filter((zone) => (zone.intro ?? []).some((beat) => beat.cinematic)).length >= 6,
  "campaign uses cutscene beats to set the scene"
);

if (failures > 0) process.exit(1);
console.log("[test-campaign] OK");
