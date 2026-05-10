# Wall of Dead 2

Standalone-first 3D survival horror prototype. The game is built around scarcity, darkness, oppressive sound, and route choices through a connected ruined city. It should not play like an arcade shooter.

## Play

```powershell
npm install
npm start
```

`npm start` builds the Vite app and launches the Electron standalone version. Browser development is still available:

```powershell
npm run dev
npm run electron:dev
```

## Controls

| Action | Input |
| --- | --- |
| Move | WASD / Arrow keys |
| Aim | Mouse |
| Fire / swing | Left click |
| Sprint | Shift |
| Interact | E |
| Reload | R |
| Medkit | H |
| Cycle weapon | Mouse wheel |
| Direct weapon select | 1-6 |
| Pause / menu back | Esc |

## Verify

```powershell
npm run verify
```

Useful individual checks:

```powershell
npm run typecheck
npm run verify:runtime
npm run test:smoke
npm run test:startup
npm run test:campaign
npm run electron:smoke
```

`electron:smoke` checks that production builds use relative asset paths, which is required because Electron loads `dist/index.html` through `file://`.

## Package

```powershell
npm run dist:win
```

`dist`, `release`, and the reference folders are ignored by git.

## Reference Folders

- `roguehero3/` is a local reference for Babylon.js engine structure and tests.
- `wallofdead/` is a local reference for survival horror mood, scares, weapons, and narrative tone.

Do not import from either folder. They are ignored so the root app remains the only live project.
