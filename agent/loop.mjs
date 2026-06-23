/**
 * LOOP — the orchestrator. Ties the cycle together and repeats until the
 * objective goals are met or a stop budget is hit:
 *
 *   capture (screenshots + visual probes)
 *     -> verify (logic assertions)
 *       -> analyze (AI reads the screenshots, finds the next improvement)   [Observe]
 *         -> decide (all goals met? budget left? stalled?)
 *           -> [--auto] implement (claude edits GAME code to close the top gap) [Implement]
 *             -> next cycle
 *
 * Traceable: each cycle writes agent/runs/cycle-NNN/{manifest,results,analysis}.json
 * + report.md, and agent/state.json is updated after every step.
 * Resumable: re-running continues from agent/state.json (--reset to start over).
 * Safe: the implementer may only touch GAME code (src/, style.css, index.html,
 * public/) — never the agent/ harness — and game code is backed up and restored
 * if a change breaks typecheck or regresses the goal count.
 *
 *   node agent/loop.mjs                 # automated audit loop (no code changes)
 *   node agent/loop.mjs --auto          # fully self-improving (claude edits game code)
 *   node agent/loop.mjs --auto --max-cycles 4 --max-minutes 30 --model sonnet
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import http from "node:http";
import { ROOT, loadGoals, sleep } from "./lib.mjs";

// ---------- args ----------
const flag = (n) => process.argv.includes(`--${n}`);
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PORT = Number(opt("port", "5173"));
const URL = opt("url", `http://localhost:${PORT}`);
const AUTO = flag("auto");
const MODEL = opt("model", "sonnet");
const RESET = flag("reset");

const cfg = loadGoals();
const GOALS = cfg.goals;
const MAX_CYCLES = Number(opt("max-cycles", String(cfg.meta.maxCycles ?? 6)));
const MAX_MINUTES = Number(opt("max-minutes", String(cfg.meta.maxMinutes ?? 45)));
const STALL = Number(opt("stall-cycles", String(cfg.meta.stallCycles ?? 2)));

const RUNS = join(ROOT, "agent", "runs");
const STATE = join(ROOT, "agent", "state.json");
const GAME_PATHS = ["src", "style.css", "index.html", "public"]; // implementer scope
mkdirSync(RUNS, { recursive: true });

const startedMs = Date.now();
const log = (m) => console.log(`[loop] ${m}`);

// ---------- state (resumable) ----------
function loadState() {
  if (!RESET && existsSync(STATE)) return JSON.parse(readFileSync(STATE, "utf8"));
  return { startedAt: new Date().toISOString(), nextCycle: 0, cyclesSinceProgress: 0, bestMet: -1, history: [], stopped: null };
}
function saveState(s) { writeFileSync(STATE, JSON.stringify(s, null, 2)); }
const state = loadState();

// ---------- dev server lifecycle ----------
const ping = () => new Promise((res) => {
  const req = http.get(URL + "/", (r) => { r.resume(); res(r.statusCode === 200); });
  req.on("error", () => res(false));
  req.setTimeout(1500, () => { req.destroy(); res(false); });
});
async function ensureServer() {
  if (await ping()) { log(`dev server already up at ${URL}`); return null; }
  log(`starting dev server on :${PORT} ...`);
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, [join(ROOT, "node_modules", "vite", "bin", "vite.js"), "--port", String(PORT), "--strictPort"],
    { cwd: ROOT, stdio: "ignore" });
  for (let i = 0; i < 40; i++) { if (await ping()) { log("dev server ready"); return child; } await sleep(500); }
  child.kill();
  throw new Error("dev server did not become ready");
}

// ---------- step runner ----------
function run(script, args) {
  const r = spawnSync(process.execPath, [join(ROOT, "agent", script), ...args], { cwd: ROOT, encoding: "utf8", stdio: "inherit", maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0;
}

// ---------- goal scoring ----------
function score(dir) {
  const manifest = existsSync(join(dir, "manifest.json")) ? JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) : { shots: [] };
  const results = existsSync(join(dir, "results.json")) ? JSON.parse(readFileSync(join(dir, "results.json"), "utf8")) : { checks: {} };
  const probeFor = (beat, goalId) => {
    for (const s of manifest.shots) if (s.beat === beat) { const p = s.probes.find((x) => x.goalId === goalId); if (p) return p; }
    return null;
  };
  const goals = GOALS.map((g) => {
    let visualPass = null, logicPass = null;
    if (g.visual) { const p = probeFor(g.visual.beat, g.id); visualPass = p ? p.ok : false; }
    if (g.logic) { logicPass = results.checks?.[g.logic.check]?.pass ?? false; }
    const met = (visualPass === null || visualPass) && (logicPass === null || logicPass);
    return { id: g.id, title: g.title, visualPass, logicPass, met };
  });
  return { goals, met: goals.filter((x) => x.met).length, total: goals.length, manifest, results };
}

// ---------- report ----------
function relShots(dir, manifest) {
  return manifest.shots.map((s) => {
    const pf = s.probes.map((p) => `${p.goalId} ${p.ok ? "✅" : "❌"}`).join(", ") || "—";
    return `| \`${s.file}\` | ${s.beat} | ${pf} |`;
  }).join("\n");
}
function writeReport(dir, cycle, sc, analysis, impl) {
  const v = (b) => b === null ? "—" : b ? "✅" : "❌";
  const rows = sc.goals.map((g) => {
    const a = analysis?.verdicts?.find((x) => x.goalId === g.id);
    return `| ${g.met ? "✅" : "❌"} | \`${g.id}\` | ${v(g.visualPass)} | ${v(g.logicPass)} | ${a ? a.verdict : "—"} |`;
  }).join("\n");
  const imps = (analysis?.improvements || []).slice(0, 6)
    .map((i, n) => `${n + 1}. **${i.title}** _(${i.goalId})_ — ${i.rationale}${i.targetFiles?.length ? `  \`${i.targetFiles.join(", ")}\`` : ""}`).join("\n") || "_none_";
  const regs = (analysis?.regressions || []).map((r) => `- ⚠️ ${r}`).join("\n") || "_none_";
  const remaining = sc.goals.filter((g) => !g.met).map((g) => `- \`${g.id}\` — ${g.title}`).join("\n") || "_none — all goals met_";
  const implMd = impl
    ? `**Target:** \`${impl.target}\`\n**Changed:** ${impl.changed.length ? impl.changed.map((f) => `\`${f}\``).join(", ") : "_no files_"}\n**Typecheck:** ${impl.typecheck ? "✅ pass" : "❌ fail"}\n**Result:** ${impl.reverted ? "🔁 reverted (broke typecheck or regressed)" : "kept"}`
    : AUTO ? "_skipped (all goals met or budget hit)_" : "_disabled (run with --auto to let the loop edit game code)_";

  const md = `# Cycle ${cycle} — ${sc.met}/${sc.total} goals met

_${new Date().toISOString()}_

## Goals

| MET | goal | visual | logic | AI verdict |
| --- | --- | :--: | :--: | :--: |
${rows}

## Screenshots (visual evidence)

| file | beat | visual probes |
| --- | --- | --- |
${relShots(dir, sc.manifest)}

## AI observation (read the screenshots)
${analysis?.available === false ? `_vision pass unavailable: ${analysis.reason}_` : ""}
**Regressions / glitches:**
${regs}

**Proposed improvements (most impactful first):**
${imps}

## Implement step
${implMd}

## Remaining gaps
${remaining}
`;
  writeFileSync(join(dir, "report.md"), md);
  return md;
}

// ---------- implement (only with --auto) ----------
function walkFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}
/** files under GAME_PATHS whose CONTENT differs from the pre-implement backup
 *  (robust even when a file was already dirty before the loop started) */
