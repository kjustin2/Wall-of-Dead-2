/**
 * Map verifier / ASCII renderer for src/world/data.ts.
 * Parses the pure array literals out of data.ts (no build step needed),
 * builds the solid grid, flood-fills from the player start, and reports any
 * room or objective that can't be reached. Run: `node scripts/map.mjs`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "src", "world", "data.ts"), "utf8");

/** Pull a `[...]` or `{...}` literal that follows `export const NAME...=` and eval it. */
function grab(name, open = "[", close = "]") {
  const i = src.indexOf(`export const ${name}`);
  if (i < 0) throw new Error(`missing ${name}`);
  const eq = src.indexOf("=", i + `export const ${name}`.length); // skip the type annotation
  const s = src.indexOf(open, eq);
  let depth = 0, j = s;
  for (; j < src.length; j++) {
    if (src[j] === open) depth++;
    else if (src[j] === close && --depth === 0) { j++; break; }
  }
  // eslint-disable-next-line no-eval
  return eval(`(${src.slice(s, j)})`);
}
const num = (name) => Number(src.match(new RegExp(`export const ${name}\\s*=\\s*(\\d+)`))[1]);

const GRID_W = num("GRID_W"), GRID_H = num("GRID_H");
const ROOMS = grab("ROOMS");
const DOORS = grab("DOOR_DEFS");
const PILLARS = grab("PILLARS");
const PROPS = grab("PROPS");
const ITEMS = grab("ITEMS");
const NAV = grab("NAV", "{", "}");
const START = grab("PLAYER_START", "{", "}");
const STALK = grab("STALKER_START", "{", "}");

const idx = (x, y) => y * GRID_W + x;
const solid = new Array(GRID_W * GRID_H).fill(true);
const obstacle = new Array(GRID_W * GRID_H).fill(false);
for (const r of ROOMS)
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) solid[idx(x, y)] = false;
for (const d of DOORS) solid[idx(d.cx, d.cy)] = false;
for (const [x, y] of PILLARS) obstacle[idx(x, y)] = true;
for (const p of PROPS) obstacle[idx(p.cx, p.cy)] = true;

// flood fill from player start over open, non-obstacle cells (doors always passable)
const doorCells = new Set(DOORS.map((d) => idx(d.cx, d.cy)));
const seen = new Set();
const q = [idx(START.cx, START.cy)];
seen.add(q[0]);
while (q.length) {
  const cur = q.pop();
  const cx = cur % GRID_W, cy = (cur / GRID_W) | 0;
  for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + ox, ny = cy + oy;
    if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
    const ni = idx(nx, ny);
    if (seen.has(ni) || solid[ni]) continue;
    if (obstacle[ni] && !doorCells.has(ni)) continue;
    seen.add(ni);
    q.push(ni);
  }
}

// overlay markers
const mark = new Map();
const put = (cx, cy, ch) => mark.set(idx(cx, cy), ch);
put(START.cx, START.cy, "@");
put(STALK.cx, STALK.cy, "S");
const objChar = { fuse_a: "a", fuse_b: "b", panel: "R", console: "C", hatch: "H" };
for (const it of ITEMS) {
  if (objChar[it.id]) put(it.cx, it.cy, objChar[it.id]);
  else if (it.kind === "note") put(it.cx, it.cy, "n");
  else if (it.kind === "battery") put(it.cx, it.cy, "+");
  else if (it.kind === "bottles") put(it.cx, it.cy, "*");
}

// render
let out = "";
for (let y = 0; y < GRID_H; y++) {
  let line = "";
  for (let x = 0; x < GRID_W; x++) {
    const i = idx(x, y);
    if (mark.has(i)) { line += mark.get(i); continue; }
    if (doorCells.has(i)) {
      const d = DOORS.find((dd) => idx(dd.cx, dd.cy) === i);
      line += d.kind === "fire" ? "=" : "/";
    } else if (solid[i]) line += seen.has(i) ? "?" : " ";
    else if (obstacle[i]) line += "x";
    else line += seen.has(i) ? "." : "u"; // u = open but UNREACHABLE
  }
  out += line.replace(/\s+$/, "") + "\n";
}
console.log(out);

// report
const problems = [];
for (const r of ROOMS) {
  let reach = false;
  for (let y = r.y; y < r.y + r.h && !reach; y++)
    for (let x = r.x; x < r.x + r.w && !reach; x++)
      if (!solid[idx(x, y)] && seen.has(idx(x, y))) reach = true;
  if (!reach) problems.push(`room "${r.name}" UNREACHABLE`);
}
for (const [k, [cx, cy]] of Object.entries(NAV))
  if (!seen.has(idx(cx, cy))) problems.push(`nav "${k}" (${cx},${cy}) UNREACHABLE`);
for (const it of ITEMS)
  if (!seen.has(idx(it.cx, it.cy))) problems.push(`item "${it.id}" (${it.cx},${it.cy}) UNREACHABLE`);
// stranded open cells
let stranded = 0;
for (let i = 0; i < solid.length; i++) if (!solid[i] && !obstacle[i] && !seen.has(i)) stranded++;

console.log("Legend: . floor  = fire-door  / door  x prop/pillar  @ start  S stalker");
console.log("        a/b fuses  R rack  C core  H hatch  n note  + battery  * bottles  u UNREACHABLE-open");
console.log(`Grid ${GRID_W}x${GRID_H}, rooms ${ROOMS.length}, doors ${DOORS.length}, reachable open cells ${seen.size}, stranded open ${stranded}`);
if (problems.length) { console.log("PROBLEMS:\n  " + problems.join("\n  ")); process.exit(1); }
else console.log("OK — every room, nav anchor, and item is reachable from the player start.");
