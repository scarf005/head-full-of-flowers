import { buildCullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { initFlowerGpuState } from "./flower-instanced-state.ts"
import { GPU_EXPLOSION_INSTANCES, MAX_GPU_EXPLOSIONS } from "./flower-instanced-types.ts"

interface RenderExplosionInstancesArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  cameraX: number
  cameraY: number
  drawToContext?: boolean
  clearCanvas?: boolean
}

export const renderExplosionInstances = (
  { context, world, cameraX, cameraY, drawToContext = true, clearCanvas = true }: RenderExplosionInstancesArgs,
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

  const cullBounds = buildCullBounds(cameraX, cameraY, 2.2)
  let explosionCount = 0

  for (const explosion of world.explosions) {
    if (!explosion.active || explosion.radius <= 0.01) {
      continue
    }
    if (
      explosion.position.x < cullBounds.minX - explosion.radius - 1 ||
      explosion.position.x > cullBounds.maxX + explosion.radius + 1 ||
      explosion.position.y < cullBounds.minY - explosion.radius - 1 ||
      explosion.position.y > cullBounds.maxY + explosion.radius + 1
    ) {
      continue
    }
    if (explosionCount >= MAX_GPU_EXPLOSIONS) {
      break
    }

    const writeIndex = explosionCount * 4
    state.explosionUniformData[writeIndex] = explosion.position.x
    state.explosionUniformData[writeIndex + 1] = explosion.position.y
    state.explosionUniformData[writeIndex + 2] = explosion.radius
    state.explosionUniformData[writeIndex + 3] = Math.max(0, Math.min(1, explosion.life / 0.24))
    explosionCount += 1
  }

  gl.viewport(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  if (clearCanvas) {
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  if (explosionCount <= 0) {
    return true
  }

  gl.useProgram(state.explosionProgram)
  gl.uniform2f(state.explosionUniformCamera, cameraX, cameraY)
  gl.uniform2f(state.explosionUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.explosionUniformScale, WORLD_SCALE)
  gl.uniform1i(state.explosionUniformCount, explosionCount)
  gl.uniform4fv(state.explosionUniformExplosions, state.explosionUniformData)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE)

  gl.bindVertexArray(state.explosionVao)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, explosionCount * GPU_EXPLOSION_INSTANCES)
  gl.bindVertexArray(null)

  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  if (drawToContext) {
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    context.restore()
  }

  return true
}
