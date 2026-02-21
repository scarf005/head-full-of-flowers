import {
  drawFlameProjectileSprite,
  drawGrenadeSprite,
  drawItemPickupSprite,
  drawMolotovSprite,
  drawWeaponPickupSprite,
} from "./pixel-art.ts"
import {
  renderExplosionInstances,
  renderFlightTrailInstances,
  renderFlowerInstances,
  renderObstacleFxInstances,
} from "./flower-instanced.ts"
import { decideRenderFxCompositionPlan, recordRenderPathProfileFrame } from "./composition-plan.ts"
import { buildObstacleGridCullRange } from "./obstacle-cull.ts"
import {
  type CanvasViewportOverflowPx,
  renderOffscreenEnemyIndicators as drawOffscreenEnemyIndicators,
} from "./offscreen-indicators.ts"
import { hasVisiblePickupsInCullBounds } from "./pickup-visibility.ts"
import { computeHorizontalSkewX, computeWeaponKickbackDistance } from "./unit-motion-transform.ts"
import { clamp, randomRange } from "../utils.ts"
import { buildCullBounds, type CullBounds, isInsideCullBounds } from "../cull.ts"
import { botPalette } from "../factions.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import grassBaseTextureUrl from "../../assets/tiles/grass-base-24.png"
import grassDarkTextureUrl from "../../assets/tiles/grass-dark-24.png"
import grassTransitionsTextureUrl from "../../assets/tiles/grass-transitions-24.png"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"
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
import { terrainAt, type TerrainTile } from "../world/terrain-map.ts"
import type { WorldState } from "../world/state.ts"
import { computeDamageTakenRatio } from "./vignette.ts"

export interface RenderSceneArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  dt: number
}

type FogCullBounds = CullBounds

let grassWaveTime = Math.random() * Math.PI * 2

const GRASS_BASE_COLOR = "#8fa684"
const GRASS_TILE_PIXEL_SIZE = 24
const GRASS_TILE_WORLD_SIZE = 1
const GRASS_TRANSITION_COLS = 5
const GRASS_DARK_VARIANTS = 3
const GRASS_TRANSITION_MASK_ORDER = [1, 2, 4, 8, 3, 6, 12, 9, 5, 10, 7, 14, 13, 11, 15]
const GRASS_MASK_TO_TILE_INDEX = new Map(GRASS_TRANSITION_MASK_ORDER.map((mask, index) => [mask, index]))
const TERRAIN_TINTS: Record<TerrainTile, string> = {
  grass: "#8fa684",
  clover: "#85a37a",
  "wild-grass": "#7b9a70",
  dirt: "#8e7d62",
  "dirt-road": "#9f8965",
  "road-edge": "#8f8a6b",
  gravel: "#9a9a8f",
  concrete: "#8b908c",
}
const FLOWER_SPRITE_PIXEL_SIZE = 16
const GROUND_LAYER_PIXELS_PER_TILE = GRASS_TILE_PIXEL_SIZE
const FLOWER_LAYER_PIXELS_PER_TILE = 12
const FLOWER_LAYER_FLUSH_MIN_ITEMS_PER_FRAME = 64
const FLOWER_LAYER_FLUSH_MAX_ITEMS_PER_FRAME = 360
const FLOWER_LAYER_FLUSH_TARGET_BUDGET_MS = 1.1
const FLOWER_LAYER_FLUSH_TIME_CHECK_INTERVAL = 24
const PRIMARY_RELOAD_RING_THICKNESS_WORLD = 3 / WORLD_SCALE
const PRIMARY_RELOAD_RING_OFFSET_WORLD = 0.22
const PRIMARY_RELOAD_RING_COLOR = "#ffffff"
const PRIMARY_RELOAD_PROGRESS_RING_COLOR = "#c1c8cf"
const SECONDARY_RELOAD_RING_THICKNESS_WORLD = 2 / WORLD_SCALE
const SECONDARY_RELOAD_RING_COLOR = "#ffbf66"
const SECONDARY_RELOAD_PROGRESS_RING_COLOR = "#fff0d8"
const DAMAGE_VIGNETTE_MAX_ALPHA = 0.76
const DAMAGE_VIGNETTE_CENTER_RADIUS_RATIO = 0.26
const DAMAGE_VIGNETTE_EDGE_RADIUS_RATIO = 0.64
const DAMAGE_VIGNETTE_INTENSITY_CURVE = 0.62
const MINIMAP_SIZE_PX = 164 * 0.8
const MINIMAP_PADDING_PX = 12
const MINIMAP_UNIT_RADIUS_PX = 2.1
const MINIMAP_PLAYER_RADIUS_PX = 2.8
const MINIMAP_PROJECTILE_RADIUS_PX = 1.2
const MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX = 1.9
const MINIMAP_FRIENDLY_PROJECTILE_COLOR = "rgba(255, 227, 144, 0.92)"
const MINIMAP_HOSTILE_PROJECTILE_COLOR = "rgba(255, 121, 106, 0.9)"
const MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR = "rgba(255, 224, 148, 0.58)"
const MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR = "rgba(255, 126, 112, 0.56)"
const MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED = 0.06
const MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX = 0.75
const MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX = 3.4
const MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX = 4.2
const MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX = 1
const MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX = 1.45
const MINIMAP_EXPLOSION_COLOR = "rgba(255, 136, 56, 0.92)"
const MINIMAP_EXPLOSION_MIN_RADIUS_PX = 1.1
const ROCKET_TRAIL_LENGTH_MULTIPLIER = 4
const MINIMAP_PROJECTILE_SAMPLE_LIMIT = 180
const MINIMAP_THROWABLE_SAMPLE_LIMIT = 72
const MINIMAP_EXPLOSION_SAMPLE_LIMIT = 36
const MINIMAP_MAX_DRAWN_MARKERS_PER_BATCH = 170
const MINIMAP_MAX_DRAWN_TRAIL_SEGMENTS_PER_BATCH = 140
const MINIMAP_MAX_DRAWN_EXPLOSIONS = 28
const VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS = 180
const MINIMAP_OBSTACLE_LAYER_REFRESH_INTERVAL_MS = 180
const MINIMAP_DYNAMIC_LAYER_REFRESH_INTERVAL_MS = 66
const MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_FLOWER_DIRTY_THRESHOLD = 240
const MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_REFRESH_INTERVAL_MS = 120

const EMPTY_VIEWPORT_OVERFLOW: CanvasViewportOverflowPx = { left: 0, top: 0, right: 0, bottom: 0 }

let viewportOverflowCache: {
  canvas: HTMLCanvasElement | null
  nextSampleAt: number
  value: CanvasViewportOverflowPx
} = {
  canvas: null,
  nextSampleAt: 0,
  value: EMPTY_VIEWPORT_OVERFLOW,
}

let minimapObstacleLayerCache: {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  gridRef: WorldState["obstacleGrid"] | null
  gridSize: number
  pixelSize: number
  arenaRadius: number
  nextRefreshAt: number
} = {
  canvas: null,
  context: null,
  gridRef: null,
  gridSize: 0,
  pixelSize: 0,
  arenaRadius: 0,
  nextRefreshAt: 0,
}

let renderFrameToken = 0
let flowerLayerLastFlushToken = -1

const minimapFriendlyProjectileMarkers: number[] = []
const minimapFriendlyExplosiveProjectileMarkers: number[] = []
const minimapHostileProjectileMarkers: number[] = []
const minimapHostileExplosiveProjectileMarkers: number[] = []
const minimapFriendlyProjectileTrailSegments: number[] = []
const minimapFriendlyExplosiveProjectileTrailSegments: number[] = []
const minimapHostileProjectileTrailSegments: number[] = []
const minimapHostileExplosiveProjectileTrailSegments: number[] = []
const minimapExplosionMarkers: number[] = []
let minimapProjectileSampleOffset = 0
let minimapThrowableSampleOffset = 0
let minimapExplosionSampleOffset = 0
let minimapMarkerDrawOffset = 0
let minimapTrailDrawOffset = 0
let minimapExplosionDrawOffset = 0

let minimapDynamicLayerCache: {
  nextRefreshAt: number
  centerX: number
  centerY: number
  radiusPx: number
  arenaRadiusWorld: number
} = {
  nextRefreshAt: 0,
  centerX: 0,
  centerY: 0,
  radiusPx: 0,
  arenaRadiusWorld: 0,
}

const buildFogCullBounds = (cameraX: number, cameraY: number, padding = 0): FogCullBounds => {
  return buildCullBounds(cameraX, cameraY, padding)
}

const measureCanvasViewportOverflowPx = (context: CanvasRenderingContext2D): CanvasViewportOverflowPx => {
  if (
    typeof globalThis === "undefined" ||
    typeof globalThis.innerWidth !== "number" ||
    typeof globalThis.innerHeight !== "number"
  ) {
    return EMPTY_VIEWPORT_OVERFLOW
  }

  const now = typeof performance !== "undefined" ? performance.now() : 0
  if (
    viewportOverflowCache.canvas === context.canvas &&
    now < viewportOverflowCache.nextSampleAt
  ) {
    return viewportOverflowCache.value
  }

  const rect = context.canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    viewportOverflowCache = {
      canvas: context.canvas,
      nextSampleAt: now + VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS,
      value: EMPTY_VIEWPORT_OVERFLOW,
    }
    return EMPTY_VIEWPORT_OVERFLOW
  }

  const canvasWidth = context.canvas.width
  const canvasHeight = context.canvas.height
  const scaleX = canvasWidth / rect.width
  const scaleY = canvasHeight / rect.height

  const measured = {
    left: Math.max(0, -rect.left) * scaleX,
    top: Math.max(0, -rect.top) * scaleY,
    right: Math.max(0, rect.right - globalThis.innerWidth) * scaleX,
    bottom: Math.max(0, rect.bottom - globalThis.innerHeight) * scaleY,
  }

  viewportOverflowCache = {
    canvas: context.canvas,
    nextSampleAt: now + VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS,
    value: measured,
  }
  return measured
}

const isInsideFogCullBounds = (x: number, y: number, bounds: FogCullBounds, padding = 0) => {
  return isInsideCullBounds(x, y, bounds, padding)
}

let grassBaseTexture: HTMLImageElement | null = null
let grassDarkTexture: HTMLImageElement | null = null
let grassTransitionsTexture: HTMLImageElement | null = null
let grassBaseTextureLoaded = false
let grassDarkTextureLoaded = false
let grassTransitionsTextureLoaded = false
let flowerPetalMask: HTMLImageElement | null = null
let flowerAccentMask: HTMLImageElement | null = null
let flowerPetalMaskLoaded = false
let flowerAccentMaskLoaded = false
const flowerSpriteCache = new Map<string, HTMLCanvasElement>()
let flowerPetalMaskAlpha: Uint8ClampedArray | null = null
let flowerAccentMaskAlpha: Uint8ClampedArray | null = null

