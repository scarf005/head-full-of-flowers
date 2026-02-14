# Modularization Plan for Parallel Agent Development

## Goal

Refactor the game runtime so multiple AI coding agents can safely work in parallel on the same branch with minimal merge conflicts and predictable integration.

## Success Criteria

- `src/game/game.ts` becomes a thin orchestrator (no gameplay detail logic)
- Gameplay logic is split into independent modules with stable function contracts
- Rendering, simulation, input, audio, and HUD sync are separated
- At least 3 agents can work in parallel on different modules with low conflict risk
- Existing gameplay behavior remains effectively unchanged during the refactor

## Non-Goals

- Full ECS rewrite in this pass
- Gameplay rebalance or new content features
- Art/audio overhaul

## Current Pain Points

- `src/game/game.ts` is a monolith containing state, update loop, systems, rendering, input, and audio coupling
- High conflict probability because most feature changes touch the same file
- Hard to assign isolated work packages to parallel agents

## Target Architecture (ECS-lite, module-first)

```txt
src/game/
  world/
    state.ts
    init.ts
    pools.ts
    constants.ts
  systems/
    player.ts
    ai.ts
    collisions.ts
    combat.ts
    projectiles.ts
    throwables.ts
    molotov.ts
    flowers.ts
    pickups.ts
    respawn.ts
  render/
    scene.ts
    ground.ts
    entities.ts
    effects.ts
    overlay.ts
  adapters/
    input.ts
    audio.ts
    hud-sync.ts
  game.ts
```

## Design Rules

1. Keep systems mostly pure
   - System signature shape: `(world, dt) => void`
   - Do not read DOM/canvas/signals directly inside systems

2. Keep adapters side-effect only
   - Input/audio/HUD interact with browser APIs and signals
   - Adapters should not own gameplay decisions

3. Stable contracts first
   - Define `WorldState` and system interfaces early
   - Avoid changing contracts mid-phase unless blocking

4. Behavior-preserving extraction
   - Move existing logic first, then improve internals
   - Prefer copy-extract-verify over redesign during migration

## Core Contracts

### World

- `WorldState` owns all mutable game data (units, pools, timers, counters, flags)
- `RuntimeState` holds loop-level control (`running`, `started`, `finished`, `dt` metadata)
- `ViewState` stores camera and render-relevant cached values

### Systems

- `updatePlayer(world, dt)`
- `updateAI(world, dt)`
- `resolveCollisions(world)`
- `updateProjectiles(world, dt)`
- `updateThrowables(world, dt)`
- `updateMolotovZones(world, dt)`
- `updateFlowers(world, dt)`
- `updatePickups(world, dt)`

### Adapters

- `inputAdapter` updates input state from keyboard/mouse
- `audioAdapter` handles playback/sfx triggers from events
- `hudSyncAdapter` maps world state to Preact signals

## Migration Phases

### Phase 0: Baseline and Guardrails

- Add architecture doc comments in `PLAN.md` and define folder layout
- Record baseline behavior notes (timers, fire rates, damage, spawn pacing)
- Verify app still builds with `deno task build`

Exit criteria:

- Baseline build passes
- Scope boundaries agreed

### Phase 1: Extract World State

- Create `src/game/world/state.ts` with `WorldState` interface and init factory
- Move constants/pool initialization into `world/constants.ts` and `world/pools.ts`
- Keep `game.ts` behavior unchanged, but read/write through world object

Exit criteria:

- No gameplay behavior change
- `game.ts` still large but state ownership centralized

### Phase 2: Extract Simulation Systems

- Move update logic into `systems/*` files incrementally:
  - first: `flowers`, `damage-popups`, `pickups`
  - second: `projectiles`, `throwables`, `molotov`
  - third: `player`, `ai`, `collisions`, `combat`
- Keep orchestration order in `game.ts`

Exit criteria:

- `game.ts` mostly orchestration calls
- Systems have narrow imports and no signal usage

### Phase 3: Extract Rendering

- Split rendering into `render/*` modules:
  - map/ground
  - entities (units/projectiles/throwables)
  - effects (flowers/explosions/popups)
  - overlays/menu
- `game.ts` calls a single `renderScene(world, ctx, dt)`

Exit criteria:

- Render code no longer interleaved with sim logic
- Visual output remains equivalent

### Phase 4: Extract Adapters

- Move input handlers to `adapters/input.ts`
- Move signal updates to `adapters/hud-sync.ts`
- Keep audio in adapter boundary (`adapters/audio.ts`)

Exit criteria:

- Systems do not import signals or DOM APIs
- Side effects isolated to adapters

### Phase 5: Parallel-Agent Workflow Hardening

- Add ownership map by folder for agent assignment
- Freeze shared contracts during sprint windows (`world/state.ts`, system signatures)
- Enforce one module family per agent task

Exit criteria:

- 3+ parallel tasks can be executed with low conflict risk
- Merge process is documented and repeatable

## Parallel Workstream Map

### Workstream A: World + Contracts

- Files: `src/game/world/*`
- Responsibility: state shape, init, pools, constants

### Workstream B: Combat Simulation

- Files: `src/game/systems/combat.ts`, `src/game/systems/projectiles.ts`, `src/game/systems/throwables.ts`, `src/game/systems/molotov.ts`
- Responsibility: damage, hit resolution, projectile/throwable lifecycle

### Workstream C: Agent Behavior and Movement

- Files: `src/game/systems/player.ts`, `src/game/systems/ai.ts`, `src/game/systems/collisions.ts`, `src/game/systems/respawn.ts`
- Responsibility: movement, AI state machine, constraints, collision resolution

### Workstream D: Rendering

- Files: `src/game/render/*`
- Responsibility: draw pipeline and visual layers only

### Workstream E: Integration and Adapters

- Files: `src/game/adapters/*`, `src/game/game.ts`
- Responsibility: orchestration, input events, HUD sync, audio hooks

## Merge and Conflict Policy

- Contract files are locked during active parallel implementation windows:
  - `src/game/world/state.ts`
  - system function signatures
- If a contract change is required, land a dedicated small integration PR first, then rebase all workstreams
- Avoid cross-folder edits unless task is tagged as `integration`
- Keep each merge atomic and focused on one module family

## Verification Checklist per Phase

- `deno task build` passes
- Controls still work (WASD, mouse aim/fire, RMB throw)
- Match timer, shrinking arena, respawns, and scoring still work
- No major FPS regression observed in browser
- HUD values remain in sync with gameplay state

## Risks and Mitigations

- Risk: Contract churn causes widespread conflicts
  - Mitigation: Freeze contracts per phase and batch changes through integration owner

- Risk: Behavior drift during extraction
  - Mitigation: Move logic with minimal edits first, optimize later

- Risk: Hidden coupling to signals/audio in systems
  - Mitigation: Route all side effects through adapters only

## Definition of Done

- `src/game/game.ts` reduced to orchestration and lifecycle concerns
- Gameplay systems live under `src/game/systems/`
- Rendering isolated under `src/game/render/`
- Input/audio/HUD side effects isolated under `src/game/adapters/`
- Team can assign parallel agent tasks by folder without frequent merge conflicts
