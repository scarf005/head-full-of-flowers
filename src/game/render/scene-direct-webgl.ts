import { buildCullBounds, isInsideCullBounds, type CullBounds } from "../cull.ts"
import { clamp } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import {
  OBSTACLE_FLASH_BLOCKED,
  OBSTACLE_FLASH_DAMAGED,
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_HEDGE,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter,
} from "../world/obstacle-grid.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { buildObstacleGridCullRange } from "./obstacle-cull.ts"
import { buildOffscreenIndicatorAnchor, isOffscreenIndicatorAnchorInView } from "./offscreen-indicator-visibility.ts"
import { paletteForRagdoll, paletteForUnit } from "./scene-palette.ts"
import { computeHorizontalSkewX, computeWeaponKickbackDistance } from "./unit-motion-transform.ts"
import { computeDamageTakenRatio } from "./vignette.ts"
import { DirectWebGLRenderer } from "./webgl-direct-renderer.ts"
import { renderDirectExplosions } from "./webgl-direct-explosions.ts"
import { renderDirectFlightTrails } from "./webgl-direct-flight-trails.ts"
import {
  canonicalWebGLSpriteId,
  itemSpriteHeight,
  LOOT_SPRITE_SIZE,
  resolveWeaponSpriteId,
} from "./webgl-direct-sprites.ts"
import {
  drawDirectWorldLayer,
  ensureDirectFlowerLayer,
  ensureDirectGroundLayer,
  flushDirectFlowerLayer,
  GRASS_BASE_COLOR,
  renderDirectBloomingFlowers,
} from "./webgl-direct-static-layers.ts"

export interface RenderSceneArgs {
  renderer: DirectWebGLRenderer
  world: WorldState
  dt: number
}

interface ViewportOverflowPx {
  left: number
  top: number
  right: number
  bottom: number
}

const TWO_PI = Math.PI * 2

const EMPTY_OVERFLOW: ViewportOverflowPx = { left: 0, top: 0, right: 0, bottom: 0 }
const VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS = 180
const ROCKET_TRAIL_LENGTH_MULTIPLIER = 4
const PRIMARY_RELOAD_RING_THICKNESS_WORLD = 3 / WORLD_SCALE
const PRIMARY_RELOAD_RING_OFFSET_WORLD = 0.22
const SECONDARY_RELOAD_RING_THICKNESS_WORLD = 2 / WORLD_SCALE
const DAMAGE_VIGNETTE_MAX_ALPHA = 0.76
const DAMAGE_VIGNETTE_INTENSITY_CURVE = 0.62
const MINIMAP_SIZE_PX = 164 * 0.8
const MINIMAP_PADDING_PX = 12
const MINIMAP_UNIT_RADIUS_PX = 2.1
const MINIMAP_PLAYER_RADIUS_PX = 2.8
const MINIMAP_ARENA_REFRESH_DELTA = 0.35
const PROJECTILE_CURVE_SEGMENTS = 8
const projectileOutlineScratch: number[] = []

const appendProjectileQuadratic = (
  output: number[],
  positionX: number,
  positionY: number,
  cos: number,
  sin: number,
  fromX: number,
  fromY: number,
  controlX: number,
  controlY: number,
  toX: number,
  toY: number,
  includeStart: boolean,
) => {
  for (let index = includeStart ? 0 : 1; index <= PROJECTILE_CURVE_SEGMENTS; index += 1) {
    const t = index / PROJECTILE_CURVE_SEGMENTS
    const inverse = 1 - t
    const localX = inverse * inverse * fromX + 2 * inverse * t * controlX + t * t * toX
    const localY = inverse * inverse * fromY + 2 * inverse * t * controlY + t * t * toY
    output.push(
      positionX + localX * cos - localY * sin,
      positionY + localX * sin + localY * cos,
    )
  }
}

let grassWaveTime = Math.random() * Math.PI * 2
let viewportOverflowCache: { canvas: HTMLCanvasElement | null; nextSampleAt: number; value: ViewportOverflowPx } = {
  canvas: null,
  nextSampleAt: 0,
  value: EMPTY_OVERFLOW,
}

interface MinimapObstacleCache {
  renderer: DirectWebGLRenderer | null
  gridRef: WorldState["obstacleGrid"] | null
  revision: number
  arenaRadius: number
  sizePx: number
  target: ReturnType<DirectWebGLRenderer["createRenderTarget"]> | null
}

let minimapObstacleCache: MinimapObstacleCache = {
  renderer: null,
  gridRef: null,
  revision: -1,
  arenaRadius: 0,
  sizePx: 0,
  target: null,
}

const inside = (x: number, y: number, bounds: CullBounds, padding = 0) =>
  isInsideCullBounds(x, y, bounds, padding)

const measureViewportOverflow = (renderer: DirectWebGLRenderer): ViewportOverflowPx => {
  if (typeof globalThis.innerWidth !== "number" || typeof globalThis.innerHeight !== "number") return EMPTY_OVERFLOW
  const now = typeof performance !== "undefined" ? performance.now() : 0
  if (viewportOverflowCache.canvas === renderer.canvas && now < viewportOverflowCache.nextSampleAt) {
    return viewportOverflowCache.value
  }
  const rect = renderer.canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return EMPTY_OVERFLOW
  const sx = renderer.canvas.width / rect.width
  const sy = renderer.canvas.height / rect.height
  const value = {
    left: Math.max(0, -rect.left) * sx,
    top: Math.max(0, -rect.top) * sy,
    right: Math.max(0, rect.right - globalThis.innerWidth) * sx,
    bottom: Math.max(0, rect.bottom - globalThis.innerHeight) * sy,
  }
  viewportOverflowCache = { canvas: renderer.canvas, nextSampleAt: now + VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS, value }
  return value
}