let groundPatchCache: {
  terrainMapRef: WorldState["terrainMap"] | null
  size: number
  cells: Uint8Array
} = {
  terrainMapRef: null,
  size: 0,
  cells: new Uint8Array(0),
}

let groundLayerCache: {
  terrainMapRef: WorldState["terrainMap"] | null
  size: number
  textureStateKey: string
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
} = {
  terrainMapRef: null,
  size: 0,
  textureStateKey: "",
  canvas: null,
  context: null,
}

let flowerLayerCache: {
  terrainMapRef: WorldState["terrainMap"] | null
  size: number
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
} = {
  terrainMapRef: null,
  size: 0,
  canvas: null,
  context: null,
}

if (typeof Image !== "undefined") {
  grassBaseTexture = new Image()
  grassBaseTexture.src = grassBaseTextureUrl
  grassBaseTexture.onload = () => {
    grassBaseTextureLoaded = true
  }
  if (grassBaseTexture.complete && grassBaseTexture.naturalWidth > 0) {
    grassBaseTextureLoaded = true
  }

  grassDarkTexture = new Image()
  grassDarkTexture.src = grassDarkTextureUrl
  grassDarkTexture.onload = () => {
    grassDarkTextureLoaded = true
  }
  if (grassDarkTexture.complete && grassDarkTexture.naturalWidth > 0) {
    grassDarkTextureLoaded = true
  }

  grassTransitionsTexture = new Image()
  grassTransitionsTexture.src = grassTransitionsTextureUrl
  grassTransitionsTexture.onload = () => {
    grassTransitionsTextureLoaded = true
  }
  if (grassTransitionsTexture.complete && grassTransitionsTexture.naturalWidth > 0) {
    grassTransitionsTextureLoaded = true
  }

  flowerPetalMask = new Image()
  flowerPetalMask.src = flowerPetalMaskUrl
  flowerPetalMask.onload = () => {
    flowerPetalMaskLoaded = true
  }
  if (flowerPetalMask.complete && flowerPetalMask.naturalWidth > 0) {
    flowerPetalMaskLoaded = true
  }

  flowerAccentMask = new Image()
  flowerAccentMask.src = flowerAccentMaskUrl
  flowerAccentMask.onload = () => {
    flowerAccentMaskLoaded = true
  }
  if (flowerAccentMask.complete && flowerAccentMask.naturalWidth > 0) {
    flowerAccentMaskLoaded = true
  }
}

const grassCellNoise = (x: number, y: number, seed: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 73.17) * 43758.5453123
  return value - Math.floor(value)
}

const patchAt = (cells: Uint8Array, size: number, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= size || y >= size) {
    return 0
  }
  return cells[y * size + x]
}

const patchNeighborCount = (cells: Uint8Array, size: number, x: number, y: number) => {
  let count = 0
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue
      }
      count += patchAt(cells, size, x + ox, y + oy)
    }
  }
  return count
}

const grassVariantIndex = (cellX: number, cellY: number) => {
  return Math.floor(grassCellNoise(cellX, cellY, 0.93) * GRASS_DARK_VARIANTS) % GRASS_DARK_VARIANTS
}

const isGrassTile = (tile: TerrainTile) => tile === "grass" || tile === "clover" || tile === "wild-grass"

const extractMaskAlpha = (image: HTMLImageElement) => {
  const maskCanvas = document.createElement("canvas")
  maskCanvas.width = FLOWER_SPRITE_PIXEL_SIZE
  maskCanvas.height = FLOWER_SPRITE_PIXEL_SIZE
  const maskContext = maskCanvas.getContext("2d")
  if (!maskContext) {
    return null
  }

  maskContext.imageSmoothingEnabled = false
  maskContext.clearRect(0, 0, FLOWER_SPRITE_PIXEL_SIZE, FLOWER_SPRITE_PIXEL_SIZE)
  maskContext.drawImage(image, 0, 0, FLOWER_SPRITE_PIXEL_SIZE, FLOWER_SPRITE_PIXEL_SIZE)
  return maskContext.getImageData(0, 0, FLOWER_SPRITE_PIXEL_SIZE, FLOWER_SPRITE_PIXEL_SIZE).data
}

const ensureFlowerMaskAlpha = () => {
  if (flowerPetalMaskAlpha && flowerAccentMaskAlpha) {
    return true
  }
  if (!flowerPetalMask || !flowerAccentMask || !flowerPetalMaskLoaded || !flowerAccentMaskLoaded) {
    return false
  }

  flowerPetalMaskAlpha = extractMaskAlpha(flowerPetalMask)
  flowerAccentMaskAlpha = extractMaskAlpha(flowerAccentMask)
  return !!flowerPetalMaskAlpha && !!flowerAccentMaskAlpha
}

const parseHexColor = (hex: string) => {
  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) {
    return [255, 255, 255] as const
  }
  const red = Number.parseInt(cleaned.slice(0, 2), 16)
  const green = Number.parseInt(cleaned.slice(2, 4), 16)
  const blue = Number.parseInt(cleaned.slice(4, 6), 16)
  return [red, green, blue] as const
}

const toHex = (value: number) => {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0")
}

const tintHex = (hex: string, multiplier: number, lift = 0) => {
  const [red, green, blue] = parseHexColor(hex)
  return `#${toHex(red * multiplier + lift)}${toHex(green * multiplier + lift)}${toHex(blue * multiplier + lift)}`
}

const paletteForUnit = (world: WorldState, unit: WorldState["units"][number]) => {
  const isFfa = world.player.team === world.player.id
  if (isFfa) {
    return unit.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(unit.id)
  }

  const teamColor = world.factions.find((faction) => faction.id === unit.team)?.color ?? "#d8e8cb"
  return {
    tone: tintHex(teamColor, 0.82, 22),
    edge: tintHex(teamColor, 0.55, 4),
  }
}

const paletteForRagdoll = (world: WorldState, ragdoll: WorldState["ragdolls"][number]) => {
  const isFfa = world.player.team === world.player.id
  if (isFfa) {
    return ragdoll.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(ragdoll.unitId || ragdoll.team)
  }

  const teamColor = world.factions.find((faction) => faction.id === ragdoll.team)?.color ?? "#d8e8cb"
  return {
    tone: tintHex(teamColor, 0.82, 22),
    edge: tintHex(teamColor, 0.55, 4),
  }
}

const buildGroundPatchCache = (world: WorldState) => {
  const size = world.terrainMap.size
  const cells = new Uint8Array(size * size)
  const half = Math.floor(size * 0.5)

  for (let gridY = 0; gridY < size; gridY += 1) {
    for (let gridX = 0; gridX < size; gridX += 1) {
      const cellX = gridX - half
      const cellY = gridY - half
      const centerX = cellX + GRASS_TILE_WORLD_SIZE * 0.5
      const centerY = cellY + GRASS_TILE_WORLD_SIZE * 0.5
      const terrain = terrainAt(world.terrainMap, centerX, centerY)
      const terrainBias = terrain === "wild-grass"
        ? 0.34
        : terrain === "clover"
        ? 0.14
        : terrain === "grass"
        ? -0.06
        : -0.38
      const patchField = (
            Math.sin(cellX * 0.21 + cellY * 0.15 + 0.7) * 0.58 +
            Math.sin(cellX * 0.07 - cellY * 0.13 + 1.8) * 0.42
          ) * 0.5 + 0.5
      const grain = grassCellNoise(cellX, cellY, 0.31) * 0.16
      cells[gridY * size + gridX] = patchField + terrainBias + grain > 0.56 ? 1 : 0
    }
  }

  for (let pass = 0; pass < 2; pass += 1) {
    const smoothed = new Uint8Array(cells)
    for (let gridY = 0; gridY < size; gridY += 1) {
      for (let gridX = 0; gridX < size; gridX += 1) {
        const neighbors = patchNeighborCount(cells, size, gridX, gridY)
        if (neighbors >= 5) {
          smoothed[gridY * size + gridX] = 1
        } else if (neighbors <= 2) {
          smoothed[gridY * size + gridX] = 0
        }
      }
    }
    cells.set(smoothed)
  }

  groundPatchCache = {
    terrainMapRef: world.terrainMap,
    size,
    cells,
  }
}

const ensureGroundPatchCache = (world: WorldState) => {
  if (groundPatchCache.terrainMapRef === world.terrainMap && groundPatchCache.size === world.terrainMap.size) {
    return groundPatchCache
  }
  buildGroundPatchCache(world)
  return groundPatchCache
}

const groundTextureStateKey = () => {
  return `${grassBaseTextureLoaded ? 1 : 0}-${grassDarkTextureLoaded ? 1 : 0}-${grassTransitionsTextureLoaded ? 1 : 0}`
}

