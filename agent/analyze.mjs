/**
 * ANALYZE — the "Observe" step. Feeds the cycle's screenshots to Claude as the
 * visual source of truth: a headless `claude -p` reads each PNG, compares it to
 * the goal it is evidence for, and returns a structured verdict + a prioritised
 * list of improvements. Advisory on top of the deterministic probes/tests — it
 * catches what the probes can't express and decides what to implement next.
 *
 * Writes <out>/analysis.json. Never fatal: if the CLI is missing/slow/errors,
 * it records { available:false } and exits 0 so the loop keeps moving.
 *
 *   node agent/analyze.mjs --out agent/runs/cycle-001 [--model sonnet] [--timeout 240]
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, loadGoals } from "./lib.mjs";

function arg(name, def) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const OUT = resolve(arg("out", join(ROOT, "agent", "runs", "manual")));
const MODEL = arg("model", "sonnet");
const TIMEOUT = Number(arg("timeout", "300")) * 1000;

const manifestPath = join(OUT, "manifest.json");
const resultsPath = join(OUT, "results.json");
if (!existsSync(manifestPath)) {
  console.error("analyze: no manifest.json in", OUT, "- run capture first");
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const results = existsSync(resultsPath) ? JSON.parse(readFileSync(resultsPath, "utf8")) : { checks: {} };
const { goals } = loadGoals();

function write(obj) {
  writeFileSync(join(OUT, "analysis.json"), JSON.stringify(obj, null, 2));
}

// Build the analyst brief: goals + every shot (with absolute path, probes, state)
const shotsBrief = manifest.shots.map((s) => ({
  beat: s.beat,
  image: join(OUT, s.file),
  probes: s.probes,
  state: s.state
}));
const goalBrief = goals.map((g) => ({
  id: g.id,
  title: g.title,
  description: g.description,
  visualBeat: g.visual?.beat ?? null,
  visualCriteria: g.visual?.criteria ?? null,
  logicCheck: g.logic?.check ?? null,
  logicPass: g.logic ? results.checks?.[g.logic.check]?.pass ?? null : null
}));

const prompt = `You are the visual QA analyst for DEAD AIR, a first-person stealth-horror game.
You are given screenshots from one automated play-through (the visual source of truth) and the goal each screenshot is evidence for. Read EVERY image with the Read tool, then judge each goal against what you actually SEE — not against the description.

GOALS:
${JSON.stringify(goalBrief, null, 2)}

SCREENSHOTS (read each image path):
${JSON.stringify(shotsBrief, null, 2)}

For each visual goal, decide a verdict from what the image shows: "pass" (clearly meets the criteria), "concern" (renders but weak/ugly/unclear), or "fail" (criteria not visible). Note any regression or rendering glitch (all-black frame, missing HUD, broken layout, z-fighting, etc.). Then propose concrete improvements, most impactful first; for each, name the goalId it serves and, if you can infer it, the likely source file under src/.

Reply with ONLY a fenced json code block, no prose, in exactly this shape:
\`\`\`json
{
  "verdicts": [{ "goalId": "string", "verdict": "pass|concern|fail", "note": "what you see" }],
  "regressions": ["string"],
  "improvements": [{ "goalId": "string", "title": "string", "rationale": "string", "targetFiles": ["src/..."], "priority": 1 }]
}
\`\`\``;

console.log(`analyze: invoking claude (${MODEL}) over ${manifest.shots.length} screenshots...`);
let res;
try {
  res = spawnSync(
    "claude",
    ["-p", prompt, "--output-format", "json", "--model", MODEL, "--allowedTools", "Read,Glob"],
    { cwd: OUT, encoding: "utf8", timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024, shell: false }
  );
} catch (e) {
  write({ available: false, reason: "spawn failed: " + String(e.message || e), analyzedAt: new Date().toISOString() });
  console.error("analyze: spawn failed —", e.message);
  process.exit(0);
}

if (res.error || res.status !== 0 || !res.stdout) {
  write({
    available: false,
    reason: res.error ? String(res.error.message) : `claude exited ${res.status}`,
    stderr: (res.stderr || "").slice(0, 2000),
    analyzedAt: new Date().toISOString()
  });
  console.error("analyze: claude unavailable/failed —", res.error?.message || res.stderr?.slice(0, 300) || res.status);
  process.exit(0);
}

function extractJson(text) {
  const fence = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : text;
  const s = body.indexOf("{");
  const e = body.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no JSON object in model output");
  return JSON.parse(body.slice(s, e + 1));
}

try {
  const envelope = JSON.parse(res.stdout);
  const text = typeof envelope === "string" ? envelope : envelope.result ?? envelope.text ?? res.stdout;
  const parsed = extractJson(text);
  write({ available: true, model: MODEL, analyzedAt: new Date().toISOString(), ...parsed });
  const v = parsed.verdicts || [];
  const concerns = v.filter((x) => x.verdict !== "pass").length;
  console.log(`analyze: ${v.length} verdicts (${concerns} concern/fail), ${(parsed.improvements || []).length} improvements -> ${OUT}/analysis.json`);
} catch (e) {
  write({ available: false, reason: "parse failed: " + String(e.message || e), raw: (res.stdout || "").slice(0, 4000), analyzedAt: new Date().toISOString() });
  console.error("analyze: could not parse model output —", e.message);
}
process.exit(0);
