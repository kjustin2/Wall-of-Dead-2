/**
 * PERF — the performance gate the harness was missing.
 *
 * Cuts to every debug scenario (no playthrough), samples a window of real frames
 * via the in-game `window.__game.perf` instrument, and records the deterministic
 * GPU workload (draw calls, triangles, geometries, textures, programs) plus the
 * CPU/render time split and JS heap. It also runs a per-scenario HEALTH probe that
 * catches the kind of bug a screenshot won't: NaN transforms, objects fallen through
 * the floor, runaway draw counts, console/page errors.
 *
 * Cross-run, the numbers that matter headless are renderer.info + cpu ms — they're
 * deterministic under SwiftShader, where wall-clock fps is software-bound and only
 * comparable to itself. So perf.mjs diffs against a saved BASELINE and flags what an
 * optimisation moved (▼ better) or a regression inflated (▲ worse).
 *
 *   node agent/perf.mjs                         # profile every beat, compare to baseline
 *   node agent/perf.mjs --save-baseline         # record the current run AS the baseline
 *   node agent/perf.mjs --url http://localhost:5173 --out agent/runs/perf --frames 60
 *   node agent/perf.mjs --strict                # exit 1 if a budget or health check fails
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, DEFAULT_URL, sleep, launch, idle, beginRun } from "./lib.mjs";

const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

const URL = opt("url", DEFAULT_URL);
const OUT = opt("out", join(ROOT, "agent", "runs", "perf"));
const FRAMES = Number(opt("frames", "70"));           // min frames to sample per scenario
const SAMPLE_MS = Number(opt("ms", "2200"));          // real-time sampling budget per scenario
const BASELINE = opt("baseline", join(ROOT, "agent", "perf-baseline.json"));
const SAVE_BASELINE = flag("save-baseline");
const STRICT = flag("strict");
const SHOT = !flag("no-shots");
mkdirSync(OUT, { recursive: true });

// Draw-call / triangle budgets — a soft gate. Tune as the scene grows; the point is
// that a 10x jump in either (a forgotten clone-in-a-loop, an un-culled group) fails
// loudly instead of silently tanking the framerate on a real GPU.
const BUDGET = { calls: 420, triangles: 1_600_000, textures: 90, programs: 80 };

const { browser, page, errors } = await launch();
const scenarios = [];

/** in-page health probe — the bugs a perf screenshot can't show */
async function health(page, beat) {
  return page.evaluate((beat) => {
    const g = window.__game;
    const issues = [];
    const finite = (v) => typeof v === "number" && Number.isFinite(v);
    const chk = (cond, msg) => { if (!cond) issues.push(msg); };

    // 1. no NaN/Infinity in the things that drive the camera + AI
    chk(finite(g.player.x) && finite(g.player.z) && finite(g.player.yaw) && finite(g.player.pitch), "player transform not finite");
    chk(finite(g.stalker.x) && finite(g.stalker.z), "stalker position not finite");
    chk(finite(g.player.battery) && g.player.battery >= 0 && g.player.battery <= 1.001, "battery out of [0,1]");

    // 2. actors inside the level grid (caught a teleport-through-wall bug class).
    // Grid is 54x54 cells * CELL(2m) ≈ 108m; allow a small margin.
    const EXTENT = 116;
    const inWorld = (x, z) => x > -4 && z > -4 && x < EXTENT && z < EXTENT;
    chk(inWorld(g.player.x, g.player.z), "player outside world bounds");

    // 3. the creature mesh hasn't sunk through the floor or flown off
    const sg = g.stalker.group;
    if (sg) chk(sg.position.y > -2 && sg.position.y < 8, `stalker.group.y=${sg.position.y.toFixed(2)} out of range`);

    // 4. draw work is sane for a single first-person view (runaway = a bug)
    const info = g.perf ? g.perf.summary() : null;
    if (info) {
      chk(info.calls > 0, "zero draw calls (nothing rendering?)");
      chk(info.calls < 2000, `draw calls=${info.calls} unexpectedly high`);
      chk(info.triangles > 0, "zero triangles");
    }

    // 5. nothing in the scene graph has a NaN world position
    let nanNodes = 0;
    g.world.group.traverse?.((o) => { if (o.position && !(Number.isFinite(o.position.x) && Number.isFinite(o.position.y) && Number.isFinite(o.position.z))) nanNodes++; });
    chk(nanNodes === 0, `${nanNodes} scene nodes with NaN position`);

    return { beat, issues, calls: info?.calls ?? null };
  }, beat);
}

