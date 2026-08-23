import { clamp } from "../utils.ts"
import { buildCullBounds } from "../cull.ts"
import {
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_HEDGE,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridToWorldCenter,
} from "../world/obstacle-grid.ts"
import type { WorldState } from "../world/state.ts"
import type { CanvasViewportOverflowPx } from "./offscreen-indicators.ts"
import { drawMinimapDynamics } from "./scene-minimap-dynamics.ts"

const MINIMAP_SIZE_PX = 164 * 0.8
const MINIMAP_PADDING_PX = 12
const MINIMAP_UNIT_RADIUS_PX = 2.1
const MINIMAP_PLAYER_RADIUS_PX = 2.8
const MINIMAP_COMPOSITE_REFRESH_INTERVAL_MS = 160
const MINIMAP_COMPOSITE_PADDING_PX = 2
const MINIMAP_ARENA_REFRESH_DELTA = 0.35

let minimapObstacleLayerCache: {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  gridRef: WorldState["obstacleGrid"] | null
  gridSize: number
  pixelSize: number
  arenaRadius: number
  revision: number
} = {
  canvas: null,
  context: null,
  gridRef: null,
  gridSize: 0,
  pixelSize: 0,
  arenaRadius: 0,
  revision: -1,
}

let minimapCompositeLayerCache: {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  mapSize: number
  pixelSize: number
  arenaRadius: number
  flowerRevision: number
  obstacleRevision: number
  nextRefreshAt: number
} = {
  canvas: null,
  context: null,
  mapSize: 0,
  pixelSize: 0,
  arenaRadius: 0,
  flowerRevision: -1,
  obstacleRevision: -1,
  nextRefreshAt: 0,
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

  const pixelSize = Math.max(1, Math.round(sizePx))
  const shouldRefresh = !minimapObstacleLayerCache.canvas ||
    !minimapObstacleLayerCache.context ||
    minimapObstacleLayerCache.gridRef !== obstacleGrid ||
    minimapObstacleLayerCache.gridSize !== obstacleGrid.size ||
    minimapObstacleLayerCache.pixelSize !== pixelSize ||
    Math.abs(minimapObstacleLayerCache.arenaRadius - arenaRadiusWorld) >= MINIMAP_ARENA_REFRESH_DELTA ||
    minimapObstacleLayerCache.revision !== obstacleGrid.revision

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
    revision: obstacleGrid.revision,
  }

  return canvas
}

interface GroundLayerSnapshot {
  canvas: HTMLCanvasElement | null
  size: number
}

interface FlowerLayerSnapshot {
  canvas: HTMLCanvasElement | null
}

interface UnitPalette {
  tone: string
}

export interface RenderMinimapDeps {
  flushFlowerLayer: (world: WorldState, frameToken?: number) => void
  ensureGroundLayerCache: (world: WorldState) => GroundLayerSnapshot
  ensureFlowerLayerCache: (world: WorldState) => FlowerLayerSnapshot
  paletteForUnit: (world: WorldState, unit: WorldState["units"][number]) => UnitPalette
}

export interface RenderMinimapArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  renderCameraX: number
  renderCameraY: number
  viewportOverflow: CanvasViewportOverflowPx
  frameToken: number
  deps: RenderMinimapDeps
}

