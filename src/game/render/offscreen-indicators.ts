import { clamp } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { buildOffscreenIndicatorAnchor, isOffscreenIndicatorAnchorInView } from "./offscreen-indicator-visibility.ts"

export interface CanvasViewportOverflowPx {
  left: number
  top: number
  right: number
  bottom: number
}

interface RenderOffscreenEnemyIndicatorsArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  renderCameraX: number
  renderCameraY: number
  viewportOverflow: CanvasViewportOverflowPx
  paletteForUnit: (world: WorldState, unit: WorldState["units"][number]) => { tone: string; edge: string }
}

type OffscreenMarkerSide = "left" | "right" | "top" | "bottom"

interface OffscreenMarker {
  enemy: WorldState["units"][number]
  x: number
  y: number
  angle: number
  side: OffscreenMarkerSide
  sideAxis: number
  distanceMeters: number
}

const distributeSideMarkers = (
  markers: OffscreenMarker[],
  minAxis: number,
  maxAxis: number,
  spacing: number,
  side: OffscreenMarkerSide,
  sideMinX: number,
  sideMaxX: number,
  sideMinY: number,
  sideMaxY: number,
) => {
  if (markers.length <= 0) {
    return markers
  }

  markers.sort((left, right) => left.sideAxis - right.sideAxis)
  for (const marker of markers) {
    marker.sideAxis = clamp(marker.sideAxis, minAxis, maxAxis)
  }

  const availableRange = Math.max(0, maxAxis - minAxis)
  const requiredRange = spacing * Math.max(0, markers.length - 1)

  if (requiredRange > availableRange && markers.length > 1) {
    const spreadStep = availableRange / (markers.length - 1)
    for (let index = 0; index < markers.length; index += 1) {
      markers[index].sideAxis = minAxis + spreadStep * index
    }
  } else {
    for (let index = 1; index < markers.length; index += 1) {
      markers[index].sideAxis = Math.max(markers[index].sideAxis, markers[index - 1].sideAxis + spacing)
    }

    if (markers[markers.length - 1].sideAxis > maxAxis) {
      markers[markers.length - 1].sideAxis = maxAxis
      for (let index = markers.length - 2; index >= 0; index -= 1) {
        markers[index].sideAxis = Math.min(markers[index].sideAxis, markers[index + 1].sideAxis - spacing)
      }

      if (markers[0].sideAxis < minAxis) {
        markers[0].sideAxis = minAxis
        for (let index = 1; index < markers.length; index += 1) {
          markers[index].sideAxis = Math.max(markers[index].sideAxis, markers[index - 1].sideAxis + spacing)
        }
      }
    }
  }

  for (const marker of markers) {
    if (side === "left" || side === "right") {
      marker.y = clamp(marker.sideAxis, sideMinY, sideMaxY)
    } else {
      marker.x = clamp(marker.sideAxis, sideMinX, sideMaxX)
    }
  }

  return markers
}