const buildGroundLayerCache = (world: WorldState) => {
  const size = world.terrainMap.size
  const textureStateKey = groundTextureStateKey()
  const canvas = document.createElement("canvas")
  canvas.width = size * GROUND_LAYER_PIXELS_PER_TILE
  canvas.height = size * GROUND_LAYER_PIXELS_PER_TILE
  const context = canvas.getContext("2d")
  if (!context) {
    groundLayerCache = {
      terrainMapRef: world.terrainMap,
      size,
      textureStateKey,
      canvas,
      context: null,
    }
    return groundLayerCache
  }

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = GRASS_BASE_COLOR
  context.fillRect(0, 0, canvas.width, canvas.height)

  const patchCache = ensureGroundPatchCache(world)
  const patchCells = patchCache.cells
  const patchSize = patchCache.size
  const halfPatch = Math.floor(patchSize * 0.5)

  if (grassBaseTexture && grassBaseTextureLoaded) {
    for (let gridY = 0; gridY < patchSize; gridY += 1) {
      for (let gridX = 0; gridX < patchSize; gridX += 1) {
        const drawX = gridX * GROUND_LAYER_PIXELS_PER_TILE
        const drawY = gridY * GROUND_LAYER_PIXELS_PER_TILE
        context.drawImage(
          grassBaseTexture,
          drawX,
          drawY,
          GROUND_LAYER_PIXELS_PER_TILE,
          GROUND_LAYER_PIXELS_PER_TILE,
        )
      }
    }
  }

  if (grassTransitionsTexture && grassTransitionsTextureLoaded) {
    for (let gridY = 0; gridY < patchSize; gridY += 1) {
      for (let gridX = 0; gridX < patchSize; gridX += 1) {
        if (!patchAt(patchCells, patchSize, gridX, gridY)) {
          continue
        }

        const north = patchAt(patchCells, patchSize, gridX, gridY - 1)
        const east = patchAt(patchCells, patchSize, gridX + 1, gridY)
        const south = patchAt(patchCells, patchSize, gridX, gridY + 1)
        const west = patchAt(patchCells, patchSize, gridX - 1, gridY)
        let mask = 0
        if (north) mask |= 1
        if (east) mask |= 2
        if (south) mask |= 4
        if (west) mask |= 8

        if (mask === 0) {
          mask = 15
        }

        const drawX = gridX * GROUND_LAYER_PIXELS_PER_TILE
        const drawY = gridY * GROUND_LAYER_PIXELS_PER_TILE
        const cellX = gridX - halfPatch
        const cellY = gridY - halfPatch

        if (mask === 15 && grassDarkTexture && grassDarkTextureLoaded) {
          const variant = grassVariantIndex(cellX, cellY)
          const srcX = variant * GRASS_TILE_PIXEL_SIZE
          context.drawImage(
            grassDarkTexture,
            srcX,
            0,
            GRASS_TILE_PIXEL_SIZE,
            GRASS_TILE_PIXEL_SIZE,
            drawX,
            drawY,
            GROUND_LAYER_PIXELS_PER_TILE,
            GROUND_LAYER_PIXELS_PER_TILE,
          )
          continue
        }

        const tileIndex = GRASS_MASK_TO_TILE_INDEX.get(mask)
        if (tileIndex === undefined) {
          continue
        }

        const srcX = (tileIndex % GRASS_TRANSITION_COLS) * GRASS_TILE_PIXEL_SIZE
        const srcY = Math.floor(tileIndex / GRASS_TRANSITION_COLS) * GRASS_TILE_PIXEL_SIZE
        context.drawImage(
          grassTransitionsTexture,
          srcX,
          srcY,
          GRASS_TILE_PIXEL_SIZE,
          GRASS_TILE_PIXEL_SIZE,
          drawX,
          drawY,
          GROUND_LAYER_PIXELS_PER_TILE,
          GROUND_LAYER_PIXELS_PER_TILE,
        )
      }
    }
  }

  context.globalAlpha = 0.84
  for (let gridY = 0; gridY < patchSize; gridY += 1) {
    for (let gridX = 0; gridX < patchSize; gridX += 1) {
      const terrain = world.terrainMap.tiles[gridY][gridX]
      if (isGrassTile(terrain)) {
        continue
      }

      const drawX = gridX * GROUND_LAYER_PIXELS_PER_TILE
      const drawY = gridY * GROUND_LAYER_PIXELS_PER_TILE
      context.fillStyle = TERRAIN_TINTS[terrain]
      context.fillRect(drawX, drawY, GROUND_LAYER_PIXELS_PER_TILE, GROUND_LAYER_PIXELS_PER_TILE)

      if (terrain === "dirt-road") {
        context.globalAlpha = 0.18
        context.fillStyle = "#d4c19a"
        context.fillRect(
          drawX + GROUND_LAYER_PIXELS_PER_TILE * 0.12,
          drawY + GROUND_LAYER_PIXELS_PER_TILE * 0.18,
          GROUND_LAYER_PIXELS_PER_TILE * 0.76,
          GROUND_LAYER_PIXELS_PER_TILE * 0.14,
        )
        context.globalAlpha = 0.84
      }
    }
  }
  context.globalAlpha = 1

  groundLayerCache = {
    terrainMapRef: world.terrainMap,
    size,
    textureStateKey,
    canvas,
    context,
  }

  return groundLayerCache
}

const ensureGroundLayerCache = (world: WorldState) => {
  const textureStateKey = groundTextureStateKey()
  if (
    groundLayerCache.terrainMapRef === world.terrainMap &&
    groundLayerCache.size === world.terrainMap.size &&
    groundLayerCache.textureStateKey === textureStateKey &&
    groundLayerCache.canvas &&
    groundLayerCache.context
  ) {
    return groundLayerCache
  }

  return buildGroundLayerCache(world)
}

const flowerSpriteForPalette = (color: string, accent: string) => {
  if (!ensureFlowerMaskAlpha() || !flowerPetalMaskAlpha || !flowerAccentMaskAlpha) {
    return null
  }

  const key = `${color}|${accent}`
  const cached = flowerSpriteCache.get(key)
  if (cached) {
    return cached
  }

  const sprite = document.createElement("canvas")
  sprite.width = FLOWER_SPRITE_PIXEL_SIZE
  sprite.height = FLOWER_SPRITE_PIXEL_SIZE
  const spriteContext = sprite.getContext("2d")
  if (!spriteContext) {
    return null
  }

  spriteContext.imageSmoothingEnabled = false
  const imageData = spriteContext.createImageData(FLOWER_SPRITE_PIXEL_SIZE, FLOWER_SPRITE_PIXEL_SIZE)
  const pixels = imageData.data

  const [petalRed, petalGreen, petalBlue] = parseHexColor(color)
  const accentColor = accent === "#29261f" ? "#6d5e42" : accent
  const [accentRed, accentGreen, accentBlue] = parseHexColor(accentColor)

  for (let index = 0; index < pixels.length; index += 4) {
    const petalAlpha = flowerPetalMaskAlpha[index + 3]
    if (petalAlpha > 0) {
      pixels[index] = petalRed
      pixels[index + 1] = petalGreen
      pixels[index + 2] = petalBlue
      pixels[index + 3] = petalAlpha
    }

    const accentAlpha = flowerAccentMaskAlpha[index + 3]
    if (accentAlpha > 0) {
      pixels[index] = accentRed
      pixels[index + 1] = accentGreen
      pixels[index + 2] = accentBlue
      pixels[index + 3] = accentAlpha
    }
  }

  spriteContext.putImageData(imageData, 0, 0)

  flowerSpriteCache.set(key, sprite)
  return sprite
}

const ensureFlowerLayerCache = (world: WorldState) => {
  if (
    flowerLayerCache.terrainMapRef === world.terrainMap &&
    flowerLayerCache.size === world.terrainMap.size &&
    flowerLayerCache.canvas &&
    flowerLayerCache.context
  ) {
    return flowerLayerCache
  }

  const size = world.terrainMap.size
  const canvas = document.createElement("canvas")
  canvas.width = size * FLOWER_LAYER_PIXELS_PER_TILE
  canvas.height = size * FLOWER_LAYER_PIXELS_PER_TILE
  const context = canvas.getContext("2d")
  if (!context) {
    flowerLayerCache = {
      terrainMapRef: world.terrainMap,
      size,
      canvas,
      context: null,
    }
    return flowerLayerCache
  }

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  flowerLayerCache = {
    terrainMapRef: world.terrainMap,
    size,
    canvas,
    context,
  }

  world.flowerDirtyIndices.clear()
  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }
    flower.renderDirty = true
    if (flower.slotIndex >= 0) {
      world.flowerDirtyIndices.add(flower.slotIndex)
    }
  }
  world.flowerDirtyCount = world.flowerDirtyIndices.size

  return flowerLayerCache
}

const drawFlowerToLayer = (
  layerContext: CanvasRenderingContext2D,
  mapSize: number,
  flower: WorldState["flowers"][number],
) => {
  const sprite = flowerSpriteForPalette(flower.color, flower.accent)
  if (!sprite) {
    return false
  }

  const halfMap = Math.floor(mapSize * 0.5)
  const worldX = flower.position.x + halfMap
  const worldY = flower.position.y + halfMap
  if (worldX < 0 || worldY < 0 || worldX >= mapSize || worldY >= mapSize) {
    return true
  }

  const pixelsPerWorld = FLOWER_LAYER_PIXELS_PER_TILE
  const px = worldX * pixelsPerWorld
  const py = worldY * pixelsPerWorld
  const sizeWorld = Math.max(0.12, flower.size * 1.8)
  const sizePx = sizeWorld * pixelsPerWorld
  const drawX = px - sizePx * 0.5
  const drawY = py - sizePx * 0.5
  layerContext.drawImage(sprite, drawX, drawY, sizePx, sizePx)
  return true
}

const flushFlowerLayer = (world: WorldState, frameToken?: number) => {
  if (typeof frameToken === "number" && flowerLayerLastFlushToken === frameToken) {
    return
  }

  if (world.flowerDirtyIndices.size <= 0) {
    if (typeof frameToken === "number") {
      flowerLayerLastFlushToken = frameToken
    }
    return
  }

  const layer = ensureFlowerLayerCache(world)
  if (!layer.context) {
    return
  }

  const dirtyCount = world.flowerDirtyIndices.size
  const budget = clamp(
    Math.ceil(dirtyCount * 0.1),
    FLOWER_LAYER_FLUSH_MIN_ITEMS_PER_FRAME,
    FLOWER_LAYER_FLUSH_MAX_ITEMS_PER_FRAME,
  )
  const hasPerf = typeof performance !== "undefined"
  const startMs = hasPerf ? performance.now() : 0
  let remainingBudget = budget
  let visited = 0
  for (const flowerIndex of world.flowerDirtyIndices) {
    visited += 1
    const flower = world.flowers[flowerIndex]
    if (!flower || !flower.active || !flower.renderDirty) {
      world.flowerDirtyIndices.delete(flowerIndex)
      continue
    }

    const drawn = drawFlowerToLayer(layer.context, layer.size, flower)
    if (!drawn) {
      continue
    }

    flower.renderDirty = false
    world.flowerDirtyIndices.delete(flowerIndex)
    remainingBudget -= 1
    if (remainingBudget <= 0) {
      break
    }

    if (hasPerf && visited % FLOWER_LAYER_FLUSH_TIME_CHECK_INTERVAL === 0) {
      if (performance.now() - startMs >= FLOWER_LAYER_FLUSH_TARGET_BUDGET_MS) {
        break
      }
    }
  }

  world.flowerDirtyCount = world.flowerDirtyIndices.size
  if (typeof frameToken === "number") {
    flowerLayerLastFlushToken = frameToken
  }
}

const minimapObstacleColor = (material: number, highTierLoot: boolean) => {
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
    return "#8b9188"
  }
  if (material === OBSTACLE_MATERIAL_WALL) {
    return "#b06f57"
  }
  if (material === OBSTACLE_MATERIAL_BOX) {
    return highTierLoot ? "#eef4ff" : "#de7d4f"
  }
  if (material === OBSTACLE_MATERIAL_ROCK) {
    return "#979b94"
  }
  if (material === OBSTACLE_MATERIAL_HEDGE) {
    return "#98bb8b"
  }
  return "#838883"
}

