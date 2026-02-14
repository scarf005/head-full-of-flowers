import { drawFlameProjectileSprite, drawGrenadeSprite, drawWeaponPickupSprite } from "./pixel-art.ts"
import { renderFlowerInstances } from "./flower-instanced.ts"
import { clamp, randomRange } from "../utils.ts"
import { botPalette } from "../factions.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import {
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter
} from "../world/obstacle-grid.ts"
import { terrainAt } from "../world/wfc-map.ts"
import type { WorldState } from "../world/state.ts"

export interface RenderSceneArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  dt: number
}

let grassWaveTime = Math.random() * Math.PI * 2

const GRASS_BASE_COLOR = "#8fa684"
const GRASS_TILE_PIXEL_SIZE = 24
const GRASS_TILE_WORLD_SIZE = 1
const GRASS_TRANSITION_COLS = 5
const GRASS_DARK_VARIANTS = 3
const GRASS_TRANSITION_MASK_ORDER = [1, 2, 4, 8, 3, 6, 12, 9, 5, 10, 7, 14, 13, 11, 15]
const GRASS_MASK_TO_TILE_INDEX = new Map(GRASS_TRANSITION_MASK_ORDER.map((mask, index) => [mask, index]))
const FLOWER_SPRITE_PIXEL_SIZE = 16
const FLOWER_LAYER_PIXELS_PER_TILE = 12
const FLOWER_LAYER_FLUSH_LIMIT = 1200
const PRIMARY_RELOAD_RING_THICKNESS_WORLD = 2 / WORLD_SCALE
const PRIMARY_RELOAD_RING_OFFSET_WORLD = 0.22
const PRIMARY_RELOAD_RING_COLOR = "#ffffff"
const PRIMARY_RELOAD_PROGRESS_RING_COLOR = "#c1c8cf"

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
  cells: new Uint8Array(0)
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
  context: null
}

if (typeof Image !== "undefined") {
  grassBaseTexture = new Image()
  grassBaseTexture.src = "/tiles/grass-base-24.png"
  grassBaseTexture.onload = () => {
    grassBaseTextureLoaded = true
  }
  if (grassBaseTexture.complete && grassBaseTexture.naturalWidth > 0) {
    grassBaseTextureLoaded = true
  }

  grassDarkTexture = new Image()
  grassDarkTexture.src = "/tiles/grass-dark-24.png"
  grassDarkTexture.onload = () => {
    grassDarkTextureLoaded = true
  }
  if (grassDarkTexture.complete && grassDarkTexture.naturalWidth > 0) {
    grassDarkTextureLoaded = true
  }

  grassTransitionsTexture = new Image()
  grassTransitionsTexture.src = "/tiles/grass-transitions-24.png"
  grassTransitionsTexture.onload = () => {
    grassTransitionsTextureLoaded = true
  }
  if (grassTransitionsTexture.complete && grassTransitionsTexture.naturalWidth > 0) {
    grassTransitionsTextureLoaded = true
  }

  flowerPetalMask = new Image()
  flowerPetalMask.src = "/flowers/flower-petal-mask.png"
  flowerPetalMask.onload = () => {
    flowerPetalMaskLoaded = true
  }
  if (flowerPetalMask.complete && flowerPetalMask.naturalWidth > 0) {
    flowerPetalMaskLoaded = true
  }

  flowerAccentMask = new Image()
  flowerAccentMask.src = "/flowers/flower-accent-mask.png"
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
          : -0.06
      const patchField = (
        Math.sin(cellX * 0.21 + cellY * 0.15 + 0.7) * 0.58
        + Math.sin(cellX * 0.07 - cellY * 0.13 + 1.8) * 0.42
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
    cells
  }
}

const ensureGroundPatchCache = (world: WorldState) => {
  if (groundPatchCache.terrainMapRef === world.terrainMap && groundPatchCache.size === world.terrainMap.size) {
    return groundPatchCache
  }
  buildGroundPatchCache(world)
  return groundPatchCache
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
    flowerLayerCache.terrainMapRef === world.terrainMap
    && flowerLayerCache.size === world.terrainMap.size
    && flowerLayerCache.canvas
    && flowerLayerCache.context
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
      context: null
    }
    return flowerLayerCache
  }

  context.imageSmoothingEnabled = false
  context.clearRect(0, 0, canvas.width, canvas.height)

  flowerLayerCache = {
    terrainMapRef: world.terrainMap,
    size,
    canvas,
    context
  }

  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }
    if (!flower.renderDirty) {
      flower.renderDirty = true
      world.flowerDirtyCount += 1
    }
  }

  return flowerLayerCache
}