export const renderOffscreenEnemyIndicators = ({
  context,
  world,
  renderCameraX,
  renderCameraY,
  viewportOverflow,
  paletteForUnit,
}: RenderOffscreenEnemyIndicatorsArgs) => {
  if (!world.running || world.finished) {
    return
  }

  const margin = 24
  const visibleLeft = clamp(viewportOverflow.left, 0, VIEW_WIDTH - 1)
  const visibleTop = clamp(viewportOverflow.top, 0, VIEW_HEIGHT - 1)
  const visibleRight = clamp(VIEW_WIDTH - viewportOverflow.right, visibleLeft + 1, VIEW_WIDTH)
  const visibleBottom = clamp(VIEW_HEIGHT - viewportOverflow.bottom, visibleTop + 1, VIEW_HEIGHT)
  const innerLeft = clamp(visibleLeft + margin, visibleLeft, visibleRight - 1)
  const innerTop = clamp(visibleTop + margin, visibleTop, visibleBottom - 1)
  const innerRight = clamp(visibleRight - margin, innerLeft + 1, visibleRight)
  const innerBottom = clamp(visibleBottom - margin, innerTop + 1, visibleBottom)
  const centerX = VIEW_WIDTH * 0.5
  const centerY = VIEW_HEIGHT * 0.5
  const markerSpacing = 34
  const cornerPadding = 24
  const sideMinY = Math.min(innerBottom, innerTop + cornerPadding)
  const sideMaxY = Math.max(sideMinY, innerBottom - cornerPadding)
  const sideMinX = Math.min(innerRight, innerLeft + cornerPadding)
  const sideMaxX = Math.max(sideMinX, innerRight - cornerPadding)
  const halfWidthToVisibleEdge = Math.max(1, Math.min(centerX - innerLeft, innerRight - centerX))
  const halfHeightToVisibleEdge = Math.max(1, Math.min(centerY - innerTop, innerBottom - centerY))

  const sideMarkers: Record<OffscreenMarkerSide, OffscreenMarker[]> = {
    left: [],
    right: [],
    top: [],
    bottom: [],
  }

  context.save()
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = "bold 11px monospace"

  for (const enemy of world.units) {
    if (enemy.id === world.player.id) {
      continue
    }

    const anchor = buildOffscreenIndicatorAnchor(enemy)
    const screenX = (anchor.x - renderCameraX) * WORLD_SCALE + centerX
    const screenY = (anchor.y - renderCameraY) * WORLD_SCALE + centerY
    const isOnScreen = isOffscreenIndicatorAnchorInView(anchor, renderCameraX, renderCameraY)
    if (isOnScreen) {
      continue
    }

    const dx = screenX - centerX
    const dy = screenY - centerY
    const angle = Math.atan2(dy, dx)
    const horizontalRatio = Math.abs(dx) / halfWidthToVisibleEdge
    const verticalRatio = Math.abs(dy) / halfHeightToVisibleEdge
    const dominantHorizontal = horizontalRatio >= verticalRatio
    let side: OffscreenMarkerSide = "right"
    let markerX = centerX
    let markerY = centerY

    if (dominantHorizontal) {
      if (dx >= 0) {
        side = "right"
        markerX = innerRight
        markerY = centerY + dy * ((innerRight - centerX) / Math.max(0.001, dx))
      } else {
        side = "left"
        markerX = innerLeft
        markerY = centerY + dy * ((innerLeft - centerX) / Math.min(-0.001, dx))
      }
      markerY = clamp(markerY, innerTop, innerBottom)
    } else {
      if (dy >= 0) {
        side = "bottom"
        markerY = innerBottom
        markerX = centerX + dx * ((innerBottom - centerY) / Math.max(0.001, dy))
      } else {
        side = "top"
        markerY = innerTop
        markerX = centerX + dx * ((innerTop - centerY) / Math.min(-0.001, dy))
      }
      markerX = clamp(markerX, innerLeft, innerRight)
    }

    const distanceMeters = Math.hypot(
      enemy.position.x - world.player.position.x,
      enemy.position.y - world.player.position.y,
    )

    sideMarkers[side].push({
      enemy,
      x: markerX,
      y: markerY,
      angle,
      side,
      sideAxis: side === "left" || side === "right" ? markerY : markerX,
      distanceMeters,
    })
  }

  distributeSideMarkers(
    sideMarkers.left,
    sideMinY,
    sideMaxY,
    markerSpacing,
    "left",
    sideMinX,
    sideMaxX,
    sideMinY,
    sideMaxY,
  )
  distributeSideMarkers(
    sideMarkers.right,
    sideMinY,
    sideMaxY,
    markerSpacing,
    "right",
    sideMinX,
    sideMaxX,
    sideMinY,
    sideMaxY,
  )
  distributeSideMarkers(
    sideMarkers.top,
    sideMinX,
    sideMaxX,
    markerSpacing,
    "top",
    sideMinX,
    sideMaxX,
    sideMinY,
    sideMaxY,
  )
  distributeSideMarkers(
    sideMarkers.bottom,
    sideMinX,
    sideMaxX,
    markerSpacing,
    "bottom",
    sideMinX,
    sideMaxX,
    sideMinY,
    sideMaxY,
  )

  const drawMarker = (marker: OffscreenMarker) => {
    const { enemy, x: markerX, y: markerY, angle, distanceMeters } = marker
    const palette = paletteForUnit(world, enemy)

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

  for (const marker of sideMarkers.left) {
    drawMarker(marker)
  }
  for (const marker of sideMarkers.right) {
    drawMarker(marker)
  }
  for (const marker of sideMarkers.top) {
    drawMarker(marker)
  }
  for (const marker of sideMarkers.bottom) {
    drawMarker(marker)
  }

  context.restore()
}