const drawFallbackItem = (renderer: DirectWebGLRenderer, x: number, y: number, height: number, rotation = 0) => {
  renderer.rect(x - height * 0.5, y - height * 0.5, height, height, "#f3f5f0", 0.9, rotation)
  const half = height * 0.28
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const ax = x + x0 * c - y0 * s
    const ay = y + x0 * s + y0 * c
    const bx = x + x1 * c - y1 * s
    const by = y + x1 * s + y1 * c
    renderer.line(ax, ay, bx, by, height * 0.12, "#bb2f2f", 0.9)
  }
  line(-half, 0, half, 0)
  line(0, -half, 0, half)
}

const drawItem = (
  renderer: DirectWebGLRenderer,
  spriteId: string,
  x: number,
  y: number,
  size = LOOT_SPRITE_SIZE,
  rotation = 0,
  anchorX = 0.5,
  flipY = false,
  alpha = 1,
) => {
  const height = itemSpriteHeight(size)
  if (!renderer.sprite(canonicalWebGLSpriteId(spriteId), x, y, height, { anchorX, rotation, flipY, alpha })) {
    drawFallbackItem(renderer, x, y, height, rotation)
  }
}

const renderArenaGround = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  cameraX: number,
  cameraY: number,
  waveTime: number,
) => {
  renderer.useWorldView(cameraX, cameraY, WORLD_SCALE, VIEW_WIDTH, VIEW_HEIGHT)
  renderer.circle(0, 0, world.arenaRadius, "#a3c784", 1, 64)
  renderer.beginCircleClip(0, 0, Math.max(0.1, world.arenaRadius - 0.12))

  const cull = buildCullBounds(cameraX, cameraY, 3)
  const ground = ensureDirectGroundLayer(renderer, world)
  if (ground.target) {
    const halfMap = ground.size * 0.5
    const minX = Math.max(-halfMap, cull.minX)
    const maxX = Math.min(halfMap, cull.maxX)
    const minY = Math.max(-halfMap, cull.minY)
    const maxY = Math.min(halfMap, cull.maxY)
    drawDirectWorldLayer(renderer, ground, minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  } else {
    renderer.rect(cull.minX, cull.minY, cull.maxX - cull.minX, cull.maxY - cull.minY, GRASS_BASE_COLOR)
  }

  const stripeHeight = 2.4
  for (let y = cull.minY - stripeHeight; y < cull.maxY + stripeHeight; y += stripeHeight) {
    const alpha = clamp((Math.sin(y * 0.34 + waveTime * 0.7) * 0.5 + 0.5) * 0.16, 0.03, 0.16)
    renderer.rect(cull.minX - 1, y, cull.maxX - cull.minX + 2, stripeHeight, "#51634b", alpha * 0.08)
  }
  renderer.endClip()
}

const renderFlowers = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  const layer = flushDirectFlowerLayer(renderer, world)
  if (layer.target) {
    const halfMap = layer.size * 0.5
    const minX = Math.max(-halfMap, cull.minX)
    const maxX = Math.min(halfMap, cull.maxX)
    const minY = Math.max(-halfMap, cull.minY)
    const maxY = Math.min(halfMap, cull.maxY)
    drawDirectWorldLayer(renderer, layer, minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  }
  renderDirectBloomingFlowers(renderer, world, cull)
}

const renderMolotovZones = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const zone of world.molotovZones) {
    if (!zone.active || !inside(zone.position.x, zone.position.y, cull, zone.radius + 0.5)) continue
    const fullLife = zone.source === "flame" ? 3 : 2.2
    const alpha = clamp(zone.life / fullLife, 0, 1)
    if (zone.source === "flame") renderer.circle(zone.position.x, zone.position.y, zone.radius * 1.06, "#28221b", 0.46 * alpha)
    renderer.circle(
      zone.position.x,
      zone.position.y,
      zone.radius,
      zone.source === "flame" ? "#d66c28" : "#f4782e",
      (zone.source === "flame" ? 0.3 : 0.24) * alpha,
    )
    renderer.ring(
      zone.position.x,
      zone.position.y,
      Math.max(0.06, zone.radius - 0.2),
      0.15,
      zone.source === "flame" ? "#ffc184" : "#ffb054",
      (zone.source === "flame" ? 0.55 : 0.5) * alpha,
    )
  }
}

