import type { CullBounds } from "../cull.ts"
import { clamp } from "../utils.ts"
import type { TerrainTile } from "../world/terrain-map.ts"
import type { WorldState } from "../world/state.ts"
import grassBaseTextureUrl from "../../assets/tiles/grass-base-24.png"
import grassDarkTextureUrl from "../../assets/tiles/grass-dark-24.png"
import grassTransitionsTextureUrl from "../../assets/tiles/grass-transitions-24.png"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"
import {
  createWebGLRenderTarget,
  destroyWebGLRenderTarget,
  drawTintedWebGLImage,
  drawWebGLRenderTarget,
  getWebGL2RenderingContext,
  parseColor,
  type Rgba,
  type WebGLRenderTarget,
  withWebGLRenderTarget,
} from "./webgl2-canvas-context.ts"

const GRASS_TILE_PIXEL_SIZE = 24
const GROUND_PIXELS_PER_TILE = 24
const FLOWER_PIXELS_PER_TILE = 12
const GRASS_TRANSITION_COLS = 5
const GRASS_DARK_VARIANTS = 3
const GRASS_TRANSITION_MASK_ORDER = [1, 2, 4, 8, 3, 6, 12, 9, 5, 10, 7, 14, 13, 11, 15]
const GRASS_MASK_TO_TILE_INDEX = new Map(GRASS_TRANSITION_MASK_ORDER.map((mask, index) => [mask, index]))
const FLOWER_FLUSH_MIN = 64
const FLOWER_FLUSH_MAX = 360

export const GRASS_BASE_COLOR = "#8fa684"

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

interface LoadedImage {
  image: HTMLImageElement | null
  loaded: boolean
}

const loadImage = (url: string): LoadedImage => {
  const state: LoadedImage = { image: null, loaded: false }
  if (typeof Image === "undefined") return state
  const image = new Image()
  state.image = image
  image.onload = () => {
    state.loaded = true
  }
  image.src = url
  if (image.complete && image.naturalWidth > 0) state.loaded = true
  return state
}

const grassBase = loadImage(grassBaseTextureUrl)
const grassDark = loadImage(grassDarkTextureUrl)
const grassTransitions = loadImage(grassTransitionsTextureUrl)
const flowerPetalMask = loadImage(flowerPetalMaskUrl)
const flowerAccentMask = loadImage(flowerAccentMaskUrl)

interface GroundPatchCache {
  terrainMapRef: WorldState["terrainMap"] | null
  size: number
  cells: Uint8Array
}

let groundPatchCache: GroundPatchCache = {
  terrainMapRef: null,
  size: 0,
  cells: new Uint8Array(0),
}

interface LayerState {
  terrainMapRef: WorldState["terrainMap"] | null
  size: number
  pixelsPerWorld: number
  textureStateKey: string
  target: WebGLRenderTarget | null
}

const groundLayers = new WeakMap<object, LayerState>()
const flowerLayers = new WeakMap<object, LayerState>()

const keyFor = (context: CanvasRenderingContext2D) => context as unknown as object

const textureStateKey = () =>
  `${grassBase.loaded ? 1 : 0}-${grassDark.loaded ? 1 : 0}-${grassTransitions.loaded ? 1 : 0}`

const grassCellNoise = (x: number, y: number, seed: number) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 73.17) * 43758.5453123
  return value - Math.floor(value)
}

const patchAt = (cells: Uint8Array, size: number, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= size || y >= size) return 0
  return cells[y * size + x]
}

const patchNeighborCount = (cells: Uint8Array, size: number, x: number, y: number) => {
  let count = 0
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue
      count += patchAt(cells, size, x + ox, y + oy)
    }
  }
  return count
}

const buildGroundPatchCache = (world: WorldState) => {
  const size = world.terrainMap.size
  const cells = new Uint8Array(size * size)
  const half = Math.floor(size * 0.5)
  for (let gridY = 0; gridY < size; gridY += 1) {
    for (let gridX = 0; gridX < size; gridX += 1) {
      const cellX = gridX - half
      const cellY = gridY - half
      const terrain = world.terrainMap.tiles[gridY][gridX]
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
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const neighbors = patchNeighborCount(cells, size, x, y)
        if (neighbors >= 5) smoothed[y * size + x] = 1
        else if (neighbors <= 2) smoothed[y * size + x] = 0
      }
    }
    cells.set(smoothed)
  }

  groundPatchCache = { terrainMapRef: world.terrainMap, size, cells }
  return groundPatchCache
}

const ensureGroundPatchCache = (world: WorldState) => {
  if (groundPatchCache.terrainMapRef === world.terrainMap && groundPatchCache.size === world.terrainMap.size) {
    return groundPatchCache
  }
  return buildGroundPatchCache(world)
}

const choosePixelsPerWorld = (context: CanvasRenderingContext2D, worldSize: number, preferred: number) => {
  const gl = getWebGL2RenderingContext(context)
  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
  return Math.max(1, Math.min(preferred, Math.floor(maxTextureSize / Math.max(1, worldSize))))
}

