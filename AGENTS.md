# **Project Specification: "BadaBada and the Head Full of Flowers"**

## **1. Project Overview & Architecture**

- **Genre:** Top-down, twin-stick, arena shooter (Splatoon x Nuclear Throne).
- **Tech Stack:**
  - **Runtime:** Browser (Vite + Vanilla JS logic + TypeScript).
  - **Graphics:** 24x24 2D pixel-art sprites, integer-upscaled rendering.
  - **Renderer:** 2D canvas pipeline (Canvas2D or WebGL2 sprite batching).
  - **UI:** `preact` + `@preact/signals`.
  - **Audio:** HTML5 Audio, use procedurally generated 8-bit style SFX.
  - You are allowed to add any 3rd party library for any purpose, but prefer jsr.io's `@std/*` libraries.
- **Coding Style:**
  - **Quotes:** Double quotes (`"`) exclusively.
  - **Semicolons:** **NO** semicolons.
  - **Structure:** for parts that doesn't need performance, prefer functional programming and pure functions. Use modular ES6 classes only when needed.
- **Music:**
  - `linear & gestalt`: main menu music
  - `MY DIVINE PERVERSIONS`: main gameplay loop music

## **2. Visuals & Graphics**

### **2.1. Environment**

- **Background:** Pale light-green, stylized 2D tile map with subtle texture variation and faint parallax haze at far edges.
- **Terrain:** Flat circular arena (50-meter equivalent diameter in world units) made from grass tiles.

### **2.2. Characters**

- **Style:** Pixel-art catgirls with visible body and gun sprites.
- **Representation:** Frame-based 2D sprite sheets for player, bots, and projectiles.

### **2.3. The "Flower Splatter" System (Core Visual Mechanic)**

- **Concept:** No blood. Damage spawns static flowers on the ground.
- **Implementation:** Use a pooled 2D sprite layer (or texture atlas batches) for dynamic flower spawn and reuse.
- **Logic:**
  - **Event:** Bullet hits Unit.
  - **Visual:** Spawn 10-20 flower sprites in a cone/radial pattern behind the impact point.
  - **Colors:**
    - If **Player** shoots Enemy -> **White Flowers** spawn.
    - If **Enemy** shoots Player -> **Blue Flowers** spawn on/near the player.
  - **Animation:** Flowers scale from 0 to 1 in a single pop-in frame (or very short ease).

## **3. Gameplay Logic**

### **3.1. Match Rules**

- **Duration:** 90 seconds.
- **Participants:** 1 Human Player vs. 7 AI bots.
- **Teams:** Free-for-all / Player vs All for this spec: Player (White) vs 7 Bots (Blue).
- **Win Condition:** Score Attack on "Flower Coverage". Faction with most flowers on map at end of match wins.
- **Respawn:**
  - **Condition:** HP reaches 0.
  - **Action:** Instant respawn at a random safe location.
  - **Lives:** Infinite.

### **3.2. Controls**

- **Movement:** WASD.
- **Aim:** Mouse cursor.
- **Fire:** Left click.
- **Alt Fire / Grenade:** Right click.
- **Select Perk:** Keys `1`, `2`, `3`.

### **3.3. Combat Mechanics**

- **Projectiles (Nuclear Throne Style):**
  - **Visual:** Large, glowing yellow spheres/capsules.
  - **Physics:** Very high initial velocity.
  - **Drag:** Move fast, then decelerate rapidly near max range (snap disappear).
- **Weapons:**
  - **Inventory:** 1 Primary, 1 Secondary.
  - **Default Primary:** Infinite pistol (equipped automatically if primary ammo runs out).
  - **Lootable Primaries:** Assault rifle, shotgun, flamethrower (spawn randomly on map).
  - **Secondary:** Grenade (cooldown-based), Molotov.
  - **Ammo Economy:** Very low (2-3 magazines worth), forcing constant movement to find new guns.

### **3.4. AI Behavior**

- Simple state machine:
  1. **Wander:** Move randomly.
  2. **Aggro:** Detect target within range, move closer, shoot.
  3. **Flee:** If HP low, move away from nearest enemy.

### **3.5. Perk System**

- **Trigger:** Every _N_ flowers spawned by the player (calculated via a signal score counter).
- **UI:** Prompt appears with 3 random choices.
- **Input:** Player presses `1`, `2`, or `3` (game does **not** pause).
- **Examples:**
  - `Photosynthesis`: +30% Damage.
  - `Pollen Spread`: +25% Bullet Size, -10% Fire Rate.
  - `Deep Roots`: Max HP +50.

## **4. UI Specification (Preact + Signals)**

### **4.1. HUD Elements**

- **Top Bar:**
  - Time Remaining (90s countdown).
  - Score bar split horizontally between White (Player) and Blue (Enemy) coverage %.
- **Bottom Left:**
  - Current weapon icon and ammo count.
  - Secondary weapon icon.
- **Bottom Center:**
  - Perk Selection overlay (visible only when available).
  - `Press 1: [Perk A] | Press 2: [Perk B] | Press 3: [Perk C]`
- **Center Screen:**
  - Crosshair that follows the mouse.
  - Damage indicators as world-space text popping off enemies.
