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
