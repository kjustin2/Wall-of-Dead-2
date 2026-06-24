/**
 * DIFF — perceptual visual-diff between two capture runs (catch visual regressions).
 *
 * Pairs PNGs by filename across two run folders and computes a per-pixel difference
 * — how much of the frame changed, and where. Writes a magenta-on-dim heatmap per
 * pair and a report sorted by % changed, so an intended change reads as a small
 * localised diff and an accidental regression (a light that went out, a black frame,
 * a shifted layout) reads as a large one. Decoding happens in a headless canvas, so
 * there's NO image-library dependency.
 *
 *   node agent/diff.mjs <dirA> <dirB> [--out agent/runs/diff] [--threshold 12]
 *   node agent/diff.mjs agent/runs/monster-before agent/runs/monster-after
 *
 * dirA = the baseline/"before", dirB = the "after". Exit 1 if any pair changes more
 * than --fail-over percent (default off) — useful as a regression gate.
 */
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { launch } from "./lib.mjs";

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const DIR_A = positional[0];
const DIR_B = positional[1];
const OUT = opt("out", join("agent", "runs", "diff"));
const THRESHOLD = Number(opt("threshold", "12"));     // per-channel 0-255 delta that counts as "changed"
const FAIL_OVER = Number(opt("fail-over", "0"));      // exit 1 if any pair changes more than this % (0 = never)

if (!DIR_A || !DIR_B) {
  console.error("usage: node agent/diff.mjs <dirA> <dirB> [--out dir] [--threshold 12] [--fail-over 40]");
  process.exit(2);
}
if (!existsSync(DIR_A) || !existsSync(DIR_B)) {
  console.error(`diff: missing dir — A:${existsSync(DIR_A)} B:${existsSync(DIR_B)}`);
  process.exit(2);
}
mkdirSync(OUT, { recursive: true });

const pngs = (d) => readdirSync(d).filter((f) => f.toLowerCase().endsWith(".png"));
const setA = new Set(pngs(DIR_A));
const setB = new Set(pngs(DIR_B));
const shared = [...setA].filter((f) => setB.has(f)).sort();
const onlyA = [...setA].filter((f) => !setB.has(f));
const onlyB = [...setB].filter((f) => !setA.has(f));

if (!shared.length) {
  console.error(`diff: no PNGs share a filename between\n  A: ${DIR_A} (${setA.size})\n  B: ${DIR_B} (${setB.size})`);
  process.exit(2);
}

const dataUrl = (dir, f) => "data:image/png;base64," + readFileSync(join(dir, f)).toString("base64");

const { browser, page, errors } = await launch();
const results = [];

/** decode + diff both PNGs entirely inside the page (canvas = free PNG decoder) */
async function diffPair(aUrl, bUrl, threshold) {
  return page.evaluate(async (aUrl, bUrl, threshold) => {
    const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("decode")); im.src = src; });
    const [ia, ib] = await Promise.all([load(aUrl), load(bUrl)]);
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height);
    const cv = (im) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d"); x.drawImage(im, 0, 0); return x.getImageData(0, 0, w, h).data; };
    const A = cv(ia), B = cv(ib);
    const out = document.createElement("canvas"); out.width = w; out.height = h;
    const octx = out.getContext("2d");
    const od = octx.createImageData(w, h);
    const O = od.data;
    let changed = 0, sumDelta = 0;
    for (let i = 0; i < A.length; i += 4) {
      const dr = Math.abs(A[i] - B[i]), dg = Math.abs(A[i + 1] - B[i + 1]), db = Math.abs(A[i + 2] - B[i + 2]);
      const d = (dr + dg + db) / 3;
      sumDelta += d;
      if (d > threshold) {
        changed++;
        O[i] = 255; O[i + 1] = 0; O[i + 2] = 200; O[i + 3] = 255; // magenta where it changed
      } else {
        const g = (A[i] * 0.299 + A[i + 1] * 0.587 + A[i + 2] * 0.114) * 0.35; // dimmed baseline elsewhere
        O[i] = O[i + 1] = O[i + 2] = g; O[i + 3] = 255;
      }
    }
    octx.putImageData(od, 0, 0);
    const total = (A.length / 4) || 1;
    return {
      w, h,
      changedPct: (changed / total) * 100,
      meanDelta: sumDelta / total,
      mismatchSize: ia.width !== ib.width || ia.height !== ib.height,
      diffUrl: out.toDataURL("image/png")
    };
  }, aUrl, bUrl, threshold);
}