const drawFlowerToLayer = (
  layerContext: CanvasRenderingContext2D,
  mapSize: number,
  flower: WorldState["flowers"][number]
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

const flushFlowerLayer = (world: WorldState) => {
  if (world.flowerDirtyCount <= 0) {
    return
  }

  const layer = ensureFlowerLayerCache(world)
  if (!layer.context) {
    return
  }

  let budget = FLOWER_LAYER_FLUSH_LIMIT
  for (const flower of world.flowers) {
    if (!flower.active || !flower.renderDirty) {
      continue
    }

    const drawn = drawFlowerToLayer(layer.context, layer.size, flower)
    if (!drawn) {
      continue
    }

    flower.renderDirty = false
    world.flowerDirtyCount = Math.max(0, world.flowerDirtyCount - 1)
    budget -= 1
    if (budget <= 0) {
      break
    }
  }
}

export const renderScene = ({ context, world, dt }: RenderSceneArgs) => {
  grassWaveTime += dt * 0.18

  context.save()
  context.imageSmoothingEnabled = false

  context.fillStyle = "#889684"
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

  const renderCameraX = world.camera.x + world.cameraOffset.x
  const renderCameraY = world.camera.y + world.cameraOffset.y

  renderArenaGround(context, world, grassWaveTime, renderCameraX, renderCameraY)

  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-renderCameraX, -renderCameraY)

  context.save()
  context.beginPath()
  context.arc(0, 0, Math.max(0.1, world.arenaRadius - 0.05), 0, Math.PI * 2)
  context.clip()

  renderMolotovZones(context, world)
  renderFlowers(context, world, renderCameraX, renderCameraY)
  renderObstacles(context, world)
  renderObstacleDebris(context, world)
  renderPickups(context, world, dt)
  renderThrowables(context, world)
  renderProjectiles(context, world)
  renderUnits(context, world)
  renderExplosions(context, world)
  renderDamagePopups(context, world)

  context.restore()
  renderArenaBoundary(context, world)
  context.restore()

  renderOffscreenEnemyIndicators(context, world, renderCameraX, renderCameraY)
  renderAtmosphere(context)
  renderMenuCard(context, world)
}

const renderArenaGround = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  waveTime: number,
  renderCameraX: number,
  renderCameraY: number
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

  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  const minWorldX = renderCameraX - halfViewX - 3
  const maxWorldX = renderCameraX + halfViewX + 3
  const minWorldY = renderCameraY - halfViewY - 3
  const maxWorldY = renderCameraY + halfViewY + 3

  const startCellX = Math.floor(minWorldX / GRASS_TILE_WORLD_SIZE) - 1
  const endCellX = Math.floor(maxWorldX / GRASS_TILE_WORLD_SIZE) + 1
  const startCellY = Math.floor(minWorldY / GRASS_TILE_WORLD_SIZE) - 1
  const endCellY = Math.floor(maxWorldY / GRASS_TILE_WORLD_SIZE) + 1
  const patchCache = ensureGroundPatchCache(world)
  const patchCells = patchCache.cells
  const patchSize = patchCache.size
  const halfPatch = Math.floor(patchSize * 0.5)

  context.fillStyle = GRASS_BASE_COLOR
  context.fillRect(minWorldX, minWorldY, maxWorldX - minWorldX, maxWorldY - minWorldY)

  if (grassBaseTexture && grassBaseTextureLoaded) {
    for (let cellY = startCellY; cellY <= endCellY; cellY += 1) {
      const mapY = cellY + halfPatch
      if (mapY < 0 || mapY >= patchSize) {
        continue
      }
      for (let cellX = startCellX; cellX <= endCellX; cellX += 1) {
        const mapX = cellX + halfPatch
        if (mapX < 0 || mapX >= patchSize) {
          continue
        }
        const drawX = cellX * GRASS_TILE_WORLD_SIZE
        const drawY = cellY * GRASS_TILE_WORLD_SIZE
        context.drawImage(
          grassBaseTexture,
          drawX,
          drawY,
          GRASS_TILE_WORLD_SIZE,
          GRASS_TILE_WORLD_SIZE
        )
      }
    }
  }

  if (grassTransitionsTexture && grassTransitionsTextureLoaded) {
    for (let cellY = startCellY; cellY <= endCellY; cellY += 1) {
      const mapY = cellY + halfPatch
      if (mapY < 0 || mapY >= patchSize) {
        continue
      }
      for (let cellX = startCellX; cellX <= endCellX; cellX += 1) {
        const mapX = cellX + halfPatch
        if (mapX < 0 || mapX >= patchSize) {
          continue
        }

        if (!patchAt(patchCells, patchSize, mapX, mapY)) {
          continue
        }

        const north = patchAt(patchCells, patchSize, mapX, mapY - 1)
        const east = patchAt(patchCells, patchSize, mapX + 1, mapY)
        const south = patchAt(patchCells, patchSize, mapX, mapY + 1)
        const west = patchAt(patchCells, patchSize, mapX - 1, mapY)
        let mask = 0
        if (north) mask |= 1
        if (east) mask |= 2
        if (south) mask |= 4
        if (west) mask |= 8

        if (mask === 0) {
          mask = 15
        }

        const drawX = cellX * GRASS_TILE_WORLD_SIZE
        const drawY = cellY * GRASS_TILE_WORLD_SIZE

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
            GRASS_TILE_WORLD_SIZE,
            GRASS_TILE_WORLD_SIZE
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
          GRASS_TILE_WORLD_SIZE,
          GRASS_TILE_WORLD_SIZE
        )
      }
    }

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
  renderCameraY: number
) => {
  const renderedWithWebGl = renderFlowerInstances({
    context,
    world,
    cameraX: renderCameraX,
    cameraY: renderCameraY
  })
  if (renderedWithWebGl) {
    return
  }

  flushFlowerLayer(world)

  const layer = ensureFlowerLayerCache(world)
  if (!layer.canvas) {
    return
  }

  const mapSize = layer.size
  const halfMap = Math.floor(mapSize * 0.5)
  context.drawImage(layer.canvas, -halfMap, -halfMap, mapSize, mapSize)
}