const renderObstacles = (renderer: DirectWebGLRenderer, world: WorldState) => {
  const grid = world.obstacleGrid
  const cullRange = buildObstacleGridCullRange(grid.size, world.camera.x, world.camera.y, 2)
  if (cullRange.maxX < cullRange.minX || cullRange.maxY < cullRange.minY) return
  for (let gy = cullRange.minY; gy <= cullRange.maxY; gy += 1) {
    for (let gx = cullRange.minX; gx <= cullRange.maxX; gx += 1) {
      const index = gy * grid.size + gx
      if (grid.solid[index] <= 0) continue
      const material = grid.material[index]
      const center = obstacleGridToWorldCenter(grid.size, gx, gy)
      const x = center.x - 0.5
      const y = center.y - 0.5
      if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
        renderer.rect(x, y, 1, 1, "#5f655d")
        renderer.rect(x + 0.08, y + 0.08, 0.84, 0.84, "#9ca293")
        renderer.rect(x + 0.08, y + 0.46, 0.84, 0.12, "#757b70")
      } else if (material === OBSTACLE_MATERIAL_WALL) {
        renderer.rect(x, y, 1, 1, "#874b39")
        renderer.rect(x + 0.06, y + 0.06, 0.88, 0.88, "#ab6850")
        renderer.rect(x + 0.06, y + 0.46, 0.88, 0.08, "#6e3528")
      } else if (material === OBSTACLE_MATERIAL_BOX) {
        const high = grid.highTierLoot[index] > 0
        renderer.rect(x, y, 1, 1, high ? "#4d535b" : "#6f2d2b")
        renderer.rect(x + 0.06, y + 0.06, 0.88, 0.88, high ? "#d7dde6" : "#df6f3f")
        renderer.rect(x + 0.12, y + 0.12, 0.76, 0.24, high ? "#f4f8ff" : "#ffd36e")
        renderer.rect(x + 0.44, y + 0.08, 0.12, 0.84, high ? "#ffffff" : "#f6e5a8")
        renderer.rect(x + 0.08, y + 0.54, 0.84, 0.1, high ? "#96a0ad" : "#a1402e")
      } else if (material === OBSTACLE_MATERIAL_ROCK) {
        renderer.rect(x, y, 1, 1, "#676a64")
        renderer.rect(x + 0.08, y + 0.08, 0.84, 0.84, "#8f948b")
        renderer.rect(x + 0.14, y + 0.14, 0.72, 0.08, "#5d605a")
      } else if (material === OBSTACLE_MATERIAL_HEDGE) {
        renderer.rect(x, y, 1, 1, "#496d41")
        renderer.rect(x + 0.06, y + 0.06, 0.88, 0.88, "#a9c99a")
        renderer.rect(x + 0.12, y + 0.12, 0.76, 0.2, "#d2e6c7")
        renderer.rect(x + 0.08, y + 0.56, 0.84, 0.12, "#7ea976")
      }
      const flash = grid.flash[index]
      if (flash > 0.01) {
        const flashKind = grid.flashKind[index]
        if (flashKind === OBSTACLE_FLASH_BLOCKED) {
          const flicker = 0.4 + Math.sin((1 - flash) * 40) * 0.3
          renderer.rect(x + 0.04, y + 0.04, 0.92, 0.92, "#ffffff", clamp(flash * flicker, 0, 1) * 0.72)
        } else if (flashKind === OBSTACLE_FLASH_DAMAGED) {
          const flicker = 0.6 + Math.sin((1 - flash) * 44) * 0.4
          const intensity = clamp(flash * flicker, 0, 1)
          renderer.rect(x + 0.03, y + 0.03, 0.94, 0.94, "#ff7026", intensity * 0.95)
          renderer.rect(x + 0.12, y + 0.12, 0.76, 0.76, "#ffd68a", intensity * 0.5)
        }
      }
    }
  }
}

const renderObstacleFx = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const debrisIndex of world.activeObstacleDebrisIndices) {
    const debris = world.obstacleDebris[debrisIndex]
    if (!debris?.active || debris.maxLife <= 0 || !inside(debris.position.x, debris.position.y, cull, debris.size + 0.35)) continue
    const life = clamp(debris.life / debris.maxLife, 0, 1)
    const size = debris.size * (0.7 + (1 - life) * 0.5)
    renderer.rect(debris.position.x - size * 0.5, debris.position.y - size * 0.5, size, size, debris.color, life * life, debris.rotation)
  }

  for (const petalIndex of world.activeKillPetalIndices) {
    const petal = world.killPetals[petalIndex]
    if (!petal?.active || petal.maxLife <= 0 || !inside(petal.position.x, petal.position.y, cull, petal.size + 0.35)) continue
    const life = clamp(petal.life / petal.maxLife, 0, 1)
    const age = 1 - life
    const alpha = clamp(age / 0.14, 0, 1) * life ** 0.9
    const size = petal.size * (0.84 + age * 0.42)
    const c = Math.cos(petal.rotation)
    const s = Math.sin(petal.rotation)
    const hw = size * 0.28
    const hh = size * 0.7
    const points: number[] = []
    for (const [lx, ly] of [[-hw, 0], [0, -hh], [hw, 0], [0, hh]] as const) {
      points.push(petal.position.x + lx * c - ly * s, petal.position.y + lx * s + ly * c)
    }
    renderer.polygon(points, petal.color, alpha)
  }
}

const renderShellCasings = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const index of world.activeShellCasingIndices) {
    const casing = world.shellCasings[index]
    if (!casing?.active || casing.maxLife <= 0 || !inside(casing.position.x, casing.position.y, cull, casing.size + 0.3)) continue
    const life = clamp(casing.life / casing.maxLife, 0, 1)
    if (casing.spriteId) {
      drawItem(renderer, casing.spriteId, casing.position.x, casing.position.y, casing.spriteSize > 0 ? casing.spriteSize : casing.size, casing.rotation, 0.5, false, life * 0.9)
    } else {
      renderer.rect(
        casing.position.x - casing.size * 0.5,
        casing.position.y - casing.size * 0.28,
        casing.size,
        casing.size * 0.56,
        "#e7c66a",
        life * 0.9,
        casing.rotation,
      )
    }
  }
}

