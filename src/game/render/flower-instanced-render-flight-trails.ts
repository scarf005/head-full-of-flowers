import { buildCullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { parseHexColorFloat } from "./flower-instanced-color.ts"
import { ensureTrailCapacity, initFlowerGpuState } from "./flower-instanced-state.ts"
import { TRAIL_INSTANCE_STRIDE } from "./flower-instanced-types.ts"

interface RenderFlightTrailInstancesArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  cameraX: number
  cameraY: number
  drawToContext?: boolean
  clearCanvas?: boolean
  forceComposite?: boolean
}

export const renderFlightTrailInstances = (
  {
    context,
    world,
    cameraX,
    cameraY,
    drawToContext = true,
    clearCanvas = true,
    forceComposite = false,
  }: RenderFlightTrailInstancesArgs,
) => {
  const state = initFlowerGpuState()
  if (!state) {
    return false
  }

  const { gl } = state
  if (state.canvas.width !== VIEW_WIDTH || state.canvas.height !== VIEW_HEIGHT) {
    state.canvas.width = VIEW_WIDTH
    state.canvas.height = VIEW_HEIGHT
  }

  const cullBounds = buildCullBounds(cameraX, cameraY, 2)

  let instanceCount = 0

  for (const trail of world.flightTrails) {
    if (!trail.active || trail.maxLife <= 0) {
      continue
    }
    if (
      trail.position.x < cullBounds.minX ||
      trail.position.x > cullBounds.maxX ||
      trail.position.y < cullBounds.minY ||
      trail.position.y > cullBounds.maxY
    ) {
      continue
    }

    const lifeRatio = Math.max(0, Math.min(1, trail.life / trail.maxLife))
    const alpha = trail.style > 0.5
      ? trail.alpha * (lifeRatio * lifeRatio * (3 - 2 * lifeRatio))
      : trail.alpha * lifeRatio * lifeRatio
    if (alpha <= 0.01) {
      continue
    }

    ensureTrailCapacity(state, instanceCount + 1)
    const writeIndex = instanceCount * TRAIL_INSTANCE_STRIDE
    const [red, green, blue] = parseHexColorFloat(trail.color)
    state.trailInstanceData[writeIndex] = trail.position.x
    state.trailInstanceData[writeIndex + 1] = trail.position.y
    state.trailInstanceData[writeIndex + 2] = trail.direction.x
    state.trailInstanceData[writeIndex + 3] = trail.direction.y
    state.trailInstanceData[writeIndex + 4] = trail.length
    state.trailInstanceData[writeIndex + 5] = trail.width
    state.trailInstanceData[writeIndex + 6] = red
    state.trailInstanceData[writeIndex + 7] = green
    state.trailInstanceData[writeIndex + 8] = blue
    state.trailInstanceData[writeIndex + 9] = alpha
    state.trailInstanceData[writeIndex + 10] = trail.style
    state.trailInstanceData[writeIndex + 11] = trail.growth
    state.trailInstanceData[writeIndex + 12] = trail.turbulence
    state.trailInstanceData[writeIndex + 13] = trail.driftSpeed
    instanceCount += 1
  }

  gl.viewport(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  if (clearCanvas) {
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  if (instanceCount <= 0) {
    if (drawToContext && forceComposite) {
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
      context.restore()
    }
    return true
  }

  gl.useProgram(state.trailProgram)
  gl.uniform2f(state.trailUniformCamera, cameraX, cameraY)
  gl.uniform2f(state.trailUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.trailUniformScale, WORLD_SCALE)

  gl.bindVertexArray(state.trailVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, state.trailInstanceBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.trailInstanceData, 0, instanceCount * TRAIL_INSTANCE_STRIDE)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount)
  gl.bindVertexArray(null)

  if (drawToContext) {
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    context.restore()
  }

  return true
}