const grassVariantIndex = (cellX: number, cellY: number) =>
  Math.floor(grassCellNoise(cellX, cellY, 0.93) * GRASS_DARK_VARIANTS) % GRASS_DARK_VARIANTS

const isGrassTile = (tile: TerrainTile) => tile === "grass" || tile === "clover" || tile === "wild-grass"

export const ensureWebGLGroundLayer = (context: CanvasRenderingContext2D, world: WorldState) => {
  const key = keyFor(context)
  const size = world.terrainMap.size
  const stateKey = textureStateKey()
  const existing = groundLayers.get(key)
  if (
    existing?.target &&
    existing.terrainMapRef === world.terrainMap &&
    existing.size === size &&
    existing.textureStateKey === stateKey
  ) {
    return existing
  }

  if (existing?.target) destroyWebGLRenderTarget(context, existing.target)
  const pixelsPerWorld = choosePixelsPerWorld(context, size, GROUND_PIXELS_PER_TILE)
  const target = createWebGLRenderTarget(context, size * pixelsPerWorld, size * pixelsPerWorld)
  const patchCache = ensureGroundPatchCache(world)
  const half = Math.floor(size * 0.5)

  context.save()
  withWebGLRenderTarget(context, target, true, () => {
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.imageSmoothingEnabled = false
    context.fillStyle = GRASS_BASE_COLOR
    context.fillRect(0, 0, target.width, target.height)

    if (grassBase.image && grassBase.loaded) {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          context.drawImage(grassBase.image, x * pixelsPerWorld, y * pixelsPerWorld, pixelsPerWorld, pixelsPerWorld)
        }
      }
    }

    if (grassTransitions.image && grassTransitions.loaded) {
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (!patchAt(patchCache.cells, size, x, y)) continue
          const north = patchAt(patchCache.cells, size, x, y - 1)
          const east = patchAt(patchCache.cells, size, x + 1, y)
          const south = patchAt(patchCache.cells, size, x, y + 1)
          const west = patchAt(patchCache.cells, size, x - 1, y)
          let mask = 0
          if (north) mask |= 1
          if (east) mask |= 2
          if (south) mask |= 4
          if (west) mask |= 8
          if (mask === 0) mask = 15
          const dx = x * pixelsPerWorld
          const dy = y * pixelsPerWorld
          if (mask === 15 && grassDark.image && grassDark.loaded) {
            const variant = grassVariantIndex(x - half, y - half)
            context.drawImage(
              grassDark.image,
              variant * GRASS_TILE_PIXEL_SIZE,
              0,
              GRASS_TILE_PIXEL_SIZE,
              GRASS_TILE_PIXEL_SIZE,
              dx,
              dy,
              pixelsPerWorld,
              pixelsPerWorld,
            )
            continue
          }
          const tileIndex = GRASS_MASK_TO_TILE_INDEX.get(mask)
          if (tileIndex === undefined) continue
          const sx = (tileIndex % GRASS_TRANSITION_COLS) * GRASS_TILE_PIXEL_SIZE
          const sy = Math.floor(tileIndex / GRASS_TRANSITION_COLS) * GRASS_TILE_PIXEL_SIZE
          context.drawImage(
            grassTransitions.image,
            sx,
            sy,
            GRASS_TILE_PIXEL_SIZE,
            GRASS_TILE_PIXEL_SIZE,
            dx,
            dy,
            pixelsPerWorld,
            pixelsPerWorld,
          )
        }
      }
    }

    context.globalAlpha = 0.84
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const terrain = world.terrainMap.tiles[y][x]
        if (isGrassTile(terrain)) continue
        const dx = x * pixelsPerWorld
        const dy = y * pixelsPerWorld
        context.fillStyle = TERRAIN_TINTS[terrain]
        context.fillRect(dx, dy, pixelsPerWorld, pixelsPerWorld)
        if (terrain === "dirt-road") {
          context.globalAlpha = 0.18
          context.fillStyle = "#d4c19a"
          context.fillRect(
            dx + pixelsPerWorld * 0.12,
            dy + pixelsPerWorld * 0.18,
            pixelsPerWorld * 0.76,
            pixelsPerWorld * 0.14,
          )
          context.globalAlpha = 0.84
        }
      }
    }
    context.globalAlpha = 1
  })
  context.restore()

  const next: LayerState = { terrainMapRef: world.terrainMap, size, pixelsPerWorld, textureStateKey: stateKey, target }
  groundLayers.set(key, next)
  return next
}

const ensureFlowerLayerState = (context: CanvasRenderingContext2D, world: WorldState) => {
  const key = keyFor(context)
  const size = world.terrainMap.size
  const existing = flowerLayers.get(key)
  if (existing?.target && existing.terrainMapRef === world.terrainMap && existing.size === size) return existing
  if (existing?.target) destroyWebGLRenderTarget(context, existing.target)
  const pixelsPerWorld = choosePixelsPerWorld(context, size, FLOWER_PIXELS_PER_TILE)
  const target = createWebGLRenderTarget(context, size * pixelsPerWorld, size * pixelsPerWorld)
  const next: LayerState = { terrainMapRef: world.terrainMap, size, pixelsPerWorld, textureStateKey: "", target }
  flowerLayers.set(key, next)

  world.flowerDirtyIndices.clear()
  for (const flower of world.flowers) {
    if (!flower.active || flower.slotIndex < 0) continue
    flower.renderDirty = true
    world.flowerDirtyIndices.add(flower.slotIndex)
  }
  world.flowerDirtyCount = world.flowerDirtyIndices.size
  return next
}

