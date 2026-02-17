# **BadaBada and the Head Full of Flowers**

## **1) Core**

- Genre: Top-down, twin-stick arena shooter.
- Stack: Vite + TypeScript, 2D Canvas/WebGL, `preact` + `@preact/signals`, HTML5 Audio.
- Preferred style: 24x24 pixel-art, integer-upscaled world.
- Prefer pure functional code; use classes only for performance/state-heavy parts.
- Style: double quotes, no semicolons.
- Music: menu `linear & gestalt`, gameplay `MY DIVINE PERVERSIONS`.

## **2) Gameplay**

- 90s match, 1 player vs 7 bots.
- Free-for-all coverage race: 1 player + 7 bots, each with own faction slot.
- Win by flower coverage: highest total flowers at match end.
- On 0 HP: instant safe respawn, infinite lives.
- Controls: WASD move, mouse aim, LMB shoot, RMB grenade/molotov.
- Weapons: infinite pistol fallback, assault/shotgun/flamethrower pickups, grenade + molotov secondary.
- Grenade/Molotov are cooldown based; ammo intentionally low.
- AI states: wander, aggro, flee (low HP).

## **3) Effects & Rules**

- No blood, damage leaves static flowers.
- On hit spawn 10–20 flower sprites behind impact, in cone/radial spread.
- Player damage flowers are white; bot damage flowers use that bot's faction palette.
- Flowers pop from 0 to full quickly.
- Flower coverage score reflects all flowers spawned by each faction.

## **4) UI (Preact + Signals)**

- Top bar: 90s timer and FFA coverage strips by faction (with legend).
- Bottom-left: primary icon + ammo, secondary icon.
- Center: crosshair + floating damage popups in world space.

## **5) Workflow**

- If a user request includes code changes, finish with an atomic commit.

## **6) Auto-Improve Tracker**

### Current Session Progress

