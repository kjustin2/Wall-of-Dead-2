# Agent Guide

## Project Direction

Wall of Dead 2 is standalone-first 3D survival horror. Keep the game scary and grounded. Do not add arcade scoring, combo systems, loot explosions, room-clear banners, or bright target-outline combat readability unless the user explicitly asks.

## Run And Test

```powershell
npm install
npm run verify
npm start
```

Preferred manual play target is Electron. Browser/Vite is for development and quick debugging.

## Architecture Rules

- Root app only. `roguehero3/` and `wallofdead/` are ignored reference folders.
- Babylon side-effect imports live in `src/engine/babylonSideEffects.ts`; update `vite.config.ts` and `BabylonRuntimeCheck.ts` when adding new side-effect-dependent Babylon APIs.
- Menu flows live in `src/ui/MenuSystem.ts` as a Babylon GUI fullscreen layer, following the `roguehero3` pattern of one pointer-blocking texture with panels toggled by `isVisible`.
- Keep gameplay update paths synchronous and allocation-light.
- Favor authored scares, lighting, sound, and scarcity over enemy count.
- Generated art belongs under `public/assets/generated/`; document prompts and usage in `docs/ASSET_PIPELINE.md`.

## Horror Rules

- A shot should feel loud, useful, and costly.
- Some threats should be better escaped than killed.
- Darkness must create tension without making interaction unreadable.
- Narrative text should be short and unsettling, not exposition-heavy.