const flowerTint = (flower: WorldState["flowers"][number], center: boolean): Rgba => {
  if (!center) return parseColor(flower.color)
  return parseColor(flower.accent === "#29261f" ? "#6d5e42" : flower.accent)
}

const drawFlowerMask = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  flower: WorldState["flowers"][number],
  center: boolean,
) => {
  const size = Math.max(0.12, flower.size * 1.8)
  drawTintedWebGLImage(
    context,
    image,
    flower.position.x - size * 0.5,
    flower.position.y - size * 0.5,
    size,
    size,
    flowerTint(flower, center),
  )
}

export const flushWebGLFlowerLayer = (context: CanvasRenderingContext2D, world: WorldState) => {
  const layer = ensureFlowerLayerState(context, world)
  if (!layer.target || world.flowerDirtyIndices.size <= 0) return layer
  if (!flowerPetalMask.image || !flowerPetalMask.loaded || !flowerAccentMask.image || !flowerAccentMask.loaded) {
    return layer
  }

  const dirtyCount = world.flowerDirtyIndices.size
  const budget = clamp(Math.ceil(dirtyCount * 0.1), FLOWER_FLUSH_MIN, FLOWER_FLUSH_MAX)
  const completed: number[] = []
  for (const flowerIndex of world.flowerDirtyIndices) {
    const flower = world.flowers[flowerIndex]
    if (!flower || !flower.active || !flower.renderDirty) {
      world.flowerDirtyIndices.delete(flowerIndex)
      continue
    }
    if (flower.bloomDelay > 0 || flower.pop < 1) continue
    completed.push(flowerIndex)
    if (completed.length >= budget) break
  }

  if (completed.length <= 0) {
    world.flowerDirtyCount = world.flowerDirtyIndices.size
    return layer
  }

  const halfMap = Math.floor(layer.size * 0.5)
  context.save()
  withWebGLRenderTarget(context, layer.target, false, () => {
    context.setTransform(
      layer.pixelsPerWorld,
      0,
      0,
      layer.pixelsPerWorld,
      halfMap * layer.pixelsPerWorld,
      halfMap * layer.pixelsPerWorld,
    )
    for (const index of completed) drawFlowerMask(context, flowerPetalMask.image!, world.flowers[index], false)
    for (const index of completed) drawFlowerMask(context, flowerAccentMask.image!, world.flowers[index], true)
  })
  context.restore()

  for (const index of completed) {
    const flower = world.flowers[index]
    if (flower) flower.renderDirty = false
    world.flowerDirtyIndices.delete(index)
  }
  world.flowerDirtyCount = world.flowerDirtyIndices.size
  return layer
}

export const renderWebGLBloomingFlowers = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  cullBounds: CullBounds,
) => {
  if (!flowerPetalMask.image || !flowerPetalMask.loaded || !flowerAccentMask.image || !flowerAccentMask.loaded) return
  const visible: number[] = []
  for (const flowerIndex of world.flowerBloomingIndices) {
    const flower = world.flowers[flowerIndex]
    if (!flower?.active || flower.size <= 0) continue
    if (
      flower.position.x < cullBounds.minX || flower.position.x > cullBounds.maxX ||
      flower.position.y < cullBounds.minY || flower.position.y > cullBounds.maxY
    ) continue
    visible.push(flowerIndex)
  }
  for (const index of visible) drawFlowerMask(context, flowerPetalMask.image, world.flowers[index], false)
  for (const index of visible) drawFlowerMask(context, flowerAccentMask.image, world.flowers[index], true)
}

export const drawWorldLayer = (
  context: CanvasRenderingContext2D,
  layer: LayerState,
  minWorldX: number,
  minWorldY: number,
  worldWidth: number,
  worldHeight: number,
  destX = minWorldX,
  destY = minWorldY,
  destWidth = worldWidth,
  destHeight = worldHeight,
  alpha = 1,
) => {
  if (!layer.target || worldWidth <= 0 || worldHeight <= 0) return
  const halfMap = layer.size * 0.5
  drawWebGLRenderTarget(
    context,
    layer.target,
    (minWorldX + halfMap) * layer.pixelsPerWorld,
    (minWorldY + halfMap) * layer.pixelsPerWorld,
    worldWidth * layer.pixelsPerWorld,
    worldHeight * layer.pixelsPerWorld,
    destX,
    destY,
    destWidth,
    destHeight,
    alpha,
  )
}

export const ensureWebGLFlowerLayer = (context: CanvasRenderingContext2D, world: WorldState) =>
  ensureFlowerLayerState(context, world)

export const hasGrassTransitionsTextureLoaded = () => grassTransitions.loaded
export const groundTintForTerrain = (terrain: TerrainTile) => parseColor(TERRAIN_TINTS[terrain])
