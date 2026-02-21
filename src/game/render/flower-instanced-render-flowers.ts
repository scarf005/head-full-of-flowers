import { buildCullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { parseHexColorFloat } from "./flower-instanced-color.ts"
import { ensureCapacity, initFlowerGpuState } from "./flower-instanced-state.ts"
import { FLOWER_INSTANCE_STRIDE } from "./flower-instanced-types.ts"

interface RenderFlowerInstancesArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  cameraX: number
  cameraY: number
}

export const renderFlowerInstances = ({ context, world, cameraX, cameraY }: RenderFlowerInstancesArgs) => {
  const state = initFlowerGpuState()
  if (!state) {
    return false
  }

  const { gl } = state
  if (state.canvas.width !== VIEW_WIDTH || state.canvas.height !== VIEW_HEIGHT) {
    state.canvas.width = VIEW_WIDTH
    state.canvas.height = VIEW_HEIGHT
  }

  const cullBounds = buildCullBounds(cameraX, cameraY, 1.5)

  let instanceCount = 0
  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }
    if (
      flower.position.x < cullBounds.minX ||
      flower.position.x > cullBounds.maxX ||
      flower.position.y < cullBounds.minY ||
      flower.position.y > cullBounds.maxY
    ) {
      continue
    }

    const writeIndex = instanceCount * FLOWER_INSTANCE_STRIDE
    ensureCapacity(state, instanceCount + 1)

    const [petalRed, petalGreen, petalBlue] = parseHexColorFloat(flower.color)
    const centerColor = flower.accent === "#29261f" ? "#6d5e42" : flower.accent
    const [centerRed, centerGreen, centerBlue] = parseHexColorFloat(centerColor)
    const size = flower.size * 0.9
    if (size <= 0.001) {
      continue
    }

    state.instanceData[writeIndex] = flower.position.x
    state.instanceData[writeIndex + 1] = flower.position.y
    state.instanceData[writeIndex + 2] = size
    state.instanceData[writeIndex + 3] = petalRed
    state.instanceData[writeIndex + 4] = petalGreen
    state.instanceData[writeIndex + 5] = petalBlue
    state.instanceData[writeIndex + 6] = centerRed
    state.instanceData[writeIndex + 7] = centerGreen
    state.instanceData[writeIndex + 8] = centerBlue

    instanceCount += 1
  }

  gl.viewport(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  if (instanceCount <= 0) {
    return true
  }

  gl.useProgram(state.program)
  gl.uniform2f(state.uniformCamera, cameraX, cameraY)
  gl.uniform2f(state.uniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.uniformScale, WORLD_SCALE)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, state.petalTexture)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, state.centerTexture)

  gl.bindVertexArray(state.vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instanceBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.instanceData, 0, instanceCount * FLOWER_INSTANCE_STRIDE)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount)
  gl.bindVertexArray(null)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()

  return true
}