const ensureMinimapObstacleLayer = (world: WorldState, sizePx: number, arenaRadiusWorld: number) => {
  const obstacleGrid = world.obstacleGrid
  if (obstacleGrid.size <= 0 || sizePx <= 0 || arenaRadiusWorld <= 0) {
    return null
  }

  const now = typeof performance !== "undefined" ? performance.now() : 0
  const pixelSize = Math.max(1, Math.round(sizePx))
  const shouldRefresh = !minimapObstacleLayerCache.canvas ||
    !minimapObstacleLayerCache.context ||
    minimapObstacleLayerCache.gridRef !== obstacleGrid ||
    minimapObstacleLayerCache.gridSize !== obstacleGrid.size ||
    minimapObstacleLayerCache.pixelSize !== pixelSize ||
    Math.abs(minimapObstacleLayerCache.arenaRadius - arenaRadiusWorld) >= 0.08 ||
    now >= minimapObstacleLayerCache.nextRefreshAt

  if (!shouldRefresh && minimapObstacleLayerCache.canvas) {
    return minimapObstacleLayerCache.canvas
  }

  let canvas = minimapObstacleLayerCache.canvas
  let layerContext = minimapObstacleLayerCache.context
  if (!canvas || !layerContext) {
    canvas = document.createElement("canvas")
    layerContext = canvas.getContext("2d")
  }
  if (!canvas || !layerContext) {
    return null
  }

  if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
    canvas.width = pixelSize
    canvas.height = pixelSize
  }

  layerContext.clearRect(0, 0, pixelSize, pixelSize)

  const minimapRadiusPx = pixelSize * 0.5
  const worldToMinimapScale = minimapRadiusPx / arenaRadiusWorld
  const cellSizePx = Math.max(1, worldToMinimapScale)
  for (let gy = 0; gy < obstacleGrid.size; gy += 1) {
    for (let gx = 0; gx < obstacleGrid.size; gx += 1) {
      const index = gy * obstacleGrid.size + gx
      if (obstacleGrid.solid[index] <= 0) {
        continue
      }

      const center = obstacleGridToWorldCenter(obstacleGrid.size, gx, gy)
      const markerX = pixelSize * 0.5 + center.x * worldToMinimapScale
      const markerY = pixelSize * 0.5 + center.y * worldToMinimapScale
      layerContext.fillStyle = minimapObstacleColor(obstacleGrid.material[index], obstacleGrid.highTierLoot[index] > 0)
      layerContext.fillRect(markerX - cellSizePx * 0.5, markerY - cellSizePx * 0.5, cellSizePx, cellSizePx)
    }
  }

  minimapObstacleLayerCache = {
    canvas,
    context: layerContext,
    gridRef: obstacleGrid,
    gridSize: obstacleGrid.size,
    pixelSize,
    arenaRadius: arenaRadiusWorld,
    nextRefreshAt: now + MINIMAP_OBSTACLE_LAYER_REFRESH_INTERVAL_MS,
  }

  return canvas
}

const drawMinimapMarkerBatch = (
  context: CanvasRenderingContext2D,
  markers: number[],
  radiusPx: number,
  fillStyle: string,
) => {
  if (markers.length <= 0) {
    return
  }

  const size = radiusPx * 2
  const markerCount = markers.length / 2
  const markerStep = Math.max(1, Math.ceil(markerCount / MINIMAP_MAX_DRAWN_MARKERS_PER_BATCH))
  const markerStart = markerStep <= 1 ? 0 : minimapMarkerDrawOffset % markerStep
  if (markerStep > 1) {
    minimapMarkerDrawOffset = (minimapMarkerDrawOffset + 1) % markerStep
  }
  context.fillStyle = fillStyle
  for (let index = markerStart * 2; index < markers.length; index += markerStep * 2) {
    context.fillRect(markers[index] - radiusPx, markers[index + 1] - radiusPx, size, size)
  }
}

const drawMinimapTrailBatch = (
  context: CanvasRenderingContext2D,
  segments: number[],
  lineWidthPx: number,
  strokeStyle: string,
) => {
  if (segments.length <= 0) {
    return
  }

  const segmentCount = segments.length / 4
  const segmentStep = Math.max(1, Math.ceil(segmentCount / MINIMAP_MAX_DRAWN_TRAIL_SEGMENTS_PER_BATCH))
  const segmentStart = segmentStep <= 1 ? 0 : minimapTrailDrawOffset % segmentStep
  if (segmentStep > 1) {
    minimapTrailDrawOffset = (minimapTrailDrawOffset + 1) % segmentStep
  }

  context.strokeStyle = strokeStyle
  context.lineWidth = lineWidthPx
  context.lineCap = "round"
  context.beginPath()
  for (let index = segmentStart * 4; index < segments.length; index += segmentStep * 4) {
    context.moveTo(segments[index], segments[index + 1])
    context.lineTo(segments[index + 2], segments[index + 3])
  }
  context.stroke()
}

const collectMinimapProjectileMarkers = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  minimapFriendlyProjectileMarkers.length = 0
  minimapFriendlyExplosiveProjectileMarkers.length = 0
  minimapHostileProjectileMarkers.length = 0
  minimapHostileExplosiveProjectileMarkers.length = 0
  minimapFriendlyProjectileTrailSegments.length = 0
  minimapFriendlyExplosiveProjectileTrailSegments.length = 0
  minimapHostileProjectileTrailSegments.length = 0
  minimapHostileExplosiveProjectileTrailSegments.length = 0

  const playerId = world.player.id
  const playerTeam = world.player.team
  const isFfa = playerTeam === playerId
  const worldToMinimapScale = minimapRadiusPx / arenaRadiusWorld
  const minimapRadiusSquared = minimapRadiusPx * minimapRadiusPx
  const minX = centerX - minimapRadiusPx
  const maxX = centerX + minimapRadiusPx
  const minY = centerY - minimapRadiusPx
  const maxY = centerY + minimapRadiusPx
  const projectileStep = Math.max(1, Math.ceil(world.projectiles.length / MINIMAP_PROJECTILE_SAMPLE_LIMIT))
  const projectileStart = projectileStep <= 1 ? 0 : minimapProjectileSampleOffset % projectileStep
  if (projectileStep > 1) {
    minimapProjectileSampleOffset = (minimapProjectileSampleOffset + 1) % projectileStep
  }

  for (
    let projectileIndex = projectileStart;
    projectileIndex < world.projectiles.length;
    projectileIndex += projectileStep
  ) {
    const projectile = world.projectiles[projectileIndex]
    if (!projectile.active) {
      continue
    }

    const markerX = centerX + projectile.position.x * worldToMinimapScale
    const markerY = centerY + projectile.position.y * worldToMinimapScale
    if (markerX < minX || markerX > maxX || markerY < minY || markerY > maxY) {
      continue
    }

    const deltaX = markerX - centerX
    const deltaY = markerY - centerY
    if (deltaX * deltaX + deltaY * deltaY > minimapRadiusSquared) {
      continue
    }

    const isFriendlyProjectile = projectile.ownerId === playerId ||
      (!isFfa && projectile.ownerTeam === playerTeam)
    const isExplosiveProjectile = projectile.kind === "grenade" || projectile.kind === "rocket"
    const isRocketProjectile = projectile.kind === "rocket"
    const speedSquared = projectile.velocity.x * projectile.velocity.x + projectile.velocity.y * projectile.velocity.y
    if (speedSquared > 0.00001) {
      const speed = Math.sqrt(speedSquared)
      const trailMaxLengthPx = isRocketProjectile
        ? MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX * ROCKET_TRAIL_LENGTH_MULTIPLIER
        : isExplosiveProjectile
        ? MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_MAX_LENGTH_PX
        : MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX
      const trailLengthPx = clamp(
        speed * worldToMinimapScale * MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED,
        MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX,
        trailMaxLengthPx,
      )
      const inverseSpeed = 1 / speed
      const trailStartX = markerX - projectile.velocity.x * inverseSpeed * trailLengthPx
      const trailStartY = markerY - projectile.velocity.y * inverseSpeed * trailLengthPx

      if (isFriendlyProjectile) {
        if (isExplosiveProjectile) {
          minimapFriendlyExplosiveProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
        } else {
          minimapFriendlyProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
        }
      } else if (isExplosiveProjectile) {
        minimapHostileExplosiveProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      } else {
        minimapHostileProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      }
    }

    if (isFriendlyProjectile) {
      if (isExplosiveProjectile) {
        minimapFriendlyExplosiveProjectileMarkers.push(markerX, markerY)
      } else {
        minimapFriendlyProjectileMarkers.push(markerX, markerY)
      }
      continue
    }

    if (isExplosiveProjectile) {
      minimapHostileExplosiveProjectileMarkers.push(markerX, markerY)
    } else {
      minimapHostileProjectileMarkers.push(markerX, markerY)
    }
  }

  const throwableStep = Math.max(1, Math.ceil(world.throwables.length / MINIMAP_THROWABLE_SAMPLE_LIMIT))
  const throwableStart = throwableStep <= 1 ? 0 : minimapThrowableSampleOffset % throwableStep
  if (throwableStep > 1) {
    minimapThrowableSampleOffset = (minimapThrowableSampleOffset + 1) % throwableStep
  }

  for (let throwableIndex = throwableStart; throwableIndex < world.throwables.length; throwableIndex += throwableStep) {
    const throwable = world.throwables[throwableIndex]
    if (!throwable.active) {
      continue
    }

    const markerX = centerX + throwable.position.x * worldToMinimapScale
    const markerY = centerY + throwable.position.y * worldToMinimapScale
    if (markerX < minX || markerX > maxX || markerY < minY || markerY > maxY) {
      continue
    }

    const deltaX = markerX - centerX
    const deltaY = markerY - centerY
    if (deltaX * deltaX + deltaY * deltaY > minimapRadiusSquared) {
      continue
    }

    const isFriendlyThrowable = throwable.ownerId === playerId ||
      (!isFfa && throwable.ownerTeam === playerTeam)
    const speedSquared = throwable.velocity.x * throwable.velocity.x + throwable.velocity.y * throwable.velocity.y
    if (speedSquared > 0.00001) {
      const speed = Math.sqrt(speedSquared)
      const trailLengthPx = clamp(
        speed * worldToMinimapScale * MINIMAP_PROJECTILE_TRAIL_PIXELS_PER_SPEED,
        MINIMAP_PROJECTILE_TRAIL_MIN_LENGTH_PX,
        MINIMAP_PROJECTILE_TRAIL_MAX_LENGTH_PX,
      )
      const inverseSpeed = 1 / speed
      const trailStartX = markerX - throwable.velocity.x * inverseSpeed * trailLengthPx
      const trailStartY = markerY - throwable.velocity.y * inverseSpeed * trailLengthPx

      if (isFriendlyThrowable) {
        minimapFriendlyProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      } else {
        minimapHostileProjectileTrailSegments.push(trailStartX, trailStartY, markerX, markerY)
      }
    }

    if (isFriendlyThrowable) {
      minimapFriendlyProjectileMarkers.push(markerX, markerY)
    } else {
      minimapHostileProjectileMarkers.push(markerX, markerY)
    }
  }
}

const drawMinimapProjectileMarkers = (context: CanvasRenderingContext2D) => {
  drawMinimapTrailBatch(
    context,
    minimapFriendlyProjectileTrailSegments,
    MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapFriendlyExplosiveProjectileTrailSegments,
    MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_FRIENDLY_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapHostileProjectileTrailSegments,
    MINIMAP_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR,
  )
  drawMinimapTrailBatch(
    context,
    minimapHostileExplosiveProjectileTrailSegments,
    MINIMAP_EXPLOSIVE_PROJECTILE_TRAIL_LINE_WIDTH_PX,
    MINIMAP_HOSTILE_PROJECTILE_TRAIL_COLOR,
  )

  drawMinimapMarkerBatch(
    context,
    minimapFriendlyProjectileMarkers,
    MINIMAP_PROJECTILE_RADIUS_PX,
    MINIMAP_FRIENDLY_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapFriendlyExplosiveProjectileMarkers,
    MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX,
    MINIMAP_FRIENDLY_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapHostileProjectileMarkers,
    MINIMAP_PROJECTILE_RADIUS_PX,
    MINIMAP_HOSTILE_PROJECTILE_COLOR,
  )
  drawMinimapMarkerBatch(
    context,
    minimapHostileExplosiveProjectileMarkers,
    MINIMAP_EXPLOSIVE_PROJECTILE_RADIUS_PX,
    MINIMAP_HOSTILE_PROJECTILE_COLOR,
  )
}