export const renderMinimap = ({
  context,
  world,
  renderCameraX,
  renderCameraY,
  viewportOverflow,
  frameToken,
  deps,
}: RenderMinimapArgs) => {
  const mapSize = world.terrainMap.size
  if (mapSize <= 0) {
    return
  }

  const canvasWidth = context.canvas.width
  const canvasHeight = context.canvas.height
  const maxSizeByViewport = Math.max(64, Math.min(canvasWidth, canvasHeight) - MINIMAP_PADDING_PX * 2)
  const sizePx = Math.max(1, Math.round(Math.min(MINIMAP_SIZE_PX, maxSizeByViewport)))

  const left = Math.max(1, canvasWidth - MINIMAP_PADDING_PX - sizePx - viewportOverflow.right)
  const top = Math.max(1, canvasHeight - MINIMAP_PADDING_PX - sizePx - viewportOverflow.bottom)
  const centerX = left + sizePx * 0.5
  const centerY = top + sizePx * 0.5
  const minimapRadiusPx = sizePx * 0.5
  const arenaRadiusWorld = Math.max(1, world.arenaRadius)
  const now = typeof performance !== "undefined" ? performance.now() : 0

  const toMinimap = (worldX: number, worldY: number) => ({
    x: centerX + (worldX / arenaRadiusWorld) * minimapRadiusPx,
    y: centerY + (worldY / arenaRadiusWorld) * minimapRadiusPx,
  })

  const cacheMissing = !minimapCompositeLayerCache.canvas || !minimapCompositeLayerCache.context
  const layoutChanged = minimapCompositeLayerCache.mapSize !== mapSize ||
    minimapCompositeLayerCache.pixelSize !== sizePx
  const arenaChanged =
    Math.abs(minimapCompositeLayerCache.arenaRadius - arenaRadiusWorld) >= MINIMAP_ARENA_REFRESH_DELTA
  const flowerLayerDirty = minimapCompositeLayerCache.flowerRevision !== world.flowerRenderRevision ||
    world.flowerDirtyCount > 0
  const obstacleLayerDirty = minimapCompositeLayerCache.obstacleRevision !== world.obstacleGrid.revision
  const staticLayerDirty = arenaChanged || flowerLayerDirty || obstacleLayerDirty
  const shouldRefreshComposite = cacheMissing || layoutChanged ||
    (staticLayerDirty && now >= minimapCompositeLayerCache.nextRefreshAt)

  if (shouldRefreshComposite) {
    let compositeCanvas = minimapCompositeLayerCache.canvas
    let compositeContext = minimapCompositeLayerCache.context
    if (!compositeCanvas || !compositeContext) {
      compositeCanvas = document.createElement("canvas")
      compositeContext = compositeCanvas.getContext("2d")
    }
    if (!compositeCanvas || !compositeContext) {
      return
    }

    const compositeSize = sizePx + MINIMAP_COMPOSITE_PADDING_PX * 2
    if (compositeCanvas.width !== compositeSize || compositeCanvas.height !== compositeSize) {
      compositeCanvas.width = compositeSize
      compositeCanvas.height = compositeSize
    }

    const localLeft = MINIMAP_COMPOSITE_PADDING_PX
    const localTop = MINIMAP_COMPOSITE_PADDING_PX
    const compositeCenterX = localLeft + sizePx * 0.5
    const compositeCenterY = localTop + sizePx * 0.5
    const halfMap = mapSize * 0.5

    const layerSlice = (layerCanvas: HTMLCanvasElement) => {
      const normalizedSpan = (arenaRadiusWorld * 2) / mapSize
      const normalizedMin = (-arenaRadiusWorld + halfMap) / mapSize
      const srcX = clamp(normalizedMin * layerCanvas.width, 0, layerCanvas.width - 1)
      const srcY = clamp(normalizedMin * layerCanvas.height, 0, layerCanvas.height - 1)
      const srcW = clamp(normalizedSpan * layerCanvas.width, 1, layerCanvas.width - srcX)
      const srcH = clamp(normalizedSpan * layerCanvas.height, 1, layerCanvas.height - srcY)
      return { srcX, srcY, srcW, srcH }
    }

    deps.flushFlowerLayer(world, frameToken)
    const groundLayer = deps.ensureGroundLayerCache(world)
    const flowerLayer = deps.ensureFlowerLayerCache(world)

    compositeContext.save()
    compositeContext.setTransform(1, 0, 0, 1, 0, 0)
    compositeContext.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height)
    compositeContext.imageSmoothingEnabled = false
    compositeContext.globalAlpha = 0.5

    compositeContext.fillStyle = "#111611"
    compositeContext.beginPath()
    compositeContext.arc(compositeCenterX, compositeCenterY, minimapRadiusPx + 2, 0, Math.PI * 2)
    compositeContext.fill()

    compositeContext.save()
    compositeContext.beginPath()
    compositeContext.arc(compositeCenterX, compositeCenterY, minimapRadiusPx, 0, Math.PI * 2)
    compositeContext.clip()

    compositeContext.fillStyle = "#5f6d5d"
    compositeContext.fillRect(localLeft, localTop, sizePx, sizePx)

    if (groundLayer.canvas) {
      const slice = layerSlice(groundLayer.canvas)
      compositeContext.drawImage(
        groundLayer.canvas,
        slice.srcX,
        slice.srcY,
        slice.srcW,
        slice.srcH,
        localLeft,
        localTop,
        sizePx,
        sizePx,
      )
    }

    if (flowerLayer.canvas) {
      const slice = layerSlice(flowerLayer.canvas)
      compositeContext.drawImage(
        flowerLayer.canvas,
        slice.srcX,
        slice.srcY,
        slice.srcW,
        slice.srcH,
        localLeft,
        localTop,
        sizePx,
        sizePx,
      )
    }

    const obstacleLayer = ensureMinimapObstacleLayer(world, sizePx, arenaRadiusWorld)
    if (obstacleLayer) {
      compositeContext.drawImage(obstacleLayer, localLeft, localTop, sizePx, sizePx)
    }

    compositeContext.restore()

    compositeContext.strokeStyle = "rgba(233, 238, 231, 0.82)"
    compositeContext.lineWidth = 1.5
    compositeContext.beginPath()
    compositeContext.arc(compositeCenterX, compositeCenterY, minimapRadiusPx, 0, Math.PI * 2)
    compositeContext.stroke()
    compositeContext.restore()

    minimapCompositeLayerCache = {
      canvas: compositeCanvas,
      context: compositeContext,
      mapSize,
      pixelSize: sizePx,
      arenaRadius: arenaRadiusWorld,
      flowerRevision: world.flowerRenderRevision,
      obstacleRevision: world.obstacleGrid.revision,
      nextRefreshAt: now + MINIMAP_COMPOSITE_REFRESH_INTERVAL_MS,
    }
  }

  if (!minimapCompositeLayerCache.canvas) {
    return
  }

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.imageSmoothingEnabled = false
  context.drawImage(
    minimapCompositeLayerCache.canvas,
    left - MINIMAP_COMPOSITE_PADDING_PX,
    top - MINIMAP_COMPOSITE_PADDING_PX,
  )

  context.beginPath()
  context.arc(centerX, centerY, minimapRadiusPx, 0, Math.PI * 2)
  context.clip()

  const viewBounds = buildCullBounds(renderCameraX, renderCameraY, 0)
  const viewTopLeft = toMinimap(viewBounds.minX, viewBounds.minY)
  const viewBottomRight = toMinimap(viewBounds.maxX, viewBounds.maxY)
  const viewWidth = Math.max(1, viewBottomRight.x - viewTopLeft.x)
  const viewHeight = Math.max(1, viewBottomRight.y - viewTopLeft.y)
  context.strokeStyle = "rgba(255, 246, 188, 0.72)"
  context.lineWidth = 1
  context.strokeRect(viewTopLeft.x, viewTopLeft.y, viewWidth, viewHeight)

  drawMinimapDynamics(context, world, centerX, centerY, minimapRadiusPx, arenaRadiusWorld)

  for (const unit of world.units) {
    const marker = toMinimap(unit.position.x, unit.position.y)
    if (marker.x < left || marker.x > left + sizePx || marker.y < top || marker.y > top + sizePx) {
      continue
    }

    const palette = deps.paletteForUnit(world, unit)
    context.fillStyle = unit.isPlayer ? "#fff7bf" : palette.tone
    context.strokeStyle = "rgba(0, 0, 0, 0.75)"
    context.lineWidth = 1
    context.beginPath()
    context.arc(
      marker.x,
      marker.y,
      unit.isPlayer ? MINIMAP_PLAYER_RADIUS_PX : MINIMAP_UNIT_RADIUS_PX,
      0,
      Math.PI * 2,
    )
    context.fill()
    context.stroke()
  }

  context.restore()
}
