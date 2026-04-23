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
  const gridSize = world.terrainMap.size
  const halfGrid = Math.floor(gridSize * 0.5)
  const minGridX = Math.max(0, Math.floor(cullBounds.minX) + halfGrid - 1)
  const maxGridX = Math.min(gridSize - 1, Math.floor(cullBounds.maxX) + halfGrid + 1)
  const minGridY = Math.max(0, Math.floor(cullBounds.minY) + halfGrid - 1)
  const maxGridY = Math.min(gridSize - 1, Math.floor(cullBounds.maxY) + halfGrid + 1)

  const needsBufferUpload = state.flowerBufferDirty ||
    state.flowerCacheMinGridX !== minGridX ||
    state.flowerCacheMaxGridX !== maxGridX ||
    state.flowerCacheMinGridY !== minGridY ||
    state.flowerCacheMaxGridY !== maxGridY ||
    world.flowerBloomingIndices.size > 0 ||
    world.flowerDirtyIndices.size > 0

  let instanceCount = state.flowerInstanceCount
  if (needsBufferUpload) {
    instanceCount = 0
    for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
      for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
        let flowerIndex = world.flowerCellHead[gridY * gridSize + gridX]
        while (flowerIndex >= 0 && flowerIndex < world.flowers.length) {
          const flower = world.flowers[flowerIndex]
          const nextInCell = flower.nextInCell
          if (
            flower.active &&
            flower.position.x >= cullBounds.minX &&
            flower.position.x <= cullBounds.maxX &&
            flower.position.y >= cullBounds.minY &&
            flower.position.y <= cullBounds.maxY
          ) {
            const size = flower.size * 0.9
            if (size > 0.001) {
              const writeIndex = instanceCount * FLOWER_INSTANCE_STRIDE
              ensureCapacity(state, instanceCount + 1)

              const [petalRed, petalGreen, petalBlue] = parseHexColorFloat(flower.color)
              const centerColor = flower.accent === "#29261f" ? "#6d5e42" : flower.accent
              const [centerRed, centerGreen, centerBlue] = parseHexColorFloat(centerColor)

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
          }
          flowerIndex = nextInCell
        }
      }
    }

    state.flowerInstanceCount = instanceCount
    state.flowerCacheMinGridX = minGridX
    state.flowerCacheMaxGridX = maxGridX
    state.flowerCacheMinGridY = minGridY
    state.flowerCacheMaxGridY = maxGridY
    state.flowerBufferDirty = false
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
  if (needsBufferUpload) {
    gl.bindBuffer(gl.ARRAY_BUFFER, state.instanceBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.instanceData, 0, instanceCount * FLOWER_INSTANCE_STRIDE)
  }
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount)
  gl.bindVertexArray(null)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()

  return true
}