const collectMinimapExplosionMarkers = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  minimapExplosionMarkers.length = 0
  const worldToMinimapScale = minimapRadiusPx / arenaRadiusWorld
  const explosionStep = Math.max(1, Math.ceil(world.explosions.length / MINIMAP_EXPLOSION_SAMPLE_LIMIT))
  const explosionStart = explosionStep <= 1 ? 0 : minimapExplosionSampleOffset % explosionStep
  if (explosionStep > 1) {
    minimapExplosionSampleOffset = (minimapExplosionSampleOffset + 1) % explosionStep
  }

  for (let explosionIndex = explosionStart; explosionIndex < world.explosions.length; explosionIndex += explosionStep) {
    const explosion = world.explosions[explosionIndex]
    if (!explosion.active || explosion.radius <= 0.01) {
      continue
    }

    const deltaX = explosion.position.x * worldToMinimapScale
    const deltaY = explosion.position.y * worldToMinimapScale
    const drawRadiusPx = Math.max(MINIMAP_EXPLOSION_MIN_RADIUS_PX, explosion.radius * worldToMinimapScale)
    const visibilityRadiusPx = minimapRadiusPx + drawRadiusPx
    if (deltaX * deltaX + deltaY * deltaY > visibilityRadiusPx * visibilityRadiusPx) {
      continue
    }

    const markerX = centerX + deltaX
    const markerY = centerY + deltaY
    minimapExplosionMarkers.push(markerX, markerY, drawRadiusPx)
  }
}

const drawMinimapExplosions = (context: CanvasRenderingContext2D) => {
  if (minimapExplosionMarkers.length <= 0) {
    return
  }

  const explosionCount = minimapExplosionMarkers.length / 3
  const explosionStep = Math.max(1, Math.ceil(explosionCount / MINIMAP_MAX_DRAWN_EXPLOSIONS))
  const explosionStart = explosionStep <= 1 ? 0 : minimapExplosionDrawOffset % explosionStep
  if (explosionStep > 1) {
    minimapExplosionDrawOffset = (minimapExplosionDrawOffset + 1) % explosionStep
  }

  context.fillStyle = MINIMAP_EXPLOSION_COLOR
  for (let index = explosionStart * 3; index < minimapExplosionMarkers.length; index += explosionStep * 3) {
    context.beginPath()
    context.arc(
      minimapExplosionMarkers[index],
      minimapExplosionMarkers[index + 1],
      minimapExplosionMarkers[index + 2],
      0,
      Math.PI * 2,
    )
    context.fill()
  }
}

const refreshMinimapDynamicLayer = (
  world: WorldState,
  centerX: number,
  centerY: number,
  minimapRadiusPx: number,
  arenaRadiusWorld: number,
) => {
  collectMinimapProjectileMarkers(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
  collectMinimapExplosionMarkers(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
}

export const renderScene = ({ context, world, dt }: RenderSceneArgs) => {
  renderFrameToken += 1
  grassWaveTime += dt * 0.18

  context.save()
  context.imageSmoothingEnabled = false

  context.fillStyle = "#889684"
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  const viewportOverflow = measureCanvasViewportOverflowPx(context)

  const renderCameraX = world.camera.x + world.cameraOffset.x
  const renderCameraY = world.camera.y + world.cameraOffset.y
  const fogCullBounds = buildFogCullBounds(renderCameraX, renderCameraY, 2.25)

  renderArenaGround(context, world, grassWaveTime, renderCameraX, renderCameraY)

  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-renderCameraX, -renderCameraY)

  context.save()
  context.beginPath()
  context.arc(0, 0, Math.max(0.1, world.arenaRadius - 0.05), 0, Math.PI * 2)
  context.clip()

  renderMolotovZones(context, world, fogCullBounds)
  renderFlowers(context, world, renderCameraX, renderCameraY, renderFrameToken)
  renderObstacles(context, world)
  const hasVisiblePickupLayer = hasVisiblePickupsInCullBounds(world.pickups, fogCullBounds)
  const compositionPlan = decideRenderFxCompositionPlan(hasVisiblePickupLayer, true)
  const renderedObstacleFxWithWebGl = renderObstacleFxInstances({
    context,
    world,
    cameraX: renderCameraX,
    cameraY: renderCameraY,
    drawToContext: compositionPlan.renderObstacleToContext,
    clearCanvas: true,
  })
  const resolvedPlan = decideRenderFxCompositionPlan(hasVisiblePickupLayer, renderedObstacleFxWithWebGl)

  let renderedFlightTrailsWithWebGl = false
  if (resolvedPlan.runCombinedTrailComposite) {
    renderedFlightTrailsWithWebGl = renderFlightTrailInstances({
      context,
      world,
      cameraX: renderCameraX,
      cameraY: renderCameraY,
      drawToContext: true,
      clearCanvas: false,
      forceComposite: true,
    })
  }

  if (!renderedObstacleFxWithWebGl) {
    renderObstacleDebris(context, world, fogCullBounds)
    renderShellCasings(context, world, fogCullBounds, "only-plain")
  }
  renderPickups(context, world, dt, fogCullBounds)
  if (resolvedPlan.runPostPickupTrailPass) {
    renderedFlightTrailsWithWebGl = renderFlightTrailInstances({
      context,
      world,
      cameraX: renderCameraX,
      cameraY: renderCameraY,
    })
  }
  recordRenderPathProfileFrame(
    world.renderPathProfile,
    hasVisiblePickupLayer,
    renderedObstacleFxWithWebGl,
    renderedFlightTrailsWithWebGl,
    resolvedPlan,
  )
  renderThrowables(context, world, !renderedFlightTrailsWithWebGl, fogCullBounds)
  renderProjectiles(context, world, !renderedFlightTrailsWithWebGl, fogCullBounds)
  renderRagdolls(context, world, fogCullBounds)
  renderAimLasers(context, world, fogCullBounds)
  renderUnits(context, world, fogCullBounds)
  const renderedExplosionsWithWebGl = renderExplosionInstances({
    context,
    world,
    cameraX: renderCameraX,
    cameraY: renderCameraY,
  })
  if (!renderedExplosionsWithWebGl) {
    renderExplosions(context, world, fogCullBounds)
  }
  renderDamagePopups(context, world, fogCullBounds)
  renderMuzzleFlashes(context, world, fogCullBounds)
  renderShellCasings(context, world, fogCullBounds, "only-sprite")

  context.restore()
  renderArenaBoundary(context, world)
  context.restore()

  renderAtmosphere(context)
  renderDamageVignette(context, world)
  renderMinimap(context, world, renderCameraX, renderCameraY, viewportOverflow, renderFrameToken)
  renderOffscreenEnemyIndicators(context, world, renderCameraX, renderCameraY, viewportOverflow)
}

const renderMinimap = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number,
  viewportOverflow: CanvasViewportOverflowPx,
  frameToken: number,
) => {
  const mapSize = world.terrainMap.size
  if (mapSize <= 0) {
    return
  }

  const canvasWidth = context.canvas.width
  const canvasHeight = context.canvas.height
  const maxSizeByViewport = Math.max(64, Math.min(canvasWidth, canvasHeight) - MINIMAP_PADDING_PX * 2)
  const sizePx = Math.min(MINIMAP_SIZE_PX, maxSizeByViewport)

  const left = Math.max(1, canvasWidth - MINIMAP_PADDING_PX - sizePx - viewportOverflow.right)
  const top = Math.max(1, canvasHeight - MINIMAP_PADDING_PX - sizePx - viewportOverflow.bottom)
  const centerX = left + sizePx * 0.5
  const centerY = top + sizePx * 0.5
  const minimapRadiusPx = sizePx * 0.5
  const arenaRadiusWorld = Math.max(1, world.arenaRadius)
  const halfMap = mapSize * 0.5

  const toMinimap = (worldX: number, worldY: number) => {
    return {
      x: centerX + (worldX / arenaRadiusWorld) * minimapRadiusPx,
      y: centerY + (worldY / arenaRadiusWorld) * minimapRadiusPx,
    }
  }

  const layerSlice = (layerCanvas: HTMLCanvasElement) => {
    const normalizedSpan = (arenaRadiusWorld * 2) / mapSize
    const normalizedMin = (-arenaRadiusWorld + halfMap) / mapSize
    const srcX = clamp(normalizedMin * layerCanvas.width, 0, layerCanvas.width - 1)
    const srcY = clamp(normalizedMin * layerCanvas.height, 0, layerCanvas.height - 1)
    const srcW = clamp(normalizedSpan * layerCanvas.width, 1, layerCanvas.width - srcX)
    const srcH = clamp(normalizedSpan * layerCanvas.height, 1, layerCanvas.height - srcY)
    return { srcX, srcY, srcW, srcH }
  }

  flushFlowerLayer(world, frameToken)
  const groundLayer = ensureGroundLayerCache(world)
  const flowerLayer = ensureFlowerLayerCache(world)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.imageSmoothingEnabled = false
  context.globalAlpha = 0.5

  context.fillStyle = "#111611"
  context.beginPath()
  context.arc(centerX, centerY, minimapRadiusPx + 2, 0, Math.PI * 2)
  context.fill()

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, minimapRadiusPx, 0, Math.PI * 2)
  context.clip()

  context.fillStyle = "#5f6d5d"
  context.fillRect(left, top, sizePx, sizePx)

  if (groundLayer.canvas) {
    const slice = layerSlice(groundLayer.canvas)
    context.drawImage(groundLayer.canvas, slice.srcX, slice.srcY, slice.srcW, slice.srcH, left, top, sizePx, sizePx)
  }

  if (flowerLayer.canvas) {
    const slice = layerSlice(flowerLayer.canvas)
    context.drawImage(flowerLayer.canvas, slice.srcX, slice.srcY, slice.srcW, slice.srcH, left, top, sizePx, sizePx)
  }

  const obstacleLayer = ensureMinimapObstacleLayer(world, sizePx, arenaRadiusWorld)
  if (obstacleLayer) {
    context.drawImage(obstacleLayer, left, top, sizePx, sizePx)
  }

  const viewBounds = buildCullBounds(renderCameraX, renderCameraY, 0)
  const viewTopLeft = toMinimap(viewBounds.minX, viewBounds.minY)
  const viewBottomRight = toMinimap(viewBounds.maxX, viewBounds.maxY)
  const viewWidth = Math.max(1, viewBottomRight.x - viewTopLeft.x)
  const viewHeight = Math.max(1, viewBottomRight.y - viewTopLeft.y)
  context.strokeStyle = "rgba(255, 246, 188, 0.72)"
  context.lineWidth = 1
  context.strokeRect(viewTopLeft.x, viewTopLeft.y, viewWidth, viewHeight)

  const now = typeof performance !== "undefined" ? performance.now() : 0
  const shouldRefreshDynamicLayer = now >= minimapDynamicLayerCache.nextRefreshAt ||
    Math.abs(minimapDynamicLayerCache.centerX - centerX) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.centerY - centerY) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.radiusPx - minimapRadiusPx) >= 0.5 ||
    Math.abs(minimapDynamicLayerCache.arenaRadiusWorld - arenaRadiusWorld) >= 0.001

  if (shouldRefreshDynamicLayer) {
    refreshMinimapDynamicLayer(world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)
    const dynamicRefreshInterval = world.flowerDirtyCount >= MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_FLOWER_DIRTY_THRESHOLD
      ? MINIMAP_DYNAMIC_LAYER_HIGH_LOAD_REFRESH_INTERVAL_MS
      : MINIMAP_DYNAMIC_LAYER_REFRESH_INTERVAL_MS
    minimapDynamicLayerCache = {
      nextRefreshAt: now + dynamicRefreshInterval,
      centerX,
      centerY,
      radiusPx: minimapRadiusPx,
      arenaRadiusWorld,
    }
  }

  drawMinimapProjectileMarkers(context)
  drawMinimapExplosions(context)

  for (const unit of world.units) {
    const marker = toMinimap(unit.position.x, unit.position.y)
    if (marker.x < left || marker.x > left + sizePx || marker.y < top || marker.y > top + sizePx) {
      continue
    }

    const palette = paletteForUnit(world, unit)
    context.fillStyle = unit.isPlayer ? "#fff7bf" : palette.tone
    context.strokeStyle = "rgba(0, 0, 0, 0.75)"
    context.lineWidth = 1
    context.beginPath()
    context.arc(marker.x, marker.y, unit.isPlayer ? MINIMAP_PLAYER_RADIUS_PX : MINIMAP_UNIT_RADIUS_PX, 0, Math.PI * 2)
    context.fill()
    context.stroke()
  }

  context.restore()

  context.strokeStyle = "rgba(233, 238, 231, 0.82)"
  context.lineWidth = 1.5
  context.beginPath()
  context.arc(centerX, centerY, minimapRadiusPx, 0, Math.PI * 2)
  context.stroke()

  context.restore()
}

