import { type CanvasViewportOverflowPx } from "./offscreen-indicators.ts"
import { renderWebGLMinimap } from "./scene-minimap-webgl.ts"
import {
  drawWorldLayer,
  ensureWebGLGroundLayer,
  flushWebGLFlowerLayer,
  GRASS_BASE_COLOR,
  hasGrassTransitionsTextureLoaded,
  renderWebGLBloomingFlowers,
} from "./webgl-static-layers.ts"
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
} from "./scene-render-units-webgl.ts"
import { beginWebGLFrame, endWebGLFrame } from "./webgl2-canvas-context.ts"
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
} = { canvas: null, nextSampleAt: 0, value: EMPTY_VIEWPORT_OVERFLOW }

const measureCanvasViewportOverflowPx = (context: CanvasRenderingContext2D): CanvasViewportOverflowPx => {
  if (typeof globalThis.innerWidth !== "number" || typeof globalThis.innerHeight !== "number") {
    return EMPTY_VIEWPORT_OVERFLOW
  }
  const now = typeof performance !== "undefined" ? performance.now() : 0
  if (viewportOverflowCache.canvas === context.canvas && now < viewportOverflowCache.nextSampleAt) {
    return viewportOverflowCache.value
  }
  const rect = context.canvas.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return EMPTY_VIEWPORT_OVERFLOW
  const scaleX = context.canvas.width / rect.width
  const scaleY = context.canvas.height / rect.height
  const value = {
    left: Math.max(0, -rect.left) * scaleX,
    top: Math.max(0, -rect.top) * scaleY,
    right: Math.max(0, rect.right - globalThis.innerWidth) * scaleX,
    bottom: Math.max(0, rect.bottom - globalThis.innerHeight) * scaleY,
  }
  viewportOverflowCache = { canvas: context.canvas, nextSampleAt: now + VIEWPORT_OVERFLOW_SAMPLE_INTERVAL_MS, value }
  return value
}

export const renderScene = ({ context, world, dt }: RenderSceneArgs) => {
  beginWebGLFrame(context)
  grassWaveTime += dt * 0.18

  context.save()
  context.imageSmoothingEnabled = false
  context.fillStyle = "#889684"
  context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  const viewportOverflow = measureCanvasViewportOverflowPx(context)
  const renderCameraX = world.camera.x + world.cameraOffset.x
  const renderCameraY = world.camera.y + world.cameraOffset.y
  const fogCullBounds = buildCullBounds(renderCameraX, renderCameraY, 2.25)

  renderArenaGround(context, world, grassWaveTime, renderCameraX, renderCameraY)

  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-renderCameraX, -renderCameraY)

  context.save()
  context.beginPath()
  context.arc(0, 0, Math.max(0.1, world.arenaRadius - 0.05), 0, Math.PI * 2)
  context.clip()

  renderMolotovZones(context, world, fogCullBounds)
  renderFlowers(context, world, fogCullBounds)
  renderObstacles(context, world)
  renderObstacleDebris(context, world, fogCullBounds)
  renderShellCasings(context, world, fogCullBounds, "only-plain")
  renderPickups(context, world, dt, fogCullBounds)
  renderThrowables(context, world, true, fogCullBounds)
  renderProjectiles(context, world, true, fogCullBounds)
  renderRagdolls(context, world, fogCullBounds)
  renderAimLasers(context, world, fogCullBounds, grassWaveTime)
  renderUnits(context, world, fogCullBounds)
  renderExplosions(context, world, fogCullBounds)
  renderDamagePopups(context, world, fogCullBounds)
  renderMuzzleFlashes(context, world, fogCullBounds)
  renderShellCasings(context, world, fogCullBounds, "only-sprite")

  context.restore()
  renderArenaBoundary(context, world)
  context.restore()

  renderAtmosphere(context)
  renderDamageVignette(context, world)
  renderWebGLMinimap({ context, world, renderCameraX, renderCameraY, viewportOverflow })
  renderOffscreenEnemyIndicators(context, world, renderCameraX, renderCameraY, viewportOverflow)
  endWebGLFrame(context)
}

const renderArenaGround = (
  context: CanvasRenderingContext2D,
  world: WorldState,
  waveTime: number,
  cameraX: number,
  cameraY: number,
) => {
  context.save()
  context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
  context.scale(WORLD_SCALE, WORLD_SCALE)
  context.translate(-cameraX, -cameraY)

  context.fillStyle = "#a3c784"
  context.beginPath()
  context.arc(0, 0, world.arenaRadius, 0, Math.PI * 2)
  context.fill()

  context.save()
  context.beginPath()
  context.arc(0, 0, Math.max(0.1, world.arenaRadius - 0.12), 0, Math.PI * 2)
  context.clip()

  const cull = buildCullBounds(cameraX, cameraY, 3)
  const ground = ensureWebGLGroundLayer(context, world)
  if (ground.target) {
    const halfMap = ground.size * 0.5
    const minX = Math.max(-halfMap, cull.minX)
    const maxX = Math.min(halfMap, cull.maxX)
    const minY = Math.max(-halfMap, cull.minY)
    const maxY = Math.min(halfMap, cull.maxY)
    drawWorldLayer(context, ground, minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  } else {
    context.fillStyle = GRASS_BASE_COLOR
    context.fillRect(cull.minX, cull.minY, cull.maxX - cull.minX, cull.maxY - cull.minY)
  }

  if (hasGrassTransitionsTextureLoaded()) {
    context.globalAlpha = 0.08
    const stripeHeight = 2.4
    for (let y = cull.minY - stripeHeight; y < cull.maxY + stripeHeight; y += stripeHeight) {
      const alpha = clamp((Math.sin(y * 0.34 + waveTime * 0.7) * 0.5 + 0.5) * 0.16, 0.03, 0.16)
      context.fillStyle = `rgba(81, 99, 75, ${alpha})`
      context.fillRect(cull.minX - 1, y, cull.maxX - cull.minX + 2, stripeHeight)
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

const renderFlowers = (context: CanvasRenderingContext2D, world: WorldState, cull: FogCullBounds) => {
  const layer = flushWebGLFlowerLayer(context, world)
  if (layer.target) {
    const halfMap = layer.size * 0.5
    const minX = Math.max(-halfMap, cull.minX)
    const maxX = Math.min(halfMap, cull.maxX)
    const minY = Math.max(-halfMap, cull.minY)
    const maxY = Math.min(halfMap, cull.maxY)
    drawWorldLayer(context, layer, minX, minY, Math.max(0, maxX - minX), Math.max(0, maxY - minY))
  }
  renderWebGLBloomingFlowers(context, world, cull)
}
