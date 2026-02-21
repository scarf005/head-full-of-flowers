import {
  renderExplosionInstances,
  renderFlightTrailInstances,
  renderFlowerInstances,
  renderObstacleFxInstances,
} from "./flower-instanced.ts"
import { decideRenderFxCompositionPlan, recordRenderPathProfileFrame } from "./composition-plan.ts"
import { type CanvasViewportOverflowPx } from "./offscreen-indicators.ts"
import { renderMinimap } from "./scene-minimap.ts"
import {
  ensureGroundLayerCache,
  GRASS_BASE_COLOR,
  hasGrassTransitionsTextureLoaded,
} from "./scene-ground-layer-cache.ts"
import { ensureFlowerLayerCache, flushFlowerLayer } from "./scene-flower-layer-cache.ts"
import { paletteForUnit } from "./scene-palette.ts"
import { renderMolotovZones, renderObstacles, renderPickups, renderThrowables } from "./scene-render-world.ts"
import {
  renderExplosions,
  renderMuzzleFlashes,
  renderObstacleDebris,
  renderProjectiles,
  renderShellCasings,
} from "./scene-render-combat-fx.ts"
import {
  renderAimLasers,
  renderAtmosphere,
  renderDamagePopups,
  renderDamageVignette,
  renderOffscreenEnemyIndicators,
  renderRagdolls,
  renderUnits,
} from "./scene-render-units-ui.ts"
import { hasVisiblePickupsInCullBounds } from "./pickup-visibility.ts"
import { clamp } from "../utils.ts"
import { buildCullBounds, type CullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

export interface RenderSceneArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  dt: number
}

type FogCullBounds = CullBounds

let grassWaveTime = Math.random() * Math.PI * 2
const VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS = 180

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

let renderFrameToken = 0

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
  renderAimLasers(context, world, fogCullBounds, grassWaveTime)
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
  renderMinimap({
    context,
    world,
    renderCameraX,
    renderCameraY,
    viewportOverflow,
    frameToken: renderFrameToken,
    deps: {
      flushFlowerLayer,
      ensureGroundLayerCache,
      ensureFlowerLayerCache,
      paletteForUnit,
    },
  })
  renderOffscreenEnemyIndicators(context, world, renderCameraX, renderCameraY, viewportOverflow)
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

  if (hasGrassTransitionsTextureLoaded()) {
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