const renderArenaGround = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  waveTime: number,
  renderCameraX: number,
  renderCameraY: number,
) => {
  context.save()
  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-renderCameraX, -renderCameraY)

  context.fillStyle = "#a3c784"
  context.beginPath()
  context.arc(0, 0, world.arenaRadius, 0, Math.PI * 2)
  context.fill()

  context.save()
  context.beginPath()
  context.arc(0, 0, world.arenaRadius - 0.12, 0, Math.PI * 2)
  context.clip()

  const groundCullBounds = buildCullBounds(renderCameraX, renderCameraY, 3)
  const minWorldX = groundCullBounds.minX
  const maxWorldX = groundCullBounds.maxX
  const minWorldY = groundCullBounds.minY
  const maxWorldY = groundCullBounds.maxY

  const groundLayer = ensureGroundLayerCache(world)
  if (groundLayer.canvas) {
    const mapSize = groundLayer.size
    const halfMap = Math.floor(mapSize * 0.5)
    context.drawImage(groundLayer.canvas, -halfMap, -halfMap, mapSize, mapSize)
  } else {
    context.fillStyle = GRASS_BASE_COLOR
    context.fillRect(minWorldX, minWorldY, maxWorldX - minWorldX, maxWorldY - minWorldY)
  }

  if (grassTransitionsTextureLoaded) {
    context.globalAlpha = 0.08
    const stripeHeight = 2.4
    for (let stripeY = minWorldY - stripeHeight; stripeY < maxWorldY + stripeHeight; stripeY += stripeHeight) {
      const alpha = clamp((Math.sin(stripeY * 0.34 + waveTime * 0.7) * 0.5 + 0.5) * 0.16, 0.03, 0.16)
      context.fillStyle = `rgba(81, 99, 75, ${alpha})`
      context.fillRect(minWorldX - 1, stripeY, maxWorldX - minWorldX + 2, stripeHeight)
    }
    context.globalAlpha = 1
  }

  context.restore()
  context.restore()
}

const renderArenaBoundary = (context: CanvasRenderingContext2D, world: WorldState) => {
  context.strokeStyle = "#bcc1bd"
  context.lineWidth = 0.45
  context.beginPath()
  context.arc(0, 0, world.arenaRadius, 0, Math.PI * 2)
  context.stroke()

  context.strokeStyle = "#7e8681"
  context.lineWidth = 0.2
  context.beginPath()
  context.arc(0, 0, world.arenaRadius - 0.5, 0, Math.PI * 2)
  context.stroke()
}

const renderFlowers = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number,
  frameToken: number,
) => {
  const renderedWithWebGl = renderFlowerInstances({
    context,
    world,
    cameraX: renderCameraX,
    cameraY: renderCameraY,
  })
  if (renderedWithWebGl) {
    return
  }

  flushFlowerLayer(world, frameToken)

  const layer = ensureFlowerLayerCache(world)
  if (!layer.canvas) {
    return
  }

  const mapSize = layer.size
  const halfMap = Math.floor(mapSize * 0.5)
  context.drawImage(layer.canvas, -halfMap, -halfMap, mapSize, mapSize)
}

const pickupGlowColor = (pickup: WorldState["pickups"][number]) => {
  if (pickup.kind === "perk") {
    return "255, 118, 118"
  }

  if (pickup.highTier) {
    return "244, 248, 255"
  }

  return "255, 214, 104"
}

const renderPickups = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  dt: number,
  fogCullBounds: FogCullBounds,
) => {
  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }

    if (!isInsideFogCullBounds(pickup.position.x, pickup.position.y, fogCullBounds, pickup.radius + 0.5)) {
      continue
    }

    const bobOffset = Math.sin(pickup.bob + dt * 4) * 0.14
    const pulse = 0.35 + (Math.sin(pickup.bob * 1.6) * 0.5 + 0.5) * 0.35
    const glow = pickupGlowColor(pickup)

    context.fillStyle = `rgba(${glow}, ${0.18 + pulse * 0.2})`
    context.beginPath()
    context.arc(pickup.position.x, pickup.position.y + bobOffset, 0.68 + pulse * 0.22, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = `rgba(${glow}, ${0.28 + pulse * 0.35})`
    context.lineWidth = 0.08
    context.beginPath()
    context.arc(pickup.position.x, pickup.position.y + bobOffset, 0.5 + pulse * 0.14, 0, Math.PI * 2)
    context.stroke()

    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(pickup.position.x, pickup.position.y + 0.55, 0.45, 0.2, 0, 0, Math.PI * 2)
    context.fill()

    const spriteId = pickup.kind === "perk" && pickup.perkId ? pickup.perkId : pickup.weapon
    drawItemPickupSprite(context, spriteId, pickup.position.x, pickup.position.y + bobOffset)
  }
}

const renderThrowables = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderTrails: boolean,
  fogCullBounds: FogCullBounds,
) => {
  for (const throwable of world.throwables) {
    if (!throwable.active) {
      continue
    }

    if (!isInsideFogCullBounds(throwable.position.x, throwable.position.y, fogCullBounds, throwable.radius + 0.8)) {
      continue
    }

    if (throwable.mode === "grenade") {
      const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
      if (renderTrails && speed > 0.45) {
        const directionX = throwable.velocity.x / speed
        const directionY = throwable.velocity.y / speed
        const trailLength = clamp(speed * 0.045, 0.12, 0.58)
        for (let index = 0; index < 4; index += 1) {
          const t = index / 3
          const alpha = (1 - t) * 0.16
          const spread = 0.02 + t * 0.05
          context.fillStyle = `rgba(238, 244, 222, ${alpha})`
          context.beginPath()
          context.ellipse(
            throwable.position.x - directionX * trailLength * (0.4 + t * 0.9),
            throwable.position.y - directionY * trailLength * (0.4 + t * 0.9),
            0.09 + spread,
            0.05 + spread * 0.7,
            0,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      }

      context.fillStyle = "rgba(0, 0, 0, 0.28)"
      context.beginPath()
      context.ellipse(throwable.position.x, throwable.position.y + 0.22, 0.2, 0.11, 0, 0, Math.PI * 2)
      context.fill()

      context.save()
      context.translate(throwable.position.x, throwable.position.y)
      context.rotate(throwable.rotation)
      drawGrenadeSprite(context, 0, 0, 0.08)
      context.restore()
      continue
    }

    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(throwable.position.x, throwable.position.y + 0.2, 0.18, 0.1, 0, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(throwable.position.x, throwable.position.y)
    context.rotate(throwable.rotation)
    drawMolotovSprite(context, 0, 0, 0.08)
    context.restore()
  }
}

const renderMolotovZones = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const zone of world.molotovZones) {
    if (!zone.active) {
      continue
    }

    if (!isInsideFogCullBounds(zone.position.x, zone.position.y, fogCullBounds, zone.radius + 0.5)) {
      continue
    }

    const fullLife = zone.source === "flame" ? 3 : 2.2
    const alpha = clamp(zone.life / fullLife, 0, 1)
    if (zone.source === "flame") {
      context.fillStyle = `rgba(40, 34, 27, ${0.46 * alpha})`
      context.beginPath()
      context.arc(zone.position.x, zone.position.y, zone.radius * 1.06, 0, Math.PI * 2)
      context.fill()
    }

    context.fillStyle = zone.source === "flame"
      ? `rgba(214, 108, 40, ${0.3 * alpha})`
      : `rgba(244, 120, 46, ${0.24 * alpha})`
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = zone.source === "flame"
      ? `rgba(255, 193, 132, ${0.55 * alpha})`
      : `rgba(255, 176, 84, ${0.5 * alpha})`
    context.lineWidth = 0.15
    context.beginPath()
    context.arc(zone.position.x, zone.position.y, Math.max(0.06, zone.radius - 0.2), 0, Math.PI * 2)
    context.stroke()
  }
}

const renderObstacles = (context: CanvasRenderingContext2D, world: WorldState) => {
  const grid = world.obstacleGrid
  const cullRange = buildObstacleGridCullRange(grid.size, world.camera.x, world.camera.y, 2)

  if (cullRange.maxX < cullRange.minX || cullRange.maxY < cullRange.minY) {
    return
  }

  for (let gy = cullRange.minY; gy <= cullRange.maxY; gy += 1) {
    for (let gx = cullRange.minX; gx <= cullRange.maxX; gx += 1) {
      const index = gy * grid.size + gx
      if (grid.solid[index] <= 0) {
        continue
      }

      const material = grid.material[index]
      const center = obstacleGridToWorldCenter(grid.size, gx, gy)
      const tileX = center.x - 0.5
      const tileY = center.y - 0.5

      if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
        context.fillStyle = "#5f655d"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#9ca293"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#757b70"
        context.fillRect(tileX + 0.08, tileY + 0.46, 0.84, 0.12)
      } else if (material === OBSTACLE_MATERIAL_WALL) {
        context.fillStyle = "#874b39"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#ab6850"
        context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
        context.fillStyle = "#6e3528"
        context.fillRect(tileX + 0.06, tileY + 0.46, 0.88, 0.08)
      } else if (material === OBSTACLE_MATERIAL_BOX) {
        const isHighTierBox = grid.highTierLoot[index] > 0
        if (isHighTierBox) {
          context.fillStyle = "#4d535b"
          context.fillRect(tileX, tileY, 1, 1)
          context.fillStyle = "#d7dde6"
          context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
          context.fillStyle = "#f4f8ff"
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.24)
          context.fillStyle = "#ffffff"
          context.fillRect(tileX + 0.44, tileY + 0.08, 0.12, 0.84)
          context.fillStyle = "#96a0ad"
          context.fillRect(tileX + 0.08, tileY + 0.54, 0.84, 0.1)
        } else {
          context.fillStyle = "#6f2d2b"
          context.fillRect(tileX, tileY, 1, 1)
          context.fillStyle = "#df6f3f"
          context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
          context.fillStyle = "#ffd36e"
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.24)
          context.fillStyle = "#f6e5a8"
          context.fillRect(tileX + 0.44, tileY + 0.08, 0.12, 0.84)
          context.fillStyle = "#a1402e"
          context.fillRect(tileX + 0.08, tileY + 0.54, 0.84, 0.1)
        }
      } else if (material === OBSTACLE_MATERIAL_ROCK) {
        context.fillStyle = "#676a64"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#8f948b"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#5d605a"
        context.fillRect(tileX + 0.14, tileY + 0.14, 0.72, 0.08)
      } else if (material === OBSTACLE_MATERIAL_HEDGE) {
        context.fillStyle = "#496d41"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#a9c99a"
        context.fillRect(tileX + 0.06, tileY + 0.06, 0.88, 0.88)
        context.fillStyle = "#d2e6c7"
        context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.2)
        context.fillStyle = "#7ea976"
        context.fillRect(tileX + 0.08, tileY + 0.56, 0.84, 0.12)
      }

      const flash = grid.flash[index]
      if (flash > 0.01) {
        const flashKind = grid.flashKind[index]
        if (flashKind === OBSTACLE_FLASH_BLOCKED) {
          const flicker = 0.4 + Math.sin((1 - flash) * 40) * 0.3
          context.fillStyle = `rgba(255, 255, 255, ${clamp(flash * flicker, 0, 1) * 0.72})`
          context.fillRect(tileX + 0.04, tileY + 0.04, 0.92, 0.92)
        } else if (flashKind === OBSTACLE_FLASH_DAMAGED) {
          const flicker = 0.6 + Math.sin((1 - flash) * 44) * 0.4
          const intensity = clamp(flash * flicker, 0, 1)
          context.fillStyle = `rgba(255, 112, 38, ${intensity * 0.95})`
          context.fillRect(tileX + 0.03, tileY + 0.03, 0.94, 0.94)
          context.fillStyle = `rgba(255, 214, 138, ${intensity * 0.5})`
          context.fillRect(tileX + 0.12, tileY + 0.12, 0.76, 0.76)
        }
      }
    }
  }
}