- Completed: exhaustive codebase + external best-practice search (architecture, testing, performance, refactor opportunities).
- Completed: AI update-loop micro-optimization in `src/game/systems/ai.ts` (cache `nowMs` once per frame, parse bot index once per bot).
- Completed: added deterministic AI behavior tests in `src/game/systems/ai.test.ts`.
- Completed: dirty flower render queue using `flowerDirtyIndices` set to avoid full flower-array scans in `flushFlowerLayer` (`src/game/render/scene.ts`, `src/game/systems/flowers.ts`, `src/game/systems/molotov.ts`, `src/game/world/state.ts`).
- Completed: projectile broadphase bucket filtering for projectile-unit proximity and hit checks in `src/game/systems/projectiles.ts`.
- Completed: added projectile behavior tests in `src/game/systems/projectiles.test.ts`.
- Completed: reduced avoidable `Math.hypot` usage with squared-distance checks in projectile/combat hot paths (`src/game/systems/projectiles.ts`, `src/game/systems/combat.ts`).
- Completed: reduced transient WebGL buffer view churn by replacing per-frame `bufferData(...subarray(...))` uploads with `bufferSubData` and capacity-time buffer reallocations (`src/game/render/flower-instanced.ts`).
- Completed: decoupled combat damage logic from signal import by injecting infinite-HP check dependency in `applyDamage` (`src/game/systems/combat.ts`, `src/game/game.ts`).
- Completed: added deterministic combat and flower scoring tests in `src/game/systems/combat.test.ts` and `src/game/systems/flowers.test.ts`.
- Completed: reduced nearest-unit lookup scans inside damage attribution by using per-call unit ID map in `applyDamage` (`src/game/systems/combat.ts`).
- Completed: added deterministic molotov behavior tests for scorching and teammate damage filtering in `src/game/systems/molotov.test.ts`.
- Completed: introduced reusable unit lookup cache on world state and synchronized it on active-unit changes (`src/game/world/state.ts`, `src/game/game.ts`, `src/game/systems/combat.ts`).
- Completed: added projectile edge-case tests for contact-fuse path crossing and low-speed ricochet deactivation (`src/game/systems/projectiles.test.ts`).
- Completed: reduced avoidable point-overlap checks in pickup/obstacle collision probes by caching obstacle neighborhood bounds (`src/game/systems/pickups.ts`).
- Completed: added pickup collision regression test for obstacle-blocked movement (`src/game/systems/pickups.test.ts`).
- Completed: added dense-cluster projectile broadphase regression test (`src/game/systems/projectiles.test.ts`).
- Completed: render-order safe WebGL composition optimization that coalesces obstacle-fx + trail composition into one `drawImage` pass when pickup layer is empty (`src/game/render/flower-instanced.ts`, `src/game/render/scene.ts`).
- Completed: added combat attribution edge-case coverage for non-unit source fallback and boundary self-damage scoring (`src/game/systems/combat.test.ts`, `src/game/systems/combat.ts`).
- Completed: exhaustive search-mode research sweep using parallel internal/external agents plus direct grep/ast/ripgrep queries for render/test/perf optimization opportunities.
- Completed: render-path profiling hooks by adding per-frame composition counters on world state (`src/game/world/state.ts`, `src/game/render/composition-plan.ts`, `src/game/render/scene.ts`, `src/game/game.ts`).
- Completed: deterministic render decision tests for composition strategy and profile accounting (`src/game/render/composition-plan.test.ts`).
- Completed: centralized cull-window helper and migrated duplicated cull math in scene/game/instanced render paths (`src/game/cull.ts`, `src/game/render/scene.ts`, `src/game/game.ts`, `src/game/render/flower-instanced.ts`).
- Completed: deterministic cull helper tests (`src/game/cull.test.ts`).
- Completed: verification run (`deno test src/game/cull.test.ts src/game/render/composition-plan.test.ts src/game/systems/ai.test.ts src/game/systems/projectiles.test.ts src/game/systems/combat.test.ts src/game/systems/flowers.test.ts src/game/systems/molotov.test.ts src/game/systems/pickups.test.ts`, `deno task build`).
- Completed: surfaced render-path profiling counters into debug HUD signals and sync path (`src/game/signals.ts`, `src/game/adapters/hud-sync.ts`, `src/game/hud.tsx`).
- Completed: expanded deterministic pickup-visibility composition branch coverage (hidden+no-obstacle fallback, visible+no-obstacle split path, no-trail profile accounting) in `src/game/render/composition-plan.test.ts`.
- Completed: verification run (`deno test src/game/render/composition-plan.test.ts`, `deno task build`).
- Completed: consolidated obstacle-grid camera cull range math into shared helper-driven utility and wired scene obstacle rendering to it (`src/game/render/obstacle-cull.ts`, `src/game/render/scene.ts`).
- Completed: added deterministic obstacle-grid cull range tests for bounds, empty-range, and padding-expansion behavior (`src/game/render/obstacle-cull.test.ts`).
- Completed: verification run (`deno test src/game/render/composition-plan.test.ts src/game/render/obstacle-cull.test.ts`, `deno task build`).
- Completed: centralized render-path profile snapshot compare/clone logic and reused it in HUD sync path (`src/game/adapters/render-path-profile-sync.ts`, `src/game/adapters/hud-sync.ts`).
- Completed: added deterministic render-path profile snapshot sync helper tests (`src/game/adapters/render-path-profile-sync.test.ts`).
- Completed: verification run (`deno test src/game/adapters/render-path-profile-sync.test.ts src/game/render/composition-plan.test.ts src/game/render/obstacle-cull.test.ts`, `deno task build`).
- Completed: added combat attribution edge-case coverage for non-unit source fallback when source team has no living unit (`src/game/systems/combat.test.ts`, `src/game/systems/combat.ts`).
- Completed: filtered dead-unit fallback candidates in damage attribution nearest-team and fallback-id resolution (`src/game/systems/combat.ts`).
- Completed: verification run (`deno test src/game/systems/combat.test.ts src/game/adapters/render-path-profile-sync.test.ts src/game/render/composition-plan.test.ts src/game/render/obstacle-cull.test.ts`, `deno task build`).
- Completed: added HUD-level rolling render-path rate percentages (windowed merged/split and pickup visible/hidden) driven by render profile history snapshots (`src/game/signals.ts`, `src/game/adapters/hud-sync.ts`, `src/game/hud.tsx`, `src/game/adapters/render-path-profile-sync.ts`).
- Completed: expanded deterministic render-path profile sync helper tests with rolling-window rate and frame-rewind reset coverage (`src/game/adapters/render-path-profile-sync.test.ts`).
- Completed: verification run (`deno test src/game/adapters/render-path-profile-sync.test.ts src/game/systems/combat.test.ts src/game/render/composition-plan.test.ts src/game/render/obstacle-cull.test.ts`, `deno task build`).

### Prioritized Next Tasks

1. Add deterministic scene-level tests for pickup-visibility branch decisions (`src/game/render/scene.ts`, `src/game/render/composition-plan.test.ts`).
2. Add deterministic tests around scene-level obstacle rendering range usage to ensure cull helper integration keeps empty-range skip behavior (`src/game/render/scene.ts`, `src/game/render/obstacle-cull.ts`).
3. Add deterministic scene-visible pickup branch seam extraction from `scene.ts` (pure helper) so pickup-visibility logic can be tested without canvas/asset imports (`src/game/render/scene.ts`, `src/game/render/*.test.ts`).
4. Add deterministic tests for rolling-rate signal update cadence under sparse frame history sampling to validate stability of HUD percentage readouts (`src/game/adapters/render-path-profile-sync.ts`, `src/game/adapters/render-path-profile-sync.test.ts`).
