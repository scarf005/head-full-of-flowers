import { terrainAt, type TerrainTile } from "../world/terrain-map.ts"
import type { WorldState } from "../world/state.ts"
import grassBaseTextureUrl from "../../assets/tiles/grass-base-24.png"
import grassDarkTextureUrl from "../../assets/tiles/grass-dark-24.png"
import grassTransitionsTextureUrl from "../../assets/tiles/grass-transitions-24.png"

export const GRASS_BASE_COLOR = "#8fa684"
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
const GROUND_LAYER_PIXELS_PER_TILE = GRASS_TILE_PIXEL_SIZE

let grassBaseTexture: HTMLImageElement | null = null
let grassDarkTexture: HTMLImageElement | null = null
let grassTransitionsTexture: HTMLImageElement | null = null
let grassBaseTextureLoaded = false
let grassDarkTextureLoaded = false
let grassTransitionsTextureLoaded = false

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

export const ensureGroundLayerCache = (world: WorldState) => {
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

export const hasGrassTransitionsTextureLoaded = () => grassTransitionsTextureLoaded