try {
  for (const f of shared) {
    const r = await diffPair(dataUrl(DIR_A, f), dataUrl(DIR_B, f), THRESHOLD);
    const diffFile = `diff-${f}`;
    writeFileSync(join(OUT, diffFile), Buffer.from(r.diffUrl.split(",")[1], "base64"));
    results.push({ file: f, diffFile, changedPct: r.changedPct, meanDelta: r.meanDelta, mismatchSize: r.mismatchSize });
    const bar = "█".repeat(Math.min(30, Math.round(r.changedPct / 3.34)));
    console.log(`  ${f.padEnd(22)} ${r.changedPct.toFixed(1).padStart(5)}% ${bar}${r.mismatchSize ? "  (size differs!)" : ""}`);
  }
} catch (e) {
  errors.push("diff exception: " + String(e.message || e));
  console.error(e);
} finally {
  await browser.close();
}

results.sort((a, b) => b.changedPct - a.changedPct);
const flag = (p) => p > 60 ? "🟥 major" : p > 25 ? "🟧 large" : p > 5 ? "🟨 moderate" : p > 0.5 ? "🟩 minor" : "⬜ none";
const rows = results.map((r) => `| \`${r.file}\` | ${r.changedPct.toFixed(1)}% | ${r.meanDelta.toFixed(1)} | ${flag(r.changedPct)} | \`${r.diffFile}\`${r.mismatchSize ? " ⚠size" : ""} |`).join("\n");

const md = `# Visual diff — ${basename(DIR_A)} → ${basename(DIR_B)}

_${new Date().toISOString()}_ · threshold ${THRESHOLD}/255 · ${shared.length} shared frame(s)

| frame | changed | mean Δ | magnitude | heatmap |
| --- | --- | --- | --- | --- |
${rows}

${onlyA.length ? `**Only in A (removed):** ${onlyA.map((f) => `\`${f}\``).join(", ")}\n` : ""}${onlyB.length ? `**Only in B (added):** ${onlyB.map((f) => `\`${f}\``).join(", ")}\n` : ""}
Heatmaps (magenta = changed pixels over a dimmed baseline) in \`${OUT}\`.
A black/near-empty "after" frame shows as a ~100% diff — a fast catch for a render regression.
${errors.length ? `\n⚠ ${errors.length} error(s): ${errors.slice(0, 3).join("; ")}` : ""}
`;
writeFileSync(join(OUT, "report.md"), md);
writeFileSync(join(OUT, "diff.json"), JSON.stringify({ a: DIR_A, b: DIR_B, threshold: THRESHOLD, at: new Date().toISOString(), results, onlyA, onlyB, errors }, null, 2));

const maxChanged = results.length ? results[0].changedPct : 0;
console.log(`\ndiff: ${shared.length} frames, max change ${maxChanged.toFixed(1)}% -> ${OUT}/report.md`);
if (onlyA.length || onlyB.length) console.log(`diff: ${onlyA.length} only-in-A, ${onlyB.length} only-in-B`);
const failed = FAIL_OVER > 0 && maxChanged > FAIL_OVER;
if (failed) console.error(`diff: FAIL — ${maxChanged.toFixed(1)}% > --fail-over ${FAIL_OVER}%`);
process.exit(failed || errors.length ? 1 : 0);