const pickupGlowColor = (weaponId: WorldState["pickups"][number]["weapon"]) => {
  if (weaponId === "assault") {
    return "255, 208, 112"
  }
  if (weaponId === "shotgun") {
    return "255, 140, 92"
  }
  return "122, 255, 208"
}

const renderPickups = (context: CanvasRenderingContext2D, world: WorldState, dt: number) => {
  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }

    const bobOffset = Math.sin(pickup.bob + dt * 4) * 0.14
    const pulse = 0.35 + (Math.sin(pickup.bob * 1.6) * 0.5 + 0.5) * 0.35
    const glow = pickupGlowColor(pickup.weapon)

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

    drawWeaponPickupSprite(context, pickup.weapon, pickup.position.x, pickup.position.y + bobOffset, 0.1)
  }
}

const renderThrowables = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const throwable of world.throwables) {
    if (!throwable.active) {
      continue
    }

    if (throwable.mode === "grenade") {
      const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
      if (speed > 0.45) {
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
            Math.PI * 2
          )
          context.fill()
        }
      }

      context.fillStyle = "rgba(0, 0, 0, 0.28)"
      context.beginPath()
      context.ellipse(throwable.position.x, throwable.position.y + 0.22, 0.2, 0.11, 0, 0, Math.PI * 2)
      context.fill()
      drawGrenadeSprite(context, throwable.position.x, throwable.position.y, 0.08)
      continue
    }

    context.fillStyle = "rgba(0, 0, 0, 0.24)"
    context.beginPath()
    context.ellipse(throwable.position.x, throwable.position.y + 0.2, 0.18, 0.1, 0, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = "#8f3a2e"
    context.fillRect(throwable.position.x - 0.12, throwable.position.y - 0.12, 0.24, 0.24)
    context.fillStyle = "#f88a3a"
    context.fillRect(throwable.position.x - 0.08, throwable.position.y - 0.08, 0.16, 0.16)
  }
}

const renderMolotovZones = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const zone of world.molotovZones) {
    if (!zone.active) {
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
  const half = Math.floor(grid.size * 0.5)
  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  const minX = Math.max(0, Math.floor(world.camera.x - halfViewX) + half - 2)
  const maxX = Math.min(grid.size - 1, Math.floor(world.camera.x + halfViewX) + half + 2)
  const minY = Math.max(0, Math.floor(world.camera.y - halfViewY) + half - 2)
  const maxY = Math.min(grid.size - 1, Math.floor(world.camera.y + halfViewY) + half + 2)

  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
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
      } else if (material === OBSTACLE_MATERIAL_ROCK) {
        context.fillStyle = "#676a64"
        context.fillRect(tileX, tileY, 1, 1)
        context.fillStyle = "#8f948b"
        context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
        context.fillStyle = "#5d605a"
        context.fillRect(tileX + 0.14, tileY + 0.14, 0.72, 0.08)
      }

      const flash = grid.flash[index]
      if (flash > 0.01) {
        const flicker = 0.42 + Math.sin((1 - flash) * 42) * 0.38
        context.fillStyle = `rgba(255, 96, 96, ${clamp(flash * flicker, 0, 1) * 0.55})`
        context.fillRect(tileX + 0.04, tileY + 0.04, 0.92, 0.92)
      }
    }
  }
}

