import { clamp } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"

const FLOWER_SPRITE_PIXEL_SIZE = 16
const FLOWER_LAYER_PIXELS_PER_TILE = 12
const FLOWER_LAYER_FLUSH_MIN_ITEMS_PER_FRAME = 64
const FLOWER_LAYER_FLUSH_MAX_ITEMS_PER_FRAME = 360
const FLOWER_LAYER_FLUSH_TARGET_BUDGET_MS = 1.1
const FLOWER_LAYER_FLUSH_TIME_CHECK_INTERVAL = 24

let flowerPetalMask: HTMLImageElement | null = null
let flowerAccentMask: HTMLImageElement | null = null
let flowerPetalMaskLoaded = false
let flowerAccentMaskLoaded = false
const flowerSpriteCache = new Map<string, HTMLCanvasElement>()
let flowerPetalMaskAlpha: Uint8ClampedArray | null = null
let flowerAccentMaskAlpha: Uint8ClampedArray | null = null

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

let flowerLayerLastFlushToken = -1

if (typeof Image !== "undefined") {
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

export const ensureFlowerLayerCache = (world: WorldState) => {
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

export const flushFlowerLayer = (world: WorldState, frameToken?: number) => {
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
