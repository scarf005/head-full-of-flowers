import { buildCullBounds } from "../cull.ts"
import { clamp } from "../utils.ts"
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
import { paletteForUnit } from "./scene-palette.ts"
import {
  drawWorldLayer,
  ensureWebGLFlowerLayer,
  ensureWebGLGroundLayer,
  flushWebGLFlowerLayer,
} from "./webgl-static-layers.ts"

const MINIMAP_SIZE_PX = 164 * 0.8
const MINIMAP_PADDING_PX = 12
const MINIMAP_UNIT_RADIUS_PX = 2.1
const MINIMAP_PLAYER_RADIUS_PX = 2.8

const obstacleColor = (material: number, highTierLoot: boolean) => {
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) return "#8b9188"
  if (material === OBSTACLE_MATERIAL_WALL) return "#b06f57"
  if (material === OBSTACLE_MATERIAL_BOX) return highTierLoot ? "#eef4ff" : "#de7d4f"
  if (material === OBSTACLE_MATERIAL_ROCK) return "#979b94"
  if (material === OBSTACLE_MATERIAL_HEDGE) return "#98bb8b"
  return "#838883"
}

export interface RenderWebGLMinimapArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  renderCameraX: number
  renderCameraY: number
  viewportOverflow: CanvasViewportOverflowPx
}

export const renderWebGLMinimap = ({
  context,
  world,
  renderCameraX,
  renderCameraY,
  viewportOverflow,
}: RenderWebGLMinimapArgs) => {
  const mapSize = world.terrainMap.size
  if (mapSize <= 0) return

  const canvasWidth = context.canvas.width
  const canvasHeight = context.canvas.height
  const maxSize = Math.max(64, Math.min(canvasWidth, canvasHeight) - MINIMAP_PADDING_PX * 2)
  const sizePx = Math.max(1, Math.round(Math.min(MINIMAP_SIZE_PX, maxSize)))
  const left = Math.max(1, canvasWidth - MINIMAP_PADDING_PX - sizePx - viewportOverflow.right)
  const top = Math.max(1, canvasHeight - MINIMAP_PADDING_PX - sizePx - viewportOverflow.bottom)
  const centerX = left + sizePx * 0.5
  const centerY = top + sizePx * 0.5
  const radiusPx = sizePx * 0.5
  const arenaRadius = Math.max(1, world.arenaRadius)
  const scale = radiusPx / arenaRadius
  const toMinimap = (x: number, y: number) => ({ x: centerX + x * scale, y: centerY + y * scale })

  flushWebGLFlowerLayer(context, world)
  const ground = ensureWebGLGroundLayer(context, world)
  const flowers = ensureWebGLFlowerLayer(context, world)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalAlpha = 1

  context.fillStyle = "rgba(17, 22, 17, 0.72)"
  context.beginPath()
  context.arc(centerX, centerY, radiusPx + 2, 0, Math.PI * 2)
  context.fill()

  context.save()
  context.beginPath()
  context.arc(centerX, centerY, radiusPx, 0, Math.PI * 2)
  context.clip()

  context.fillStyle = "#5f6d5d"
  context.fillRect(left, top, sizePx, sizePx)
  drawWorldLayer(
    context,
    ground,
    -arenaRadius,
    -arenaRadius,
    arenaRadius * 2,
    arenaRadius * 2,
    left,
    top,
    sizePx,
    sizePx,
    0.5,
  )
  drawWorldLayer(
    context,
    flowers,
    -arenaRadius,
    -arenaRadius,
    arenaRadius * 2,
    arenaRadius * 2,
    left,
    top,
    sizePx,
    sizePx,
    0.72,
  )

  const grid = world.obstacleGrid
  const cellSizePx = Math.max(1, scale)
  for (let gy = 0; gy < grid.size; gy += 1) {
    for (let gx = 0; gx < grid.size; gx += 1) {
      const index = gy * grid.size + gx
      if (grid.solid[index] <= 0) continue
      const center = obstacleGridToWorldCenter(grid.size, gx, gy)
      const marker = toMinimap(center.x, center.y)
      if (Math.hypot(marker.x - centerX, marker.y - centerY) > radiusPx + cellSizePx) continue
      context.fillStyle = obstacleColor(grid.material[index], grid.highTierLoot[index] > 0)
      context.fillRect(marker.x - cellSizePx * 0.5, marker.y - cellSizePx * 0.5, cellSizePx, cellSizePx)
    }
  }

  const viewBounds = buildCullBounds(renderCameraX, renderCameraY, 0)
  const viewTopLeft = toMinimap(viewBounds.minX, viewBounds.minY)
  const viewBottomRight = toMinimap(viewBounds.maxX, viewBounds.maxY)
  context.strokeStyle = "rgba(255, 246, 188, 0.72)"
  context.lineWidth = 1
  context.strokeRect(
    viewTopLeft.x,
    viewTopLeft.y,
    Math.max(1, viewBottomRight.x - viewTopLeft.x),
    Math.max(1, viewBottomRight.y - viewTopLeft.y),
  )

  drawMinimapDynamics(context, world, centerX, centerY, radiusPx, arenaRadius)

  for (const unit of world.units) {
    const marker = toMinimap(unit.position.x, unit.position.y)
    const dx = marker.x - centerX
    const dy = marker.y - centerY
    if (dx * dx + dy * dy > radiusPx * radiusPx) continue
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
  context.arc(centerX, centerY, radiusPx, 0, Math.PI * 2)
  context.stroke()
  context.restore()
}