const renderObstacleDebris = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const debris of world.obstacleDebris) {
    if (!debris.active || debris.maxLife <= 0) {
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

const renderExplosions = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const explosion of world.explosions) {
    if (!explosion.active) {
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
        explosion.radius * 2 * pulse
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
        0.16
      )
    }
  }
}

const renderProjectiles = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const projectile of world.projectiles) {
    if (!projectile.active) {
      continue
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
    const stretch = clamp(speed / 25, 1.1, projectile.kind === "flame" ? 2.2 : 2.9)
    const length = projectile.radius * 2.6 * stretch
    const width = projectile.radius * 1.4
    const glow = projectile.radius * (2.2 + projectile.glow)

    context.fillStyle = "rgba(0, 0, 0, 0.26)"
    context.beginPath()
    context.ellipse(projectile.position.x, projectile.position.y + 0.26, projectile.radius * 0.8, projectile.radius * 0.45, 0, 0, Math.PI * 2)
    context.fill()

    const glowColor = projectile.kind === "flame"
      ? "rgba(255, 148, 72, 0.36)"
      : "rgba(255, 244, 176, 0.34)"
    context.fillStyle = glowColor
    context.beginPath()
    context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
    context.fill()

    context.save()
    context.translate(projectile.position.x, projectile.position.y)
    context.rotate(angle)

    const trailLength = projectile.kind === "flame" ? length * 1.1 : length * 1.65
    for (let index = 0; index < 6; index += 1) {
      const t = index / 5
      const alpha = projectile.kind === "flame"
        ? (1 - t) * 0.2
        : (1 - t) * 0.22
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
        Math.PI * 2
      )
      context.fill()
    }

    context.restore()

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

const renderUnitStatusRings = (
  context: CanvasRenderingContext2D,
  unit: WorldState["units"][number],
  drawX: number,
  drawY: number,
  body: number
) => {
  const isReloading = unit.reloadCooldown > 0 && unit.reloadCooldownMax > 0
  const progress = isReloading
    ? clamp(1 - unit.reloadCooldown / unit.reloadCooldownMax, 0, 1)
    : Number.isFinite(unit.primaryAmmo) && Number.isFinite(unit.magazineSize) && unit.magazineSize > 0
      ? clamp(unit.primaryAmmo / unit.magazineSize, 0, 1)
      : 1
  const radius = body + PRIMARY_RELOAD_RING_OFFSET_WORLD

  context.save()
  context.lineCap = "butt"
  context.beginPath()
  context.arc(drawX, drawY, radius, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * progress)
  context.strokeStyle = isReloading ? PRIMARY_RELOAD_PROGRESS_RING_COLOR : PRIMARY_RELOAD_RING_COLOR
  context.lineWidth = PRIMARY_RELOAD_RING_THICKNESS_WORLD
  context.stroke()

  context.restore()
}

const renderUnits = (context: CanvasRenderingContext2D, world: WorldState) => {
  for (const unit of world.units) {
    const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
    const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
    const body = unit.radius * 1.2
    const ear = unit.radius * 0.42

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
      Math.PI * 2
    )
    context.fill()

    const palette = unit.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : botPalette(unit.id)
    const tone = palette.tone
    const edge = palette.edge
    const earLeftX = drawX - body * 0.7
    const earRightX = drawX + body * 0.7
    const earY = drawY - body * 0.95

    context.fillStyle = edge
    context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
    context.fillStyle = tone
    context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
    context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)

    context.fillStyle = edge
    context.fillRect(drawX - body * 0.85, drawY - body, body * 1.7, body * 2)
    context.fillStyle = tone
    context.fillRect(drawX - body * 0.68, drawY - body * 0.82, body * 1.36, body * 1.64)

    const gunLength = unit.radius * 1.25 + unit.recoil * 0.24
    const gunX = drawX + unit.aim.x * gunLength
    const gunY = drawY + unit.aim.y * gunLength
    context.strokeStyle = unit.isPlayer ? "#f0e6ad" : "#a2d0ff"
    context.lineWidth = 0.24
    context.beginPath()
    context.moveTo(drawX, drawY)
    context.lineTo(gunX, gunY)
    context.stroke()

    if (unit.hitFlash > 0) {
      const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
      context.globalAlpha = clamp(unit.hitFlash * flicker, 0, 1)
      context.fillStyle = unit.isPlayer ? "#ff8a8a" : "#ff5454"
      context.fillRect(drawX - body * 0.75, drawY - body * 0.85, body * 1.5, body * 1.7)
      context.fillRect(earLeftX - body * 0.18, earY - body * 0.25, body * 1.36, body * 0.32)
      context.globalAlpha = 1
    }

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
  renderCameraY: number
) => {
  if (!world.running || world.finished) {
    return
  }

  const margin = 24
  const innerLeft = margin
  const innerTop = margin
  const innerRight = VIEW_WIDTH - margin
  const innerBottom = VIEW_HEIGHT - margin
  const centerX = VIEW_WIDTH * 0.5
  const centerY = VIEW_HEIGHT * 0.5

  context.save()
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "bold 11px monospace"

  for (const enemy of world.bots) {
    const screenX = (enemy.position.x - renderCameraX) * WORLD_SCALE + centerX
    const screenY = (enemy.position.y - renderCameraY) * WORLD_SCALE + centerY
    const isOnScreen = screenX >= innerLeft && screenX <= innerRight && screenY >= innerTop && screenY <= innerBottom
    if (isOnScreen) {
      continue
    }

    const dx = screenX - centerX
    const dy = screenY - centerY
    const angle = Math.atan2(dy, dx)
    const cosine = Math.cos(angle)
    const sine = Math.sin(angle)
    const edgeScaleX = (VIEW_WIDTH * 0.5 - margin) / Math.max(0.001, Math.abs(cosine))
    const edgeScaleY = (VIEW_HEIGHT * 0.5 - margin) / Math.max(0.001, Math.abs(sine))
    const edgeDistance = Math.min(edgeScaleX, edgeScaleY)
    const markerX = centerX + cosine * edgeDistance
    const markerY = centerY + sine * edgeDistance
    const distanceMeters = Math.hypot(enemy.position.x - world.player.position.x, enemy.position.y - world.player.position.y)
    const palette = botPalette(enemy.id)

    context.save()
    context.translate(markerX, markerY)
    context.rotate(angle)

    context.fillStyle = "rgba(0, 0, 0, 0.4)"
    context.beginPath()
    context.moveTo(13, 0)
    context.lineTo(-2, -8)
    context.lineTo(-2, 8)
    context.closePath()
    context.fill()

    context.fillStyle = palette.tone
    context.beginPath()
    context.moveTo(11, 0)
    context.lineTo(-3, -7)
    context.lineTo(-3, 7)
    context.closePath()
    context.fill()

    context.fillStyle = palette.edge
    context.fillRect(-17, -5, 8, 8)
    context.fillStyle = "#eff3ff"
    context.fillRect(-15, -3, 4, 4)

    context.rotate(-angle)
    context.fillStyle = "rgba(8, 16, 10, 0.72)"
    context.fillRect(-7, 9, 30, 14)
    context.fillStyle = "#eaf5e1"
    context.fillText(`${distanceMeters.toFixed(1)}m`, 8, 16)
    context.restore()
  }

  context.restore()
}