const renderPickups = (renderer: DirectWebGLRenderer, world: WorldState, dt: number, cull: CullBounds) => {
  for (const pickup of world.pickups) {
    if (!pickup.active || !inside(pickup.position.x, pickup.position.y, cull, pickup.radius + 0.5)) continue
    const bob = Math.sin(pickup.bob + dt * 4) * 0.14
    const pulse = 0.35 + (Math.sin(pickup.bob * 1.6) * 0.5 + 0.5) * 0.35
    const glow = pickup.kind === "perk" ? "#ff7676" : pickup.highTier ? "#f4f8ff" : "#ffd668"
    renderer.circle(pickup.position.x, pickup.position.y + bob, 0.68 + pulse * 0.22, glow, 0.18 + pulse * 0.2)
    renderer.ring(pickup.position.x, pickup.position.y + bob, 0.5 + pulse * 0.14, 0.08, glow, 0.28 + pulse * 0.35)
    renderer.ellipse(pickup.position.x, pickup.position.y + 0.55, 0.45, 0.2, "#000000", 0.2)
    const id = pickup.kind === "perk" && pickup.perkId ? pickup.perkId : pickup.weapon
    drawItem(renderer, id, pickup.position.x, pickup.position.y + bob)
  }
}

const renderThrowables = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const throwable of world.throwables) {
    if (!throwable.active || !inside(throwable.position.x, throwable.position.y, cull, throwable.radius + 0.8)) continue
    renderer.ellipse(throwable.position.x, throwable.position.y + 0.21, 0.2, 0.11, "#000000", 0.26)
    drawItem(renderer, throwable.mode === "grenade" ? "grenade" : "molotov", throwable.position.x, throwable.position.y, 0.08, throwable.rotation)
  }
}

const renderFlamePixel = (renderer: DirectWebGLRenderer, x: number, y: number) => {
  const size = 0.07
  const rows = ["........", "...r....", "..rrr...", ".rCCyyr.", "..rCCr..", "...rr...", "....r...", "........"]
  const colors: Record<string, string> = { r: "#8f3a2e", C: "#b6f5e9", y: "#d4aa3a" }
  const half = rows.length * size * 0.5
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < rows[row].length; col += 1) {
      const color = colors[rows[row][col]]
      if (color) renderer.rect(x - half + col * size, y - half + row * size, size, size, color)
    }
  }
}

const renderProjectiles = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  const draw = (projectile: WorldState["projectiles"][number]) => {
    if (!projectile.active || !inside(projectile.position.x, projectile.position.y, cull, projectile.radius * 3.2 + 0.7)) return
    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const stretch = projectile.kind === "rocket"
      ? clamp(speed / 25, 0.2, 2.9)
      : clamp(speed / 25, 1.1, projectile.kind === "flame" ? 2.2 : 2.9)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)
    renderer.ellipse(projectile.position.x, projectile.position.y + 0.26, projectile.radius * 0.8, projectile.radius * 0.45, "#000000", 0.26)
    if (projectile.kind === "flame") renderer.circle(projectile.position.x, projectile.position.y, glow, "#ff9448", 0.36, 14)
    else renderer.circle(projectile.position.x, projectile.position.y, projectile.radius * 1.05, "#fff5d0", 0.16, 12)
    if (projectile.kind === "flame") {
      renderFlamePixel(renderer, projectile.position.x, projectile.position.y)
      return
    }
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    const glowOffset = -length * 0.2
    renderer.ellipse(
      projectile.position.x + glowOffset * c,
      projectile.position.y + glowOffset * s,
      length * 0.55,
      width * 0.86,
      "#ffb548",
      0.35,
      angle,
      24,
    )

    // The old Canvas2D projectile used two quadratic curves. Sampling the
    // same curves into a reused scratch buffer preserves that silhouette
    // without allocating per projectile or leaving the WebGL batch.
    projectileOutlineScratch.length = 0
    appendProjectileQuadratic(
      projectileOutlineScratch,
      projectile.position.x,
      projectile.position.y,
      c,
      s,
      -length * 0.52,
      0,
      -length * 0.2,
      -width * 0.65,
      length * 0.45,
      0,
      true,
    )
    appendProjectileQuadratic(
      projectileOutlineScratch,
      projectile.position.x,
      projectile.position.y,
      c,
      s,
      length * 0.45,
      0,
      -length * 0.2,
      width * 0.65,
      -length * 0.52,
      0,
      false,
    )
    renderer.polygon(projectileOutlineScratch, "#ffc248")
    const coreOffset = length * 0.18
    renderer.ellipse(
      projectile.position.x + coreOffset * c,
      projectile.position.y + coreOffset * s,
      width * 0.4,
      width * 0.3,
      "#fff2aa",
      1,
      angle,
    )
  }
  if (world.activeProjectileIndices.size > 0) {
    for (const index of world.activeProjectileIndices) {
      const projectile = world.projectiles[index]
      if (projectile) draw(projectile)
    }
  } else {
    for (const projectile of world.projectiles) draw(projectile)
  }
}

const renderRagdolls = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const ragdoll of world.ragdolls) {
    if (!ragdoll.active || ragdoll.maxLife <= 0 || ragdoll.life <= 0 || !inside(ragdoll.position.x, ragdoll.position.y, cull, ragdoll.radius * 2.8 + 0.75)) continue
    const body = ragdoll.radius * 1.2
    const palette = paletteForRagdoll(world, ragdoll)
    renderer.ellipse(ragdoll.position.x, ragdoll.position.y + body * 1.24, body * 0.58, body * 0.31, "#000000", 0.2)
    renderer.rect(ragdoll.position.x - body * 0.85, ragdoll.position.y - body, body * 1.7, body * 2, palette.edge, 1, ragdoll.rotation)
    renderer.rect(ragdoll.position.x - body * 0.68, ragdoll.position.y - body * 0.82, body * 1.36, body * 1.64, palette.tone, 1, ragdoll.rotation)
  }
}