/** sample a window of frames for the current scenario */
async function sample(page) {
  await page.evaluate(() => window.__game.perf.reset());
  const t0 = Date.now();
  // poll until we've collected enough frames OR the time budget elapses (headless
  // SwiftShader is slow + dt-capped, so never block on a fixed frame target alone)
  while (Date.now() - t0 < SAMPLE_MS) {
    const n = await page.evaluate(() => window.__game.perf.summary().frames);
    if (n >= FRAMES && Date.now() - t0 > 600) break;
    await sleep(120);
  }
  return page.evaluate(() => window.__game.perf.summary());
}

try {
  await beginRun(page, URL);
  await page.waitForFunction(() => !!(window.__game && window.__game.perf && window.__game.debug), { timeout: 15000, polling: 100 });
  // Wait for ALL async GPU resources to settle before sampling so texture/geometry
  // counts are deterministic across runs (else the earliest beats sample mid-upload):
  //  - the loading note hides when assets.load() resolves + models are swapped in
  //  - the rigged creature GLB finishes parsing (mixer becomes non-null)
  await page.waitForFunction(() => document.getElementById("loadnote")?.classList.contains("hidden"), { timeout: 25000, polling: 200 }).catch(() => {});
  await page.waitForFunction(() => window.__game.stalker.mixer != null, { timeout: 20000, polling: 200 }).catch(() => {});
  await page.evaluate(() => window.__game.perf.setOverlay(true)); // numbers visible in the shots
  await sleep(1800); // let lazy texture uploads / shadow targets flush before the first beat

  const names = await page.evaluate(() => window.__game.debug.list());
  console.log(`perf: profiling ${names.length} scenarios @ ${URL}`);

  for (const beat of names) {
    const cut = await page.evaluate((n) => window.__game.debug.scenario(n), beat);
    if (!cut.ok) { console.log(`  - ${beat}: scenario unavailable, skipped`); continue; }
    await sleep(700); // let the beat settle (lights ramp, rig pose, overlays clear)
    const perf = await sample(page);
    const h = await health(page, beat);
    let file = null;
    if (SHOT) {
      file = `${beat}.png`;
      await page.screenshot({ path: join(OUT, file) });
    }
    scenarios.push({ beat, file, perf, health: h.issues });
    const over = [];
    if (perf.calls > BUDGET.calls) over.push(`calls>${BUDGET.calls}`);
    if (perf.triangles > BUDGET.triangles) over.push("tris");
    if (perf.textures > BUDGET.textures) over.push("tex");
    console.log(
      `  ${beat.padEnd(15)} calls ${String(perf.calls).padStart(4)}  tris ${(perf.triangles / 1000).toFixed(0).padStart(5)}k  ` +
      `cpu ${perf.cpuMs.toFixed(1)}ms  render ${perf.renderMs.toFixed(1)}ms  tex ${perf.textures} prog ${perf.programs}  ` +
      `${perf.frames}f${over.length ? "  ⚠ " + over.join(",") : ""}${h.issues.length ? "  ✗ " + h.issues.length + " health" : ""}`
    );
  }
} catch (e) {
  errors.push("perf exception: " + String(e.message || e));
  console.error(e);
} finally {
  await browser.close();
}

// ---------- aggregate, compare to baseline, report ----------
const result = {
  profiledAt: new Date().toISOString(),
  url: URL,
  note: "Headless SwiftShader: fps/ms are software-bound (compare to itself only). renderer.info (calls/tris/geo/tex/programs) and cpuMs are the deterministic cross-run signals.",
  budget: BUDGET,
  scenarios,
  errors
};
writeFileSync(join(OUT, "perf.json"), JSON.stringify(result, null, 2));

