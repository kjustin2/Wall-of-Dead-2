# Asset Pipeline

The first build ships with procedural Babylon assets and generated-style textures created at runtime. This keeps iteration fast and avoids committing fragile placeholder binaries.

## Generated Bitmap Targets

When bitmap generation is useful, save final assets under `public/assets/generated/` and record the prompt here. Good candidates:

- grime and blood decal atlas
- warning posters and evacuation signs
- family photos and missing-person flyers
- stained concrete, cracked tile, rust, old paper, and cloth textures
- enemy skin/detail atlases if runtime textures stop being enough
- title/menu key art

## Current Generated Assets

- `public/assets/generated/wod2-texture-atlas-concrete.png`
  - Usage: floor and wall material atlas in `src/game/ProceduralArt.ts`.
  - Prompt: square 2x2 photorealistic texture atlas with cracked concrete, stained apartment wallpaper, wet pharmacy tile, and rusted boiler-room metal; flat diffuse material lighting; no text, labels, UI, people, or watermark.
- `public/assets/generated/wod2-grime-decal-atlas.png`
  - Usage: low floor grime decals created by `WorldBuilder`.
  - Prompt: square 3x3 horror decal atlas on black with water damage, hand smears, old dark stains, soot, shoe scuffs, mildew, rusty drips, cracked plaster chips, and damp footprints; no readable text, symbols, people, or fresh gore.
- `public/assets/generated/wod2-photo-atlas.png`
  - Usage: note and paper prop material.
  - Prompt: square 2x2 realistic atlas of damaged paper props: water-damaged photo, stained evacuation note with illegible marks, medical tag card, folded mildew paper; no readable words or clear people.
- `public/assets/generated/wod2-menu-key-art.png`
  - Usage: Babylon GUI menu background.
  - Prompt: realistic dark key art of a ruined apartment lobby leading into a chained stairwell, dead exit sign, wet floor, cracked plaster, implied shape in darkness, no text or UI.
- `public/assets/generated/wod2-intake-signage-atlas.png`
  - Usage: route signage material for intake, triage, rail, and gate signs in `WorldBuilder`.
  - Prompt: grim emergency signage atlas for a failed survivor intake center, aged paper boards, red-black warnings, evacuation route labels, water stains, rust streaks, no clean UI styling.
- `public/assets/generated/wod2-triage-prop-atlas.png`
  - Usage: triage curtain, cot, and body bag prop materials in `WorldBuilder`.
  - Prompt: horror hospital triage fabric and stained canvas material atlas, old curtains, yellowed sheets, sealed body bag vinyl, dark mildew, no fresh gore.
- `public/assets/generated/wod2-enemy-skin-atlas.png`
  - Usage: ambient enemy material detail layered into `makeEnemyMaterial`.
  - Prompt: disturbing non-graphic enemy skin texture atlas, dark bruised tissue, exposed rib-like pale streaks, wet stains, asymmetrical marks, no readable symbols.

`scripts/generate-horror-assets.ps1` can regenerate the three newer local atlases without network access.

## Runtime Procedural Assets

The shipped prototype creates these in code:

- noisy floor and wall materials
- poster/note planes
- blood smears and grime decals
- fog cards, muzzle flashes, scare flashes
- enemy rot textures generated with `DynamicTexture`
- enemy-specific silhouette details such as ribs, sacs, jaws, back plates, claws, and low emissive eyes

## Performance Rules

- Use texture atlases where practical.
- Pool or cap particles, tracers, decals, and scare effects.
- Freeze static meshes/materials when possible.
- Gate heavy post effects by quality tier.
- Use short scare bursts instead of constant expensive overlays.