const renderAimLasers = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds, waveTime: number) => {
  const pulse = 0.7 + (Math.sin(waveTime * 6.5) * 0.5 + 0.5) * 0.3
  for (const unit of world.units) {
    if (!(unit.laserSight || (unit.perkStacks.laser_sight ?? 0) > 0) || !inside(unit.position.x, unit.position.y, cull, unit.radius + 10)) continue
    const aimLength = Math.hypot(unit.aim.x, unit.aim.y)
    if (aimLength <= 0.0001) continue
    const dx = unit.aim.x / aimLength
    const dy = unit.aim.y / aimLength
    const startX = unit.position.x + dx * (unit.radius + 0.12)
    const startY = unit.position.y + dy * (unit.radius + 0.12)
    const endX = startX + dx * 9.5
    const endY = startY + dy * 9.5
    const nx = -dy
    const ny = dx
    const half = (unit.isPlayer ? 0.03 : 0.022) * pulse
    renderer.polygon([
      startX + nx * half, startY + ny * half,
      startX - nx * half, startY - ny * half,
      endX, endY,
    ], unit.isPlayer ? "#ff6a6a" : "#ff5050", (unit.isPlayer ? 0.72 : 0.48) * pulse)
  }
}

const renderUnits = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42
    if (!inside(drawX, drawY, cull, body * 2.8)) continue

    const primaryReloading = unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0
    const primaryProgress = primaryReloading
      ? clamp(1 - unit.reloadCooldown / unit.reloadCooldownMax, 0, 1)
      : Number.isFinite(unit.primaryAmmo) && Number.isFinite(unit.magazineSize) && unit.magazineSize > 0
      ? clamp(unit.primaryAmmo / unit.magazineSize, 0, 1)
      : 1
    const primaryRadius = body + PRIMARY_RELOAD_RING_OFFSET_WORLD
    renderer.ring(drawX, drawY, primaryRadius, PRIMARY_RELOAD_RING_THICKNESS_WORLD, primaryReloading ? "#c1c8cf" : "#ffffff", 1, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * primaryProgress)
    const secondaryReloading = unit.secondaryCooldown > 0 && unit.secondaryCooldownMax > 0
    const secondaryProgress = secondaryReloading ? clamp(1 - unit.secondaryCooldown / unit.secondaryCooldownMax, 0, 1) : 1
    const secondaryRadius = primaryRadius - (PRIMARY_RELOAD_RING_THICKNESS_WORLD + SECONDARY_RELOAD_RING_THICKNESS_WORLD) * 0.5
    renderer.ring(drawX, drawY, secondaryRadius, SECONDARY_RELOAD_RING_THICKNESS_WORLD, secondaryReloading ? "#fff0d8" : "#ffbf66", 1, -Math.PI * 0.5, -Math.PI * 0.5 + TWO_PI * secondaryProgress)

    const moveSpeed = Math.hypot(unit.velocity.x, unit.velocity.y)
    const skewAmount = clamp(moveSpeed / 12, 0, 1)
    renderer.ellipse(drawX - unit.velocity.x * 0.012, drawY + body * 1.26, body * (0.68 + skewAmount * 0.12), body * (0.37 - skewAmount * 0.05), "#000000", 0.24)

    const palette = paletteForUnit(world, unit)
    const skew = computeHorizontalSkewX(unit.velocity.x, unit.speed)
    const skewRect = (x: number, y: number, width: number, height: number, color: string, alpha = 1) => {
      const x0 = x + skew * y
      const x1 = x + width + skew * y
      const x2 = x + width + skew * (y + height)
      const x3 = x + skew * (y + height)
      renderer.polygon([drawX + x0, drawY + y, drawX + x1, drawY + y, drawX + x2, drawY + y + height, drawX + x3, drawY + y + height], color, alpha)
    }
    const earLeftX = -body * 0.7
    const earRightX = body * 0.7
    const earY = -body * 0.95
    skewRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2, palette.edge)
    skewRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2, palette.edge)
    skewRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55, palette.tone)
    skewRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55, palette.tone)
    skewRect(-body * 0.85, -body, body * 1.7, body * 2, palette.edge)
    skewRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64, palette.tone)

    const weaponKickback = computeWeaponKickbackDistance(unit.recoil, PRIMARY_WEAPONS[unit.primaryWeapon].firingKnockback, unit.radius)
    const gunLength = Math.max(unit.radius * 0.42, unit.radius * 1.25 - weaponKickback)
    const weaponAngle = Math.atan2(unit.aim.y, unit.aim.x)
    const weaponScale = Math.max(0.1, unit.radius * 0.36) * 1.5
    const weaponX = drawX + Math.cos(weaponAngle) * gunLength
    const weaponY = drawY + Math.sin(weaponAngle) * gunLength
    drawItem(
      renderer,
      resolveWeaponSpriteId(unit.primaryWeapon, primaryReloading ? "unloaded" : "default"),
      weaponX,
      weaponY,
      weaponScale,
      weaponAngle,
      0.5,
      unit.aim.x < 0,
    )

    if (unit.hitFlash > 0) {
      const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
      const alpha = clamp(unit.hitFlash * flicker, 0, 1)
      skewRect(-body * 0.75, -body * 0.85, body * 1.5, body * 1.7, unit.isPlayer ? "#ff8a8a" : "#ff5454", alpha)
    }

    const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
    renderer.rect(drawX - body, drawY - body * 1.28, body * 2, body * 0.24, "#000000", 0.4)
    renderer.rect(drawX - body, drawY - body * 1.28, body * 2 * hpRatio, body * 0.24, unit.isPlayer ? "#e8ffdb" : "#8fc0ff")
  }
}

