import { buildCullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { parseHexColorFloat } from "./flower-instanced-color.ts"
import { ensureQuadCapacity, initFlowerGpuState } from "./flower-instanced-state.ts"
import { QUAD_INSTANCE_STRIDE } from "./flower-instanced-types.ts"

interface RenderObstacleFxInstancesArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  cameraX: number
  cameraY: number
  drawToContext?: boolean
  clearCanvas?: boolean
}

export const renderObstacleFxInstances = (
  { context, world, cameraX, cameraY, drawToContext = true, clearCanvas = true }: RenderObstacleFxInstancesArgs,
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
  for (const debris of world.obstacleDebris) {
    if (!debris.active || debris.maxLife <= 0) {
      continue
    }
    if (
      debris.position.x < cullBounds.minX ||
      debris.position.x > cullBounds.maxX ||
      debris.position.y < cullBounds.minY ||
      debris.position.y > cullBounds.maxY
    ) {
      continue
    }

    ensureQuadCapacity(state, instanceCount + 1)
    const writeIndex = instanceCount * QUAD_INSTANCE_STRIDE
    const lifeRatio = Math.max(0, Math.min(1, debris.life / debris.maxLife))
    const alpha = lifeRatio * lifeRatio
    const size = debris.size * (0.7 + (1 - lifeRatio) * 0.5)
    const [red, green, blue] = parseHexColorFloat(debris.color)

    state.quadInstanceData[writeIndex] = debris.position.x
    state.quadInstanceData[writeIndex + 1] = debris.position.y
    state.quadInstanceData[writeIndex + 2] = size
    state.quadInstanceData[writeIndex + 3] = debris.rotation
    state.quadInstanceData[writeIndex + 4] = red
    state.quadInstanceData[writeIndex + 5] = green
    state.quadInstanceData[writeIndex + 6] = blue
    state.quadInstanceData[writeIndex + 7] = alpha
    state.quadInstanceData[writeIndex + 8] = 0
    instanceCount += 1
  }

  for (const casing of world.shellCasings) {
    if (!casing.active || casing.maxLife <= 0) {
      continue
    }
    if (casing.spriteId) {
      continue
    }
    if (
      casing.position.x < cullBounds.minX ||
      casing.position.x > cullBounds.maxX ||
      casing.position.y < cullBounds.minY ||
      casing.position.y > cullBounds.maxY
    ) {
      continue
    }

    ensureQuadCapacity(state, instanceCount + 1)
    const writeIndex = instanceCount * QUAD_INSTANCE_STRIDE
    const lifeRatio = Math.max(0, Math.min(1, casing.life / casing.maxLife))
    const alpha = lifeRatio * 0.85
    const [red, green, blue] = parseHexColorFloat("#e7c66a")

    state.quadInstanceData[writeIndex] = casing.position.x
    state.quadInstanceData[writeIndex + 1] = casing.position.y
    state.quadInstanceData[writeIndex + 2] = casing.size
    state.quadInstanceData[writeIndex + 3] = casing.rotation
    state.quadInstanceData[writeIndex + 4] = red
    state.quadInstanceData[writeIndex + 5] = green
    state.quadInstanceData[writeIndex + 6] = blue
    state.quadInstanceData[writeIndex + 7] = alpha
    state.quadInstanceData[writeIndex + 8] = 0
    instanceCount += 1
  }

  for (const petal of world.killPetals) {
    if (!petal.active || petal.maxLife <= 0) {
      continue
    }
    if (
      petal.position.x < cullBounds.minX ||
      petal.position.x > cullBounds.maxX ||
      petal.position.y < cullBounds.minY ||
      petal.position.y > cullBounds.maxY
    ) {
      continue
    }

    ensureQuadCapacity(state, instanceCount + 1)
    const writeIndex = instanceCount * QUAD_INSTANCE_STRIDE
    const lifeRatio = Math.max(0, Math.min(1, petal.life / petal.maxLife))
    const ageRatio = 1 - lifeRatio
    const fadeIn = Math.max(0, Math.min(1, ageRatio / 0.14))
    const fadeOut = Math.pow(lifeRatio, 0.9)
    const alpha = fadeIn * fadeOut
    const size = petal.size * (0.84 + ageRatio * 0.42)
    const [red, green, blue] = parseHexColorFloat(petal.color)

    state.quadInstanceData[writeIndex] = petal.position.x
    state.quadInstanceData[writeIndex + 1] = petal.position.y
    state.quadInstanceData[writeIndex + 2] = size
    state.quadInstanceData[writeIndex + 3] = petal.rotation
    state.quadInstanceData[writeIndex + 4] = red
    state.quadInstanceData[writeIndex + 5] = green
    state.quadInstanceData[writeIndex + 6] = blue
    state.quadInstanceData[writeIndex + 7] = alpha
    state.quadInstanceData[writeIndex + 8] = 1
    instanceCount += 1
  }

  gl.viewport(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  if (clearCanvas) {
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  if (instanceCount <= 0) {
    return true
  }

  gl.useProgram(state.quadProgram)
  gl.uniform2f(state.quadUniformCamera, cameraX, cameraY)
  gl.uniform2f(state.quadUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.quadUniformScale, WORLD_SCALE)

  gl.bindVertexArray(state.quadVao)
  gl.bindBuffer(gl.ARRAY_BUFFER, state.quadInstanceBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.quadInstanceData, 0, instanceCount * QUAD_INSTANCE_STRIDE)
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
