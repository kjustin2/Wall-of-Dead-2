# Self-iterating improvement loop

A closed loop that drives DEAD AIR toward a set of measurable goals and repeats
until they're met (or a budget is hit). Each cycle:

```
capture  ── scripted play-through → screenshots + visual probes   (Capture)
   │
verify   ── window.__game logic assertions                        (Verify, logical)
   │
analyze  ── Claude reads the screenshots, finds the next gap       (Observe, visual)
   │
decide   ── all goals met? budget left? stalled?                   (Decide)
   │
implement ─ [--auto] Claude edits GAME code to close the top gap   (Implement)
   │
   └── re-capture + re-verify → next cycle
```

## What "met" means (two independent signals)

A goal in `goals.json` is **met only when both pass**:

- **Visual gate** — a deterministic DOM/render-state *probe* evaluated in-page at
  the exact moment its screenshot is taken. The PNG is the saved evidence; the
  probe boolean is the objective pass/fail.
- **Logic gate** — a deterministic `window.__game` assertion (a named `check`).

The **AI vision pass** (`analyze.mjs`) is *advisory on top* of these: it reads the
actual PNGs to flag regressions/ugliness the probes can't express and to
prioritise what to implement next. It never silently flips a goal to "met".

## Files

| file | role |
| --- | --- |
| `goals.json` | the objective goals + pass/fail criteria (visual probe + logic check) and loop budget |
| `lib.mjs` | shared headless-Edge / puppeteer helpers (runs at `?lowfx`, polls not rAF) |
| `capture.mjs` | scripted play-through → screenshots + per-beat visual probes → `manifest.json` |
| `verify.mjs` | logic assertions grouped into named checks → `results.json` |
| `analyze.mjs` | feeds the screenshots to headless `claude` → `analysis.json` (verdicts + improvements) |
| `loop.mjs` | orchestrator: server lifecycle, cycle loop, scoring, reports, decide, `--auto` implement |
| `runs/cycle-NNN/` | per-cycle artifacts: PNGs, the three JSONs, `report.md`, `backup/` (gitignored) |
| `state.json` | resumable loop state — cycle counter, per-goal history, stop reason (gitignored) |
| `report.md` | rolling top-level summary + cycle history (gitignored) |

## Run it

```powershell
# fully automated, self-improving (Claude edits game code each cycle until goals pass)
npm run loop:auto -- --max-cycles 4 --model sonnet

# automated audit only — capture + verify + analyze + report, no code changes
npm run loop

# individual stages (need a dev server running; pass --url if not on :5173)
npm run loop:capture -- --out agent/runs/manual
npm run loop:verify  -- --out agent/runs/manual
node agent/analyze.mjs --out agent/runs/manual
```

`loop.mjs` starts the Vite dev server on `:5173` itself if one isn't already up,
and stops it when done.

## Guarantees

- **Fully automated** — one command launches the server, drives the play-through,
  captures, tests, analyses, edits, and re-verifies with no per-cycle input.
- **Recursive** — cycles repeat, each re-scored against the goals, until all pass,
  `--max-cycles` / `--max-minutes` is hit, or no goal has been newly met for
  `stallCycles` cycles. Cost is bounded by those caps.
- **Traceable** — every cycle persists its screenshots, probe results, logic
  results, AI analysis, the diff it made, and a `report.md`.
- **Safe to stop/resume** — state lives in `state.json`; re-running continues from
  it (`--reset` to start over). Before each `--auto` edit the game code is backed
  up; if the edit breaks `npm run typecheck` or regresses the goal count it is
  **reverted**, so a bad cycle can't corrupt progress.
- **Can't cheat** — the `--auto` implementer may edit **game code only**
  (`src/`, `style.css`, `index.html`, `public/`). It is forbidden from touching
  `agent/` or `scripts/`, so it cannot make a goal pass by weakening its own test.

## Adding a goal

Add an entry to `goals.json` with a `visual` probe (a JS boolean expression over
`g = window.__game` / `document`, tied to a capture `beat`) and/or a `logic`
check (the id of a check in `verify.mjs`). If you add a `logic.check`, implement
the matching assertion in `verify.mjs`. The loop will then drive the game until
the new goal's screenshot evidence and logic both pass.
