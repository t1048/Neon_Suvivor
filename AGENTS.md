# AGENTS.md — Neon Survivor

## Project
Top-down survival game. **Zero build step.** Open `index.html` in a browser to run.
Deployed to GitHub Pages at `https://t1048.github.io/Neon_Suvivor`.

## Run / Debug
- Open `index.html` directly, or serve statically: `python -m http.server`
- No npm/pip/build toolchain. Regression checks: `node --test tests/gameplay.test.cjs` (Node built-ins only). No linter or typecheck configured.
- Console debug helpers: `resetGame()`, `spawnBoss()`, `soundManager.startBGM()`, `soundManager.setWave(n)`

## File Roles
| File | Purpose |
|---|---|
| `index.html` | UI elements (overlays, audio panel, touch joystick), script load order |
| `js/Neon_Suvivor.js` | Main loop, input, `gameState`, spawning, UI updates, score persistence |
| `js/presentation.js` | Cosmetic weapon palettes, growth stages, impact and growth effects; no combat rules |
| `js/gameplay.js` | Run-only build progression, effective stats, selections, weapon firing, wave composition |
| `js/data.js` | Balance data: `weaponsInitial`, `upgrades`, `enemyTypes` |
| `js/entities.js` | Projectile/effect classes: `Bullet`, `RotatingBlade`, `BombProjectile`, `Landmine`, `FloatingText`, `Particle` |
| `js/bosses.js` | Boss classes extending `BossBase`, `createRandomBoss()` |
| `js/audio.js` | `SoundManager` — Web Audio API BGM scheduler, SFX, boss mode, overheat |
| `css/Neon_Suvivor.css` | All styles |

## Script Load Order (matters)
`data.js` → `audio.js` → `entities.js` → `bosses.js` → `presentation.js` → `gameplay.js` → `Neon_Suvivor.js`
Globals are shared; files depend on each other via global scope.

## Architecture Gotchas
- **All state is global.** `gameState`, `player`, `enemies`, `bullets`, `bosses`, `camera`, `frameCount`, etc. are module-level variables.
- **Array mutation via `splice`.** Dead entities are marked (`this.marked = true`), then spliced out. Follow this pattern; do not switch to filter-without-splice.
- **Frame timing:** fixed 60Hz simulation driven by requestAnimationFrame; `frameCount` counts simulation ticks and `timeSeconds` accumulates seconds. Wave advances every 30 seconds. Boss spawns at `wave % 5 === 0`.
- **Balance helpers (`gameplay.js`):** enemy speed comes from `enemyMoveSpeed(spdMul)` (capped at 0.85× / 1.0× of `PLAYER_BASE_SPEED` for fast types); boss HP is multiplied by `bossHpScale(wave)` (0.8 at wave 5, 1.0 from wave 10). Use these instead of inlining formulas.
- **Audio routing:** weapon SFX (`playWeapon`, `playClassic*`, `sfxVoice`) go through `sfxOut()` (`sfxGain` → compressor → limiter). BGM and UI sounds (level up, gem, boss spawn) still connect to `masterGain` directly.
- **World size:** 3000×3000. Camera follows player with zoom that varies by viewport (0.6 landscape mobile, 0.75 portrait mobile, 0.85 desktop).
- **Canvas uses `devicePixelRatio`.** Drawing uses CSS pixels (`cssWidth`/`cssHeight`); world drawing accounts for `camera.zoom`.
- **`gameState` values:** `"start"`, `"playing"`, `"levelup"`, `"weaponselect"`, `"reward"`, `"meta"`, `"gameover"` (see `GAME_STATES` constant).
- **Audio requires user gesture.** `soundManager.init()` is called on Start button click (autoplay policy).
- **Overclock:** effective cooldown < 9 ticks shows a brief floating label once per weapon per run (except `sanctuary`/`blade`); no permanent error mode.

## Adding Content
- **New weapon:** add entry to `weaponsInitial` in `data.js`, add growth data and implement firing logic in `gameplay.js`, add projectile class to `entities.js` if needed.
- **New boss:** add class extending `BossBase` in `bosses.js`, register in `createRandomBoss()` array.
- **New upgrade:** add to `upgrades` array in `data.js`.
- **New SFX:** add method to `SoundManager` in `audio.js`.

## Persistence
- High scores: `localStorage` key `neonSurvivorScores` (top 5).
- Meta upgrades: `localStorage` key `neonSurvivorMeta`.

## Language
README and copilot instructions are in Japanese. Code comments are mixed Japanese/English. Keep consistency with existing style.