const renderExplosions = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  renderDirectExplosions(renderer, world, cull)
}

const renderDamagePopups = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  for (const popup of world.damagePopups) {
    if (!popup.active || !inside(popup.position.x, popup.position.y, cull, 0.9)) continue
    const alpha = clamp(popup.life / 0.62, 0, 1)
    const pixel = 0.09 * (1 + (1 - alpha) * 0.14)
    renderer.text(popup.text, popup.position.x + 0.05, popup.position.y + 0.05, pixel, "#000000", 0.5 * alpha, "center")
    renderer.text(popup.text, popup.position.x, popup.position.y, pixel, popup.color, alpha, "center")
  }
}

const renderMuzzleFlashes = (renderer: DirectWebGLRenderer, world: WorldState, cull: CullBounds) => {
  renderer.setBlendMode("additive")
  for (const flash of world.muzzleFlashes) {
    if (!flash.active) continue
    if (!inside(flash.position.x, flash.position.y, cull, flash.radius * 2.4)) {
      flash.active = false
      continue
    }
    const radius = Math.max(0.08, flash.radius)
    renderer.circle(flash.position.x, flash.position.y, radius * 1.9, "#ff782a", 0.42, 16)
    renderer.circle(flash.position.x, flash.position.y, radius * 1.16, "#ffa644", 0.78, 14)
    renderer.circle(flash.position.x, flash.position.y, radius * 0.56, "#ffd696", 0.96, 12)
    flash.active = false
  }
  renderer.setBlendMode("normal")
}

const renderArenaBoundary = (renderer: DirectWebGLRenderer, world: WorldState) => {
  renderer.ring(0, 0, world.arenaRadius, 0.45, "#bcc1bd")
  renderer.ring(0, 0, world.arenaRadius - 0.5, 0.2, "#7e8681")
}

const minimapObstacleColor = (material: number, highTier: boolean) => {
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) return "#8b9188"
  if (material === OBSTACLE_MATERIAL_WALL) return "#b06f57"
  if (material === OBSTACLE_MATERIAL_BOX) return highTier ? "#eef4ff" : "#de7d4f"
  if (material === OBSTACLE_MATERIAL_ROCK) return "#979b94"
  if (material === OBSTACLE_MATERIAL_HEDGE) return "#98bb8b"
  return "#838883"
}

const ensureMinimapObstacleTarget = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  sizePx: number,
  arenaRadius: number,
) => {
  const grid = world.obstacleGrid
  const dirty = minimapObstacleCache.renderer !== renderer ||
    minimapObstacleCache.gridRef !== grid ||
    minimapObstacleCache.revision !== grid.revision ||
    minimapObstacleCache.sizePx !== sizePx ||
    Math.abs(minimapObstacleCache.arenaRadius - arenaRadius) >= MINIMAP_ARENA_REFRESH_DELTA
  if (!dirty && minimapObstacleCache.target) return minimapObstacleCache.target
  if (minimapObstacleCache.target && minimapObstacleCache.renderer === renderer) {
    renderer.destroyRenderTarget(minimapObstacleCache.target)
  }
  const target = renderer.createRenderTarget(sizePx, sizePx)
  renderer.withRenderTarget(target, true, () => {
    renderer.useScreenView()
    const radius = sizePx * 0.5
    const scale = radius / arenaRadius
    const cell = Math.max(1, scale)
    for (let gy = 0; gy < grid.size; gy += 1) {
      for (let gx = 0; gx < grid.size; gx += 1) {
        const index = gy * grid.size + gx
        if (grid.solid[index] <= 0) continue
        const center = obstacleGridToWorldCenter(grid.size, gx, gy)
        const x = radius + center.x * scale
        const y = radius + center.y * scale
        const dx = x - radius
        const dy = y - radius
        if (dx * dx + dy * dy > (radius + cell) * (radius + cell)) continue
        renderer.rect(x - cell * 0.5, y - cell * 0.5, cell, cell, minimapObstacleColor(grid.material[index], grid.highTierLoot[index] > 0))
      }
    }
  })
  minimapObstacleCache = { renderer, gridRef: grid, revision: grid.revision, arenaRadius, sizePx, target }
  return target
}

