import { buildCullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { ensureCapacity, ensureGpuViewport, initFlowerGpuState } from "./flower-instanced-state.ts"
import { FLOWER_INSTANCE_STRIDE } from "./flower-instanced-types.ts"

interface RenderFlowerInstancesArgs {
  context: CanvasRenderingContext2D
  world: WorldState
  cameraX: number
  cameraY: number
}

let cachedFlowerWorld: WorldState | null = null
let cachedFlowerRevision = -1
let flowerInstanceIndexBySlot = new Int32Array(0)
let flowerSlotByInstanceIndex = new Int32Array(0)
const previousBloomingFlowerIndices = new Set<number>()

const ensureIndexStorage = (world: WorldState, capacity: number) => {
  if (flowerInstanceIndexBySlot.length !== world.flowers.length) {
    flowerInstanceIndexBySlot = new Int32Array(world.flowers.length)
    flowerInstanceIndexBySlot.fill(-1)
  }

  if (flowerSlotByInstanceIndex.length >= capacity) {
    return
  }

  let nextCapacity = Math.max(512, flowerSlotByInstanceIndex.length || 0)
  while (nextCapacity < capacity) {
    nextCapacity *= 2
  }
  const next = new Int32Array(nextCapacity)
  next.fill(-1)
  next.set(flowerSlotByInstanceIndex)
  flowerSlotByInstanceIndex = next
}

const flowerIsVisible = (
  flower: WorldState["flowers"][number],
  cullBounds: ReturnType<typeof buildCullBounds>,
) =>
  flower.active &&
  flower.size * 0.9 > 0.001 &&
  flower.position.x >= cullBounds.minX &&
  flower.position.x <= cullBounds.maxX &&
  flower.position.y >= cullBounds.minY &&
  flower.position.y <= cullBounds.maxY

const writeFlowerInstance = (
  state: NonNullable<ReturnType<typeof initFlowerGpuState>>,
  instanceIndex: number,
  flower: WorldState["flowers"][number],
) => {
  const writeIndex = instanceIndex * FLOWER_INSTANCE_STRIDE
  state.instanceData[writeIndex] = flower.position.x
  state.instanceData[writeIndex + 1] = flower.position.y
  state.instanceData[writeIndex + 2] = flower.size * 0.9
  state.instanceData[writeIndex + 3] = flower.petalRed
  state.instanceData[writeIndex + 4] = flower.petalGreen
  state.instanceData[writeIndex + 5] = flower.petalBlue
  state.instanceData[writeIndex + 6] = flower.centerRed
  state.instanceData[writeIndex + 7] = flower.centerGreen
  state.instanceData[writeIndex + 8] = flower.centerBlue
}

const uploadFlowerInstance = (
  state: NonNullable<ReturnType<typeof initFlowerGpuState>>,
  instanceIndex: number,
) => {
  state.gl.bufferSubData(
    state.gl.ARRAY_BUFFER,
    instanceIndex * FLOWER_INSTANCE_STRIDE * Float32Array.BYTES_PER_ELEMENT,
    state.instanceData,
    instanceIndex * FLOWER_INSTANCE_STRIDE,
    FLOWER_INSTANCE_STRIDE,
  )
}

const removeFlowerInstance = (
  state: NonNullable<ReturnType<typeof initFlowerGpuState>>,
  flowerSlot: number,
  instanceIndex: number,
) => {
  const lastIndex = state.flowerInstanceCount - 1
  if (instanceIndex < 0 || lastIndex < 0 || instanceIndex > lastIndex) {
    flowerInstanceIndexBySlot[flowerSlot] = -1
    return
  }

  if (instanceIndex !== lastIndex) {
    const lastOffset = lastIndex * FLOWER_INSTANCE_STRIDE
    const writeOffset = instanceIndex * FLOWER_INSTANCE_STRIDE
    state.instanceData.copyWithin(writeOffset, lastOffset, lastOffset + FLOWER_INSTANCE_STRIDE)

    const movedFlowerSlot = flowerSlotByInstanceIndex[lastIndex]
    flowerSlotByInstanceIndex[instanceIndex] = movedFlowerSlot
    if (movedFlowerSlot >= 0 && movedFlowerSlot < flowerInstanceIndexBySlot.length) {
      flowerInstanceIndexBySlot[movedFlowerSlot] = instanceIndex
    }
    uploadFlowerInstance(state, instanceIndex)
  }

  flowerSlotByInstanceIndex[lastIndex] = -1
  flowerInstanceIndexBySlot[flowerSlot] = -1
  state.flowerInstanceCount = lastIndex
}

const syncFlowerInstance = (
  state: NonNullable<ReturnType<typeof initFlowerGpuState>>,
  world: WorldState,
  flowerSlot: number,
  cullBounds: ReturnType<typeof buildCullBounds>,
) => {
  if (flowerSlot < 0 || flowerSlot >= world.flowers.length) {
    return
  }

  const flower = world.flowers[flowerSlot]
  const existingIndex = flowerInstanceIndexBySlot[flowerSlot] ?? -1
  if (!flowerIsVisible(flower, cullBounds)) {
    if (existingIndex >= 0) {
      removeFlowerInstance(state, flowerSlot, existingIndex)
    }
    return
  }

  if (existingIndex >= 0) {
    writeFlowerInstance(state, existingIndex, flower)
    uploadFlowerInstance(state, existingIndex)
    return
  }

  const instanceIndex = state.flowerInstanceCount
  ensureCapacity(state, instanceIndex + 1)
  ensureIndexStorage(world, state.capacity)
  writeFlowerInstance(state, instanceIndex, flower)
  flowerInstanceIndexBySlot[flowerSlot] = instanceIndex
  flowerSlotByInstanceIndex[instanceIndex] = flowerSlot
  state.flowerInstanceCount += 1
  uploadFlowerInstance(state, instanceIndex)
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

  const cacheBoundsChanged = state.flowerCacheMinGridX !== minGridX ||
    state.flowerCacheMaxGridX !== maxGridX ||
    state.flowerCacheMinGridY !== minGridY ||
    state.flowerCacheMaxGridY !== maxGridY
  const flowerRevisionChanged = cachedFlowerRevision !== world.flowerRenderRevision
  const revisionNeedsFullRebuild = flowerRevisionChanged && world.flowerDirtyIndices.size === 0
  const needsFullRebuild = state.flowerBufferDirty || cachedFlowerWorld !== world || cacheBoundsChanged ||
    revisionNeedsFullRebuild

  ensureIndexStorage(world, state.capacity)
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instanceBuffer)

  if (needsFullRebuild) {
    flowerInstanceIndexBySlot.fill(-1)
    flowerSlotByInstanceIndex.fill(-1)
    state.flowerInstanceCount = 0

    for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
      for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
        let flowerIndex = world.flowerCellHead[gridY * gridSize + gridX]
        while (flowerIndex >= 0 && flowerIndex < world.flowers.length) {
          const flower = world.flowers[flowerIndex]
          const nextInCell = flower.nextInCell
          if (flowerIsVisible(flower, cullBounds)) {
            const instanceIndex = state.flowerInstanceCount
            ensureCapacity(state, instanceIndex + 1)
            ensureIndexStorage(world, state.capacity)
            writeFlowerInstance(state, instanceIndex, flower)
            flowerInstanceIndexBySlot[flowerIndex] = instanceIndex
            flowerSlotByInstanceIndex[instanceIndex] = flowerIndex
            state.flowerInstanceCount += 1
          }
          flowerIndex = nextInCell
        }
      }
    }

    if (state.flowerInstanceCount > 0) {
      gl.bufferSubData(
        gl.ARRAY_BUFFER,
        0,
        state.instanceData,
        0,
        state.flowerInstanceCount * FLOWER_INSTANCE_STRIDE,
      )
    }

    state.flowerCacheMinGridX = minGridX
    state.flowerCacheMaxGridX = maxGridX
    state.flowerCacheMinGridY = minGridY
    state.flowerCacheMaxGridY = maxGridY
    state.flowerBufferDirty = false
  } else {
    if (flowerRevisionChanged) {
      for (const flowerIndex of world.flowerDirtyIndices) {
        syncFlowerInstance(state, world, flowerIndex, cullBounds)
      }
    }

    for (const flowerIndex of world.flowerBloomingIndices) {
      syncFlowerInstance(state, world, flowerIndex, cullBounds)
    }

    for (const flowerIndex of previousBloomingFlowerIndices) {
      if (!world.flowerBloomingIndices.has(flowerIndex)) {
        syncFlowerInstance(state, world, flowerIndex, cullBounds)
      }
    }
  }

  previousBloomingFlowerIndices.clear()
  for (const flowerIndex of world.flowerBloomingIndices) {
    previousBloomingFlowerIndices.add(flowerIndex)
  }

  cachedFlowerWorld = world
  cachedFlowerRevision = world.flowerRenderRevision

  ensureGpuViewport(state, VIEW_WIDTH, VIEW_HEIGHT)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  if (state.flowerInstanceCount <= 0) {
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
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, state.flowerInstanceCount)
  gl.bindVertexArray(null)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()

  return true
}