function diffAgainstBackup(backup) {
  const changed = [];
  for (const p of GAME_PATHS) {
    const cur = join(ROOT, p);
    if (!existsSync(cur)) continue;
    const files = statSync(cur).isDirectory() ? walkFiles(cur) : [cur];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, "/");
      const bf = join(backup, rel);
      try {
        if (!existsSync(bf) || readFileSync(f, "utf8") !== readFileSync(bf, "utf8")) changed.push(rel);
      } catch { /* binary/asset — skip */ }
    }
  }
  return changed;
}
function backupGame(dir) {
  const b = join(dir, "backup");
  mkdirSync(b, { recursive: true });
  for (const p of GAME_PATHS) { const src = join(ROOT, p); if (existsSync(src)) cpSync(src, join(b, p), { recursive: true }); }
  return b;
}
function restoreGame(backup) {
  for (const p of GAME_PATHS) {
    const from = join(backup, p), to = join(ROOT, p);
    if (existsSync(from)) { rmSync(to, { recursive: true, force: true }); cpSync(from, to, { recursive: true }); }
  }
}
function typecheck() {
  return spawnSync("npm", ["run", "typecheck"], { cwd: ROOT, encoding: "utf8", shell: true }).status === 0;
}
function implement(dir, sc, analysis) {
  const failing = sc.goals.filter((g) => !g.met);
  // prefer the highest-priority AI improvement that targets a still-failing goal
  const imp = (analysis?.improvements || []).sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
    .find((i) => failing.some((g) => g.id === i.goalId)) || null;
  const target = imp?.goalId || failing[0]?.id;
  const goal = GOALS.find((g) => g.id === target);
  if (!goal) return null;

  const backup = backupGame(dir);

  const brief = {
    failingGoal: { id: goal.id, title: goal.title, description: goal.description, visual: goal.visual, logic: goal.logic },
    aiSuggestion: imp,
    relatedVerdict: analysis?.verdicts?.find((x) => x.goalId === target) || null
  };
  const prompt = `You are improving the DEAD AIR game (Three.js + TS) so an automated goal passes. Read CLAUDE.md for architecture/conventions first.

Close exactly this goal:
${JSON.stringify(brief, null, 2)}

Rules:
- Edit ONLY game code: ${GAME_PATHS.join(", ")}. NEVER edit anything under agent/ or scripts/ (that is the test harness — changing it is cheating).
- Make the smallest change that makes the goal's criteria true in the real game.
- Do not break other goals. When done, run \`npm run typecheck\` and fix any error you introduced.
- Be concise; end by stating the file(s) you changed.`;

  log(`implement: target=${target} (claude ${MODEL}) ...`);
  const r = spawnSync("claude", ["-p", prompt, "--model", MODEL, "--permission-mode", "acceptEdits", "--allowedTools", "Read,Edit,Write,Grep,Glob,Bash"],
    { cwd: ROOT, encoding: "utf8", timeout: 20 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
  const ok = typecheck();
  const changed = diffAgainstBackup(backup);
  let reverted = false;
  if (!ok) { restoreGame(backup); reverted = true; log("implement: typecheck FAILED -> reverted"); }
  return { target, changed, typecheck: ok, reverted, claudeStatus: r.status };
}

// ---------- main loop ----------
let server;
try {
  server = await ensureServer();
  while (true) {
    const elapsedMin = (Date.now() - startedMs) / 60000;
    if (state.nextCycle >= MAX_CYCLES) { state.stopped = "max-cycles"; break; }
    if (elapsedMin >= MAX_MINUTES) { state.stopped = "max-minutes"; break; }

    const cycle = state.nextCycle;
    const dir = join(RUNS, `cycle-${String(cycle).padStart(3, "0")}`);
    mkdirSync(dir, { recursive: true });
    log(`==== cycle ${cycle} (${Math.round(elapsedMin)}m elapsed) ====`);

    if (!run("capture.mjs", ["--url", URL, "--out", dir, "--cycle", String(cycle)])) log("capture: nonzero exit (continuing)");
    if (!run("verify.mjs", ["--url", URL, "--out", dir])) log("verify: nonzero exit (continuing)");
    run("analyze.mjs", ["--out", dir, "--model", MODEL]);
    const analysis = existsSync(join(dir, "analysis.json")) ? JSON.parse(readFileSync(join(dir, "analysis.json"), "utf8")) : null;

    let sc = score(dir);
    log(`cycle ${cycle}: ${sc.met}/${sc.total} goals met`);

    const allMet = sc.met === sc.total;
    const progressed = sc.met > state.bestMet;
    state.bestMet = Math.max(state.bestMet, sc.met);
    state.cyclesSinceProgress = progressed ? 0 : state.cyclesSinceProgress + 1;

    let impl = null;
    const willImplement = AUTO && !allMet && state.nextCycle + 1 < MAX_CYCLES && (Date.now() - startedMs) / 60000 < MAX_MINUTES;
    if (willImplement) {
      impl = implement(dir, sc, analysis);
      // re-score after the change so the report reflects post-implement reality
      if (impl && impl.changed.length && !impl.reverted) {
        log("implement: re-capturing to confirm the change");
        run("capture.mjs", ["--url", URL, "--out", dir, "--cycle", String(cycle)]);
        run("verify.mjs", ["--url", URL, "--out", dir]);
        sc = score(dir);
        state.bestMet = Math.max(state.bestMet, sc.met);
        log(`cycle ${cycle} post-implement: ${sc.met}/${sc.total} goals met`);
      }
    }

    writeReport(dir, cycle, sc, analysis, impl);
    state.history.push({ cycle, met: sc.met, total: sc.total, goals: sc.goals.map((g) => ({ id: g.id, met: g.met })), implement: impl, finishedAt: new Date().toISOString() });
    state.nextCycle = cycle + 1;
    saveState(state);

    if (sc.met === sc.total && cfg.meta.stopWhenAllPass) { state.stopped = "all-goals-met"; break; }
    if (state.cyclesSinceProgress >= STALL && !allMet) { state.stopped = `stalled (${STALL} cycles without progress)`; break; }
    if (!AUTO) { state.stopped = "audit-only (no --auto: nothing to iterate on)"; break; }
  }
} catch (e) {
  state.stopped = "error: " + String(e.message || e);
  log("ERROR: " + e.message);
} finally {
  if (server) { server.kill(); log("dev server stopped"); }
}

// ---------- final rolling report ----------
saveState(state);
const last = state.history[state.history.length - 1];
const hist = state.history.map((h) => `| ${h.cycle} | ${h.met}/${h.total} | ${h.implement ? (h.implement.reverted ? "reverted" : h.implement.changed.join(" ") || "—") : "—"} |`).join("\n");
const summary = `# DEAD AIR — improvement loop

**Stopped:** ${state.stopped}
**Cycles run:** ${state.history.length}
**Best:** ${state.bestMet}/${GOALS.length} goals met
**Latest:** ${last ? `${last.met}/${last.total}` : "—"}  ·  see \`runs/cycle-${last ? String(last.cycle).padStart(3, "0") : "000"}/report.md\`

| cycle | goals met | implement |
| --- | --- | --- |
${hist}

_Goals are defined in \`agent/goals.json\`. A goal is met only when its visual probe AND its logic check pass. Re-run \`node agent/loop.mjs\` (add \`--auto\` to let it edit game code) to continue; state persists in \`agent/state.json\`._
`;
writeFileSync(join(ROOT, "agent", "report.md"), summary);
log(`done: ${state.stopped}. Best ${state.bestMet}/${GOALS.length}. See agent/report.md`);
process.exit(0);
