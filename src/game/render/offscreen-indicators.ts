import { clamp } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { buildOffscreenIndicatorAnchor, isOffscreenIndicatorAnchorInView } from "./offscreen-indicator-visibility.ts"

const OFFSCREEN_INDICATOR_LAYER_REFRESH_INTERVAL_MS = 66

let offscreenIndicatorLayerCache: {
  canvas: HTMLCanvasElement | null
  context: CanvasRenderingContext2D | null
  nextRefreshAt: number
  viewportLeft: number
  viewportTop: number
  viewportRight: number
  viewportBottom: number
} = {
  canvas: null,
  context: null,
  nextRefreshAt: 0,
  viewportLeft: 0,
  viewportTop: 0,
  viewportRight: 0,
  viewportBottom: 0,
}

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

  let layerCanvas = offscreenIndicatorLayerCache.canvas
  let layerContext = offscreenIndicatorLayerCache.context
  if (!layerCanvas || !layerContext) {
    layerCanvas = document.createElement("canvas")
    layerContext = layerCanvas.getContext("2d")
  }
  if (!layerCanvas || !layerContext) {
    return
  }
  if (layerCanvas.width !== VIEW_WIDTH || layerCanvas.height !== VIEW_HEIGHT) {
    layerCanvas.width = VIEW_WIDTH
    layerCanvas.height = VIEW_HEIGHT
  }

  const now = typeof performance !== "undefined" ? performance.now() : 0
  const shouldRefreshLayer = now >= offscreenIndicatorLayerCache.nextRefreshAt ||
    Math.abs(offscreenIndicatorLayerCache.viewportLeft - viewportOverflow.left) >= 0.5 ||
    Math.abs(offscreenIndicatorLayerCache.viewportTop - viewportOverflow.top) >= 0.5 ||
    Math.abs(offscreenIndicatorLayerCache.viewportRight - viewportOverflow.right) >= 0.5 ||
    Math.abs(offscreenIndicatorLayerCache.viewportBottom - viewportOverflow.bottom) >= 0.5

  if (shouldRefreshLayer) {
    layerContext.save()
    layerContext.setTransform(1, 0, 0, 1, 0, 0)
    layerContext.clearRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

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

    layerContext.textAlign = "center"
    layerContext.textBaseline = "middle"
    layerContext.font = "bold 11px monospace"

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

      layerContext.save()
      layerContext.translate(markerX, markerY)
      layerContext.rotate(angle)

      layerContext.fillStyle = "rgba(0, 0, 0, 0.4)"
      layerContext.beginPath()
      layerContext.moveTo(13, 0)
      layerContext.lineTo(-2, -8)
      layerContext.lineTo(-2, 8)
      layerContext.closePath()
      layerContext.fill()

      layerContext.fillStyle = palette.tone
      layerContext.beginPath()
      layerContext.moveTo(11, 0)
      layerContext.lineTo(-3, -7)
      layerContext.lineTo(-3, 7)
      layerContext.closePath()
      layerContext.fill()

      layerContext.fillStyle = palette.edge
      layerContext.fillRect(-17, -5, 8, 8)
      layerContext.fillStyle = "#eff3ff"
      layerContext.fillRect(-15, -3, 4, 4)

      layerContext.rotate(-angle)
      layerContext.fillStyle = "rgba(8, 16, 10, 0.72)"
      layerContext.fillRect(-7, 9, 30, 14)
      layerContext.fillStyle = "#eaf5e1"
      layerContext.fillText(`${distanceMeters.toFixed(1)}m`, 8, 16)
      layerContext.restore()
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

    layerContext.restore()
    offscreenIndicatorLayerCache = {
      canvas: layerCanvas,
      context: layerContext,
      nextRefreshAt: now + OFFSCREEN_INDICATOR_LAYER_REFRESH_INTERVAL_MS,
      viewportLeft: viewportOverflow.left,
      viewportTop: viewportOverflow.top,
      viewportRight: viewportOverflow.right,
      viewportBottom: viewportOverflow.bottom,
    }
  }

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(layerCanvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()
}