const renderMinimap = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  cameraX: number,
  cameraY: number,
  overflow: ViewportOverflowPx,
) => {
  const mapSize = world.terrainMap.size
  if (mapSize <= 0) return
  renderer.useScreenView()
  const maxSize = Math.max(64, Math.min(VIEW_WIDTH, VIEW_HEIGHT) - MINIMAP_PADDING_PX * 2)
  const sizePx = Math.max(1, Math.round(Math.min(MINIMAP_SIZE_PX, maxSize)))
  const left = Math.max(1, VIEW_WIDTH - MINIMAP_PADDING_PX - sizePx - overflow.right)
  const top = Math.max(1, VIEW_HEIGHT - MINIMAP_PADDING_PX - sizePx - overflow.bottom)
  const centerX = left + sizePx * 0.5
  const centerY = top + sizePx * 0.5
  const radius = sizePx * 0.5
  const arenaRadius = Math.max(1, world.arenaRadius)
  const scale = radius / arenaRadius
  const toX = (x: number) => centerX + x * scale
  const toY = (y: number) => centerY + y * scale

  renderer.circle(centerX, centerY, radius + 2, "#111611", 0.72, 48)
  renderer.beginCircleClip(centerX, centerY, radius)
  renderer.rect(left, top, sizePx, sizePx, "#5f6d5d")
  const ground = ensureDirectGroundLayer(renderer, world)
  const flowers = ensureDirectFlowerLayer(renderer, world)
  drawDirectWorldLayer(renderer, ground, -arenaRadius, -arenaRadius, arenaRadius * 2, arenaRadius * 2, left, top, sizePx, sizePx, 0.5)
  drawDirectWorldLayer(renderer, flowers, -arenaRadius, -arenaRadius, arenaRadius * 2, arenaRadius * 2, left, top, sizePx, sizePx, 0.72)
  const obstacleTarget = ensureMinimapObstacleTarget(renderer, world, sizePx, arenaRadius)
  renderer.useScreenView()
  renderer.drawRenderTarget(obstacleTarget, 0, 0, sizePx, sizePx, left, top, sizePx, sizePx, 1)

  const view = buildCullBounds(cameraX, cameraY, 0)
  const vx = toX(view.minX)
  const vy = toY(view.minY)
  renderer.ring(centerX, centerY, radius, 1, "#e9eee7", 0.82)
  renderer.line(vx, vy, toX(view.maxX), vy, 1, "#fff6bc", 0.72)
  renderer.line(toX(view.maxX), vy, toX(view.maxX), toY(view.maxY), 1, "#fff6bc", 0.72)
  renderer.line(toX(view.maxX), toY(view.maxY), vx, toY(view.maxY), 1, "#fff6bc", 0.72)
  renderer.line(vx, toY(view.maxY), vx, vy, 1, "#fff6bc", 0.72)

  let projectileVisit = 0
  const activeCount = world.activeProjectileIndices.size > 0 ? world.activeProjectileIndices.size : world.projectiles.length
  const projectileStep = Math.max(1, Math.ceil(activeCount / 180))
  const drawProjectile = (p: WorldState["projectiles"][number]) => {
    projectileVisit += 1
    if ((projectileVisit - 1) % projectileStep !== 0 || !p.active) return
    const x = toX(p.position.x)
    const y = toY(p.position.y)
    const dx = x - centerX
    const dy = y - centerY
    if (dx * dx + dy * dy > radius * radius) return
    const friendly = p.ownerId === world.player.id || (world.player.team !== world.player.id && p.ownerTeam === world.player.team)
    const explosive = p.kind === "grenade" || p.kind === "rocket"
    const color = friendly ? "#ffe390" : "#ff796a"
    const speed = Math.hypot(p.velocity.x, p.velocity.y)
    if (speed > 0.0001) {
      const maxTrail = p.kind === "rocket" ? 4.2 * ROCKET_TRAIL_LENGTH_MULTIPLIER : explosive ? 4.2 : 3.4
      const trail = clamp(speed * scale * 0.06, 0.75, maxTrail)
      renderer.line(x - p.velocity.x / speed * trail, y - p.velocity.y / speed * trail, x, y, explosive ? 1.45 : 1, color, 0.58)
    }
    const r = explosive ? 1.9 : 1.2
    renderer.rect(x - r, y - r, r * 2, r * 2, color, 0.92)
  }
  if (world.activeProjectileIndices.size > 0) {
    for (const index of world.activeProjectileIndices) {
      const p = world.projectiles[index]
      if (p) drawProjectile(p)
    }
  } else {
    for (const p of world.projectiles) drawProjectile(p)
  }

  for (const unit of world.units) {
    const x = toX(unit.position.x)
    const y = toY(unit.position.y)
    const dx = x - centerX
    const dy = y - centerY
    if (dx * dx + dy * dy > radius * radius) continue
    const palette = paletteForUnit(world, unit)
    renderer.circle(x, y, unit.isPlayer ? MINIMAP_PLAYER_RADIUS_PX : MINIMAP_UNIT_RADIUS_PX, unit.isPlayer ? "#fff7bf" : palette.tone, 1, 12)
  }
  renderer.endClip()
  renderer.ring(centerX, centerY, radius, 1.5, "#e9eee7", 0.82)
}

interface OffscreenMarker {
  enemy: WorldState["units"][number]
  x: number
  y: number
  angle: number
  distance: number
}