const renderObstacleDebris = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const debris of world.obstacleDebris) {
    if (!debris.active || debris.maxLife <= 0) {
      continue
    }

    if (!isInsideFogCullBounds(debris.position.x, debris.position.y, fogCullBounds, debris.size + 0.35)) {
      continue
    }

    const lifeRatio = clamp(debris.life / debris.maxLife, 0, 1)
    const alpha = lifeRatio * lifeRatio
    const size = debris.size * (0.7 + (1 - lifeRatio) * 0.5)

    context.save()
    context.globalAlpha = alpha
    context.translate(debris.position.x, debris.position.y)
    context.rotate(debris.rotation)
    context.fillStyle = debris.color
    context.fillRect(-size * 0.5, -size * 0.5, size, size)
    context.fillStyle = "rgba(24, 18, 16, 0.34)"
    context.fillRect(-size * 0.5, size * 0.1, size, size * 0.2)
    context.restore()
  }
}

const renderShellCasings = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  fogCullBounds: FogCullBounds,
  spriteMode: "all" | "only-sprite" | "only-plain" = "all",
) => {
  for (const casing of world.shellCasings) {
    if (!casing.active || casing.maxLife <= 0) {
      continue
    }
    if (spriteMode === "only-sprite" && !casing.spriteId) {
      continue
    }
    if (spriteMode === "only-plain" && casing.spriteId) {
      continue
    }

    if (!isInsideFogCullBounds(casing.position.x, casing.position.y, fogCullBounds, casing.size + 0.3)) {
      continue
    }

    const lifeRatio = clamp(casing.life / casing.maxLife, 0, 1)
    context.save()
    context.globalAlpha = lifeRatio * 0.9
    context.translate(casing.position.x, casing.position.y)
    context.rotate(casing.rotation)
    if (casing.spriteId) {
      drawItemPickupSprite(context, casing.spriteId, 0, 0, casing.spriteSize > 0 ? casing.spriteSize : casing.size)
    } else {
      context.fillStyle = "#e7c66a"
      context.fillRect(-casing.size * 0.5, -casing.size * 0.28, casing.size, casing.size * 0.56)
      context.fillStyle = "#b18b34"
      context.fillRect(-casing.size * 0.5, casing.size * 0.03, casing.size, casing.size * 0.16)
    }
    context.restore()
  }
}

const renderExplosions = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const explosion of world.explosions) {
    if (!explosion.active) {
      continue
    }

    if (!isInsideFogCullBounds(explosion.position.x, explosion.position.y, fogCullBounds, explosion.radius + 0.85)) {
      continue
    }

    const alpha = clamp(explosion.life / 0.24, 0, 1)
    const radius = explosion.radius * (1 + (1 - alpha) * 0.45)
    if (explosion.radius <= 0.18) {
      const pulse = 1 + (1 - alpha) * 0.25
      context.fillStyle = `rgba(255, 86, 86, ${0.62 * alpha})`
      context.fillRect(
        explosion.position.x - explosion.radius * pulse,
        explosion.position.y - explosion.radius * pulse,
        explosion.radius * 2 * pulse,
        explosion.radius * 2 * pulse,
      )
      continue
    }

    context.fillStyle = `rgba(255, 192, 74, ${0.24 * alpha})`
    context.beginPath()
    context.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = `rgba(255, 132, 56, ${0.72 * alpha})`
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + (1 - alpha) * 0.8
      const spike = radius * randomRange(0.16, 1)
      context.fillRect(
        explosion.position.x + Math.cos(angle) * spike - 0.08,
        explosion.position.y + Math.sin(angle) * spike - 0.08,
        0.16,
        0.16,
      )
    }
  }
}

const renderMuzzleFlashes = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const flash of world.muzzleFlashes) {
    if (!flash.active) {
      continue
    }

    if (!isInsideFogCullBounds(flash.position.x, flash.position.y, fogCullBounds, flash.radius * 2.4)) {
      flash.active = false
      continue
    }

    const radius = Math.max(0.08, flash.radius)
    context.save()
    context.globalCompositeOperation = "lighter"
    context.fillStyle = "rgba(255, 120, 42, 0.42)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 1.9, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "rgba(255, 166, 68, 0.78)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 1.16, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "rgba(255, 214, 150, 0.96)"
    context.beginPath()
    context.arc(flash.position.x, flash.position.y, radius * 0.56, 0, Math.PI * 2)
    context.fill()
    context.restore()

    flash.active = false
  }
}