if (SAVE_BASELINE) {
  writeFileSync(BASELINE, JSON.stringify(result, null, 2));
  console.log(`perf: saved baseline -> ${BASELINE}`);
}

const baseline = !SAVE_BASELINE && existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : null;
const KEYS = [
  ["calls", "calls", 0], ["triangles", "tris", 0], ["geometries", "geo", 0],
  ["textures", "tex", 0], ["programs", "prog", 0], ["cpuMs", "cpu ms", 1], ["renderMs", "rend ms", 1]
];

function delta(cur, base, decimals) {
  if (base == null) return cur.toFixed(decimals); // no baseline yet — just show the value
  const d = cur - base;
  if (Math.abs(d) < (decimals ? 0.05 : 0.5)) return `${cur.toFixed(decimals)} =`;
  const arrow = d > 0 ? "▲" : "▼"; // ▲ = more work (worse), ▼ = less (better)
  return `${cur.toFixed(decimals)} ${arrow}${Math.abs(d).toFixed(decimals)}`;
}

let regressions = 0, improvements = 0, healthFails = 0, budgetFails = 0;
const rows = scenarios.map((s) => {
  const b = baseline?.scenarios?.find((x) => x.beat === s.beat)?.perf ?? null;
  const cells = KEYS.map(([k, , dec]) => {
    const cur = s.perf[k] ?? 0;
    const base = b ? b[k] : null;
    if (base != null) {
      const d = cur - base;
      if (k === "calls" || k === "triangles" || k === "textures" || k === "programs") {
        // tolerance absorbs ±2 frame-to-frame wobble (light/emissive toggles, frustum)
        // while still flagging a real change of any meaningful size
        const tol = Math.max(2, base * 0.04);
        if (d > tol) regressions++;
        else if (d < -tol) improvements++;
      }
    }
    return delta(cur, base, dec);
  });
  if (s.health.length) healthFails += s.health.length;
  const overBudget = s.perf.calls > BUDGET.calls || s.perf.triangles > BUDGET.triangles || s.perf.textures > BUDGET.textures;
  if (overBudget) budgetFails++;
  const flags = [];
  if (overBudget) flags.push("⚠ budget");
  if (s.health.length) flags.push(`✗ ${s.health.join("; ")}`);
  return `| \`${s.beat}\` | ${cells.join(" | ")} | ${s.perf.frames} | ${flags.join(" ") || "ok"} |`;
}).join("\n");

const md = `# DEAD AIR — performance profile

_${result.profiledAt}_ · ${scenarios.length} scenarios @ \`${URL}\`
${baseline ? `Compared to baseline \`${baseline.profiledAt}\` — ▲ = more work (regression), ▼ = less (optimisation).` : "_No baseline yet — run with \`--save-baseline\` to record one._"}

> ${result.note}

| beat | calls | tris | geo | tex | prog | cpu ms | rend ms | frames | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

**Budget** (soft gate): calls ≤ ${BUDGET.calls}, tris ≤ ${(BUDGET.triangles / 1e6).toFixed(1)}M, tex ≤ ${BUDGET.textures}, prog ≤ ${BUDGET.programs}.

## Summary
- ${improvements} metric(s) improved ▼, ${regressions} regressed ▲ vs baseline
- ${budgetFails} scenario(s) over budget, ${healthFails} health issue(s)
- ${errors.length} page error(s)${errors.length ? ": " + errors.slice(0, 3).join("; ") : ""}

Screenshots (perf overlay visible): \`${OUT}\`
`;
writeFileSync(join(OUT, "report.md"), md);

console.log(`\nperf: ${scenarios.length} scenarios -> ${OUT}/perf.json + report.md`);
if (baseline) console.log(`perf: vs baseline — ${improvements} improved, ${regressions} regressed`);
console.log(`perf: ${budgetFails} over budget, ${healthFails} health issue(s), ${errors.length} page errors`);

const failed = STRICT && (budgetFails > 0 || healthFails > 0 || errors.length > 0);
process.exit(failed ? 1 : 0);