const renderDamagePopups = (context: CanvasRenderingContext2D, world: WorldState) => {
  context.textAlign = "center"
  context.font = "0.9px monospace"
  for (const popup of world.damagePopups) {
    if (!popup.active) {
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
    VIEW_WIDTH * 0.75
  )
  gradient.addColorStop(0, "rgba(212, 216, 214, 0)")
  gradient.addColorStop(1, "rgba(64, 69, 67, 0.24)")
  context.fillStyle = gradient
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
}

const renderMenuCard = (context: CanvasRenderingContext2D, world: WorldState) => {
  if (world.started) {
    return
  }

  const centerX = VIEW_WIDTH * 0.5
  const cardTop = VIEW_HEIGHT * 0.5 - 60
  const cardHeight = 120

  context.fillStyle = "rgba(20, 36, 22, 0.56)"
  context.fillRect(centerX - 220, cardTop, 440, cardHeight)
  context.strokeStyle = "#d6eaba"
  context.lineWidth = 2
  context.strokeRect(centerX - 220, cardTop, 440, cardHeight)

  context.textAlign = "center"
  context.fillStyle = "#edf7da"
  context.font = "bold 24px monospace"
  context.fillText("BadaBada", centerX, cardTop + 26)
  context.font = "14px monospace"
  const startHint = world.audioPrimed
    ? "Click or press Enter to start 50m shrinking arena"
    : "Click once to unlock music, then deploy"
  context.fillText(startHint, centerX, cardTop + 56)
}