const renderProjectiles = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderTrails: boolean,
  fogCullBounds: FogCullBounds,
) => {
  for (const projectile of world.projectiles) {
    if (!projectile.active) {
      continue
    }

    if (
      !isInsideFogCullBounds(projectile.position.x, projectile.position.y, fogCullBounds, projectile.radius * 3.2 + 0.7)
    ) {
      continue
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const stretch = projectile.kind === "rocket"
      ? clamp(speed / 25, 0.2, 2.9)
      : clamp(speed / 25, 1.1, projectile.kind === "flame" ? 2.2 : 2.9)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)

    context.fillStyle = "rgba(0, 0, 0, 0.26)"
    context.beginPath()
    context.ellipse(
      projectile.position.x,
      projectile.position.y + 0.26,
      projectile.radius * 0.8,
      projectile.radius * 0.45,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()

    if (projectile.kind === "flame") {
      context.fillStyle = "rgba(255, 148, 72, 0.36)"
      context.beginPath()
      context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
      context.fill()
    } else {
      context.fillStyle = "rgba(255, 245, 208, 0.16)"
      context.beginPath()
      context.arc(projectile.position.x, projectile.position.y, projectile.radius * 1.05, 0, Math.PI * 2)
      context.fill()
    }

    if (renderTrails) {
      context.save()
      context.translate(projectile.position.x, projectile.position.y)
      context.rotate(angle)

      if (projectile.kind === "rocket") {
        const trailLength = length * 1.45 * ROCKET_TRAIL_LENGTH_MULTIPLIER
        for (let index = 0; index < 7; index += 1) {
          const t = index / 6
          const alpha = (1 - t) * 0.5
          const spread = (index - 3) * width * (0.12 + t * 0.12)
          context.fillStyle = `rgba(60, 66, 74, ${alpha})`
          context.beginPath()
          context.ellipse(
            -trailLength * (0.24 + t * 0.62),
            spread,
            width * (0.42 + t * 0.28),
            width * (0.42 + t * 0.28),
            0,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      } else {
        const trailLength = projectile.kind === "flame" ? length * 1.1 : length * 1.65
        for (let index = 0; index < 6; index += 1) {
          const t = index / 5
          const alpha = projectile.kind === "flame" ? (1 - t) * 0.2 : (1 - t) * 0.22
          context.fillStyle = projectile.kind === "flame"
            ? `rgba(255, 177, 122, ${alpha})`
            : `rgba(255, 230, 170, ${alpha})`
          context.beginPath()
          context.ellipse(
            -trailLength * (0.3 + t * 0.58),
            0,
            width * (0.9 - t * 0.36),
            width * (0.56 - t * 0.24),
            0,
            0,
            Math.PI * 2,
          )
          context.fill()
        }
      }

      context.restore()
    }

    if (projectile.kind === "flame") {
      drawFlameProjectileSprite(context, projectile.position.x, projectile.position.y, 0.07)
      continue
    }

    context.save()
    context.translate(projectile.position.x, projectile.position.y)
    context.rotate(angle)

    context.fillStyle = "rgba(255, 181, 72, 0.35)"
    context.beginPath()
    context.ellipse(-length * 0.2, 0, length * 0.55, width * 0.86, 0, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = "#ffc248"
    context.beginPath()
    context.moveTo(-length * 0.52, 0)
    context.quadraticCurveTo(-length * 0.2, -width * 0.65, length * 0.45, 0)
    context.quadraticCurveTo(-length * 0.2, width * 0.65, -length * 0.52, 0)
    context.fill()

    context.fillStyle = "#fff2aa"
    context.beginPath()
    context.ellipse(length * 0.18, 0, width * 0.4, width * 0.3, 0, 0, Math.PI * 2)
    context.fill()

    context.restore()
  }
}

const renderAimLasers = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  const LASER_LENGTH_WORLD = 9.5
  const pulse = 0.7 + (Math.sin(grassWaveTime * 6.5) * 0.5 + 0.5) * 0.3
  context.save()

  for (const unit of world.units) {
    const unitHasLaserSight = unit.laserSight || (unit.perkStacks.laser_sight ?? 0) > 0
    if (!unitHasLaserSight) {
      continue
    }

    if (!isInsideFogCullBounds(unit.position.x, unit.position.y, fogCullBounds, unit.radius + 10)) {
      continue
    }

    const aimLength = Math.hypot(unit.aim.x, unit.aim.y)
    if (aimLength <= 0.0001) {
      continue
    }

    const dirX = unit.aim.x / aimLength
    const dirY = unit.aim.y / aimLength
    const startX = unit.position.x + dirX * (unit.radius + 0.12)
    const startY = unit.position.y + dirY * (unit.radius + 0.12)
    const endX = startX + dirX * LASER_LENGTH_WORLD
    const endY = startY + dirY * LASER_LENGTH_WORLD
    const normalX = -dirY
    const normalY = dirX
    const halfBaseWidth = (unit.isPlayer ? 0.03 : 0.022) * pulse
    const baseLeftX = startX + normalX * halfBaseWidth
    const baseLeftY = startY + normalY * halfBaseWidth
    const baseRightX = startX - normalX * halfBaseWidth
    const baseRightY = startY - normalY * halfBaseWidth
    const alpha = unit.isPlayer ? 0.72 * pulse : 0.48 * pulse

    context.fillStyle = unit.isPlayer ? `rgba(255, 106, 106, ${alpha})` : `rgba(255, 80, 80, ${alpha})`
    context.beginPath()
    context.moveTo(baseLeftX, baseLeftY)
    context.lineTo(baseRightX, baseRightY)
    context.lineTo(endX, endY)
    context.closePath()
    context.fill()
  }

  context.restore()
}

const renderRagdolls = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const ragdoll of world.ragdolls) {
    if (!ragdoll.active || ragdoll.maxLife <= 0) {
      continue
    }

    if (!isInsideFogCullBounds(ragdoll.position.x, ragdoll.position.y, fogCullBounds, ragdoll.radius * 2.8 + 0.75)) {
      continue
    }

    if (ragdoll.life <= 0) {
      continue
    }

    const body = ragdoll.radius * 1.2
    const palette = paletteForRagdoll(world, ragdoll)
    const tone = palette.tone
    const edge = palette.edge

    context.fillStyle = "rgba(0, 0, 0, 0.2)"
    context.beginPath()
    context.ellipse(
      ragdoll.position.x,
      ragdoll.position.y + body * 1.24,
      body * 0.58,
      body * 0.31,
      0,
      0,
      Math.PI * 2,
    )
    context.fill()

    context.save()
    context.translate(ragdoll.position.x, ragdoll.position.y)
    context.rotate(ragdoll.rotation)

    context.fillStyle = edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64)
    context.restore()
  }
}

const renderUnitStatusRings = (
  context: CanvasRenderingContext2D,
  unit: WorldState["units"][number],
  drawX: number,
  drawY: number,
  body: number,
) => {
  const isPrimaryReloading = unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0
  const primaryProgress = isPrimaryReloading
    ? clamp(1 - unit.reloadCooldown / unit.reloadCooldownMax, 0, 1)
    : Number.isFinite(unit.primaryAmmo) && Number.isFinite(unit.magazineSize) && unit.magazineSize > 0
    ? clamp(unit.primaryAmmo / unit.magazineSize, 0, 1)
    : 1
  const primaryRadius = body + PRIMARY_RELOAD_RING_OFFSET_WORLD
  const secondaryRadius = primaryRadius -
    (PRIMARY_RELOAD_RING_THICKNESS_WORLD + SECONDARY_RELOAD_RING_THICKNESS_WORLD) * 0.5
  const isSecondaryReloading = unit.secondaryCooldown > 0 && unit.secondaryCooldownMax > 0
  const secondaryProgress = isSecondaryReloading
    ? clamp(1 - unit.secondaryCooldown / unit.secondaryCooldownMax, 0, 1)
    : 1

  context.save()
  context.lineCap = "butt"
  context.beginPath()
  context.arc(drawX, drawY, primaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * primaryProgress)
  context.strokeStyle = isPrimaryReloading ? PRIMARY_RELOAD_PROGRESS_RING_COLOR : PRIMARY_RELOAD_RING_COLOR
  context.lineWidth = PRIMARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()

  context.beginPath()
  context.arc(drawX, drawY, secondaryRadius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * secondaryProgress)
  context.strokeStyle = isSecondaryReloading ? SECONDARY_RELOAD_PROGRESS_RING_COLOR : SECONDARY_RELOAD_RING_COLOR
  context.lineWidth = SECONDARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()

  context.restore()
}

const renderUnits = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42

    if (!isInsideFogCullBounds(drawX, drawY, fogCullBounds, body * 2.8)) {
      continue
    }

    renderUnitStatusRings(context, unit, drawX, drawY, body)

    const moveSpeed = Math.hypot(unit.velocity.x, unit.velocity.y)
    const skew = clamp(moveSpeed / 12, 0, 1)
    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(
      drawX - unit.velocity.x * 0.012,
      drawY + body * 1.26,
      body * (0.68 + skew * 0.12),
      body * (0.37 - skew * 0.05),
      0,
      0,
      Math.PI * 2,
    )
    context.fill()

    const palette = paletteForUnit(world, unit)
    const tone = palette.tone
    const edge = palette.edge
    const horizontalSkew = computeHorizontalSkewX(unit.velocity.x, unit.speed)
    const earLeftX = -body * 0.7
    const earRightX = body * 0.7
    const earY = -body * 0.95

    context.save()
    context.translate(drawX, drawY)
    context.transform(1, 0, horizontalSkew, 1, 0, 0)

    context.fillStyle = edge
    context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillStyle = tone
    context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)

    context.fillStyle = edge
    context.fillRect(-body * 0.85, -body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(-body * 0.68, -body * 0.82, body * 1.36, body * 1.64)

    const weaponKickback = computeWeaponKickbackDistance(
      unit.recoil,
      PRIMARY_WEAPONS[unit.primaryWeapon].firingKnockback,
      unit.radius,
    )
    const gunLength = Math.max(unit.radius * 0.42, unit.radius * 1.25 - weaponKickback)
    const weaponAngle = Math.atan2(unit.aim.y, unit.aim.x)
    const weaponScale = Math.max(0.1, unit.radius * 0.36) * 1.5
    const flipWeapon = unit.aim.x < 0
    context.save()
    if (flipWeapon) {
      context.scale(1, -1)
    }
    context.rotate(flipWeapon ? -weaponAngle : weaponAngle)
    drawWeaponPickupSprite(
      context,
      unit.primaryWeapon,
      gunLength,
      0,
      weaponScale,
      0.5,
      unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0 ? "unloaded" : "default",
    )
    context.restore()

    if (unit.hitFlash > 0) {
      const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
      context.globalAlpha = clamp(unit.hitFlash * flicker, 0, 1)
      context.fillStyle = unit.isPlayer ? "#ff8a8a" : "#ff5454"
      context.fillRect(-body * 0.75, -body * 0.85, body * 1.5, body * 1.7)
      context.fillRect(earLeftX - body * 0.18, earY - body * 0.25, body * 1.36, body * 0.32)
      context.globalAlpha = 1
    }

    context.restore()

    const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
    context.fillStyle = "rgba(0, 0, 0, 0.4)"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2, body * 0.24)
    context.fillStyle = unit.isPlayer ? "#e8ffdb" : "#8fc0ff"
    context.fillRect(drawX - body, drawY - body * 1.28, body * 2 * hpRatio, body * 0.24)
  }
}

const renderOffscreenEnemyIndicators = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  renderCameraX: number,
  renderCameraY: number,
  viewportOverflow: CanvasViewportOverflowPx,
) => {
  drawOffscreenEnemyIndicators({
    context,
    world,
    renderCameraX,
    renderCameraY,
    viewportOverflow,
    paletteForUnit,
  })
}

const renderDamagePopups = (context: CanvasRenderingContext2D, world: WorldState, fogCullBounds: FogCullBounds) => {
  context.textAlign = "center"
  context.font = "0.9px monospace"
  for (const popup of world.damagePopups) {
    if (!popup.active) {
      continue
    }

    if (!isInsideFogCullBounds(popup.position.x, popup.position.y, fogCullBounds, 0.9)) {
      continue
    }

    const alpha = clamp(popup.life / 0.62, 0, 1)
    const scale = 1 + (1 - alpha) * 0.14
    context.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`
    context.fillText(popup.text, popup.position.x + 0.05, popup.position.y + 0.05)

    context.save()
    context.globalAlpha = alpha
    context.fillStyle = popup.color
    context.translate(popup.position.x, popup.position.y)
    context.scale(scale, scale)
    context.fillText(popup.text, 0, 0)
    context.restore()
  }
}

const renderAtmosphere = (context: CanvasRenderingContext2D) => {
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    60,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    VIEW_WIDTH * 0.75,
  )
  gradient.addColorStop(0, "rgba(212, 216, 214, 0)")
  gradient.addColorStop(1, "rgba(64, 69, 67, 0.24)")
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}

const renderDamageVignette = (context: CanvasRenderingContext2D, world: WorldState) => {
  const damageRatio = computeDamageTakenRatio(world.player.hp, world.player.maxHp)
  if (damageRatio <= 0) {
    return
  }

  const intensity = damageRatio ** DAMAGE_VIGNETTE_INTENSITY_CURVE
  const alpha = intensity * DAMAGE_VIGNETTE_MAX_ALPHA
  const gradient = context.createRadialGradient(
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    Math.max(VIEW_WIDTH, VIEW_HEIGHT) * DAMAGE_VIGNETTE_CENTER_RADIUS_RATIO,
    VIEW_WIDTH * 0.5,
    VIEW_HEIGHT * 0.5,
    Math.max(VIEW_WIDTH, VIEW_HEIGHT) * DAMAGE_VIGNETTE_EDGE_RADIUS_RATIO,
  )

  gradient.addColorStop(0, "rgba(255, 0, 0, 0)")
  gradient.addColorStop(0.55, `rgba(255, 0, 0, ${alpha * 0.42})`)
  gradient.addColorStop(1, `rgba(255, 0, 0, ${alpha})`)
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}