const renderOffscreenIndicators = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  cameraX: number,
  cameraY: number,
  overflow: ViewportOverflowPx,
) => {
  if (!world.running || world.finished) return
  renderer.useScreenView()
  const margin = 24
  const left = clamp(overflow.left + margin, 0, VIEW_WIDTH - 1)
  const top = clamp(overflow.top + margin, 0, VIEW_HEIGHT - 1)
  const right = clamp(VIEW_WIDTH - overflow.right - margin, left + 1, VIEW_WIDTH)
  const bottom = clamp(VIEW_HEIGHT - overflow.bottom - margin, top + 1, VIEW_HEIGHT)
  const cx = VIEW_WIDTH * 0.5
  const cy = VIEW_HEIGHT * 0.5
  const halfW = Math.max(1, Math.min(cx - left, right - cx))
  const halfH = Math.max(1, Math.min(cy - top, bottom - cy))
  const markers: OffscreenMarker[] = []

  for (const enemy of world.units) {
    if (enemy.id === world.player.id) continue
    const anchor = buildOffscreenIndicatorAnchor(enemy)
    if (isOffscreenIndicatorAnchorInView(anchor, cameraX, cameraY)) continue
    const screenX = (anchor.x - cameraX) * WORLD_SCALE + cx
    const screenY = (anchor.y - cameraY) * WORLD_SCALE + cy
    const dx = screenX - cx
    const dy = screenY - cy
    const angle = Math.atan2(dy, dx)
    let x = cx
    let y = cy
    if (Math.abs(dx) / halfW >= Math.abs(dy) / halfH) {
      x = dx >= 0 ? right : left
      y = cy + dy * ((x - cx) / (Math.abs(dx) < 0.001 ? 0.001 : dx))
      y = clamp(y, top + 24, bottom - 24)
    } else {
      y = dy >= 0 ? bottom : top
      x = cx + dx * ((y - cy) / (Math.abs(dy) < 0.001 ? 0.001 : dy))
      x = clamp(x, left + 24, right - 24)
    }
    markers.push({ enemy, x, y, angle, distance: Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y) })
  }

  for (const marker of markers) {
    const palette = paletteForUnit(world, marker.enemy)
    const c = Math.cos(marker.angle)
    const s = Math.sin(marker.angle)
    const point = (lx: number, ly: number) => [marker.x + lx * c - ly * s, marker.y + lx * s + ly * c] as const
    const a = point(13, 0)
    const b = point(-2, -8)
    const d = point(-2, 8)
    renderer.polygon([a[0], a[1], b[0], b[1], d[0], d[1]], "#000000", 0.4)
    const a2 = point(11, 0)
    const b2 = point(-3, -7)
    const d2 = point(-3, 7)
    renderer.polygon([a2[0], a2[1], b2[0], b2[1], d2[0], d2[1]], palette.tone)
    renderer.rect(marker.x - 17, marker.y - 5, 8, 8, palette.edge)
    renderer.rect(marker.x - 15, marker.y - 3, 4, 4, "#eff3ff")
    const distanceLabel = `${marker.distance.toFixed(1)}m`
    const labelPixelSize = 2
    const labelTextWidth = distanceLabel.length * 4 * labelPixelSize - labelPixelSize
    const labelWidth = Math.max(30, labelTextWidth + 8)
    const labelHeight = 14
    const labelCenterX = clamp(marker.x + 8, left + labelWidth * 0.5, right - labelWidth * 0.5)
    const labelTop = clamp(marker.y + 9, top, bottom - labelHeight)
    renderer.rect(labelCenterX - labelWidth * 0.5, labelTop, labelWidth, labelHeight, "#08100a", 0.72)
    renderer.text(distanceLabel, labelCenterX, labelTop + 2, labelPixelSize, "#eaf5e1", 1, "center")
  }
}

export const renderScene = ({ renderer, world, dt }: RenderSceneArgs) => {
  grassWaveTime += dt * 0.18
  renderer.beginFrame("#889684")
  const overflow = measureViewportOverflow(renderer)
  const cameraX = world.camera.x + world.cameraOffset.x
  const cameraY = world.camera.y + world.cameraOffset.y
  const cull = buildCullBounds(cameraX, cameraY, 2.25)

  renderArenaGround(renderer, world, cameraX, cameraY, grassWaveTime)

  renderer.useWorldView(cameraX, cameraY, WORLD_SCALE, VIEW_WIDTH, VIEW_HEIGHT)
  renderer.beginCircleClip(0, 0, Math.max(0.1, world.arenaRadius - 0.05))
  renderMolotovZones(renderer, world, cull)
  renderFlowers(renderer, world, cull)
  renderObstacles(renderer, world)
  renderObstacleFx(renderer, world, cull)
  renderShellCasings(renderer, world, cull)
  renderPickups(renderer, world, dt, cull)
  renderDirectFlightTrails(renderer, world, cull, cameraX, cameraY)
  renderThrowables(renderer, world, cull)
  renderProjectiles(renderer, world, cull)
  renderRagdolls(renderer, world, cull)
  renderAimLasers(renderer, world, cull, grassWaveTime)
  renderUnits(renderer, world, cull)
  renderExplosions(renderer, world, cull)
  renderDamagePopups(renderer, world, cull)
  renderMuzzleFlashes(renderer, world, cull)
  renderer.endClip()
  renderArenaBoundary(renderer, world)

  renderer.useScreenView()
  renderer.radialOverlay(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5, 60, VIEW_WIDTH * 0.75, "#404543", 0.24, 1)
  const damageRatio = computeDamageTakenRatio(world.player.hp, world.player.maxHp)
  if (damageRatio > 0) {
    const intensity = damageRatio ** DAMAGE_VIGNETTE_INTENSITY_CURVE
    const maxDimension = Math.max(VIEW_WIDTH, VIEW_HEIGHT)
    renderer.radialOverlay(
      VIEW_WIDTH * 0.5,
      VIEW_HEIGHT * 0.5,
      maxDimension * 0.26,
      maxDimension * 0.64,
      "#ff0000",
      DAMAGE_VIGNETTE_MAX_ALPHA * intensity,
      0.62,
    )
  }
  renderMinimap(renderer, world, cameraX, cameraY, overflow)
  renderOffscreenIndicators(renderer, world, cameraX, cameraY, overflow)
  renderer.endFrame()
}
