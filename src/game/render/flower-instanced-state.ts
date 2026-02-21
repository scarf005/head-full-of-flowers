import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"
import { createProgram, createTexture, loadTextureFromUrl } from "./flower-instanced-gl-utils.ts"
import {
  EXPLOSION_FRAGMENT_SHADER_SOURCE,
  EXPLOSION_VERTEX_SHADER_SOURCE,
  FLOWER_FRAGMENT_SHADER_SOURCE,
  FLOWER_VERTEX_SHADER_SOURCE,
  QUAD_FRAGMENT_SHADER_SOURCE,
  QUAD_VERTEX_SHADER_SOURCE,
  TRAIL_FRAGMENT_SHADER_SOURCE,
  TRAIL_VERTEX_SHADER_SOURCE,
} from "./flower-instanced-shaders.ts"
import {
  FLOWER_INSTANCE_STRIDE,
  type FlowerGpuState,
  GPU_EXPLOSION_INSTANCES,
  MAX_GPU_EXPLOSIONS,
  QUAD_INSTANCE_STRIDE,
  TRAIL_INSTANCE_STRIDE,
} from "./flower-instanced-types.ts"

const FLOWER_PETAL_URL = flowerPetalMaskUrl
const FLOWER_CENTER_URL = flowerAccentMaskUrl

let flowerGpuState: FlowerGpuState | null = null
let flowerGpuInitTried = false

export const ensureCapacity = (state: FlowerGpuState, needed: number) => {
  if (needed <= state.capacity) {
    return
  }

  let nextCapacity = state.capacity
  while (nextCapacity < needed) {
    nextCapacity = Math.max(512, nextCapacity * 2)
  }

  state.capacity = nextCapacity
  state.instanceData = new Float32Array(state.capacity * FLOWER_INSTANCE_STRIDE)
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.instanceBuffer)
  state.gl.bufferData(state.gl.ARRAY_BUFFER, state.instanceData.byteLength, state.gl.DYNAMIC_DRAW)
}

export const ensureQuadCapacity = (state: FlowerGpuState, needed: number) => {
  if (needed <= state.quadCapacity) {
    return
  }

  let nextCapacity = state.quadCapacity
  while (nextCapacity < needed) {
    nextCapacity = Math.max(256, nextCapacity * 2)
  }

  state.quadCapacity = nextCapacity
  state.quadInstanceData = new Float32Array(state.quadCapacity * QUAD_INSTANCE_STRIDE)
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.quadInstanceBuffer)
  state.gl.bufferData(state.gl.ARRAY_BUFFER, state.quadInstanceData.byteLength, state.gl.DYNAMIC_DRAW)
}

export const ensureTrailCapacity = (state: FlowerGpuState, needed: number) => {
  if (needed <= state.trailCapacity) {
    return
  }

  let nextCapacity = state.trailCapacity
  while (nextCapacity < needed) {
    nextCapacity = Math.max(512, nextCapacity * 2)
  }

  state.trailCapacity = nextCapacity
  state.trailInstanceData = new Float32Array(state.trailCapacity * TRAIL_INSTANCE_STRIDE)
  state.gl.bindBuffer(state.gl.ARRAY_BUFFER, state.trailInstanceBuffer)
  state.gl.bufferData(state.gl.ARRAY_BUFFER, state.trailInstanceData.byteLength, state.gl.DYNAMIC_DRAW)
}

export const initFlowerGpuState = () => {
  if (flowerGpuState || flowerGpuInitTried || typeof document === "undefined") {
    return flowerGpuState
  }

  flowerGpuInitTried = true

  const canvas = document.createElement("canvas")
  canvas.width = VIEW_WIDTH
  canvas.height = VIEW_HEIGHT
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
  })

  if (!gl) {
    return null
  }

  const program = createProgram(gl, FLOWER_VERTEX_SHADER_SOURCE, FLOWER_FRAGMENT_SHADER_SOURCE)
  if (!program) {
    return null
  }

  const quadProgram = createProgram(gl, QUAD_VERTEX_SHADER_SOURCE, QUAD_FRAGMENT_SHADER_SOURCE)
  if (!quadProgram) {
    return null
  }

  const trailProgram = createProgram(gl, TRAIL_VERTEX_SHADER_SOURCE, TRAIL_FRAGMENT_SHADER_SOURCE)
  if (!trailProgram) {
    return null
  }

  const explosionProgram = createProgram(gl, EXPLOSION_VERTEX_SHADER_SOURCE, EXPLOSION_FRAGMENT_SHADER_SOURCE)
  if (!explosionProgram) {
    return null
  }

  const vao = gl.createVertexArray()
  const quadBuffer = gl.createBuffer()
  const instanceBuffer = gl.createBuffer()
  const quadVao = gl.createVertexArray()
  const quadStaticBuffer = gl.createBuffer()
  const quadInstanceBuffer = gl.createBuffer()
  const trailVao = gl.createVertexArray()
  const trailStaticBuffer = gl.createBuffer()
  const trailInstanceBuffer = gl.createBuffer()
  const explosionVao = gl.createVertexArray()
  const explosionStaticBuffer = gl.createBuffer()
  const petalTexture = createTexture(gl)
  const centerTexture = createTexture(gl)
  if (
    !vao ||
    !quadBuffer ||
    !instanceBuffer ||
    !quadVao ||
    !quadStaticBuffer ||
    !quadInstanceBuffer ||
    !trailVao ||
    !trailStaticBuffer ||
    !trailInstanceBuffer ||
    !explosionVao ||
    !explosionStaticBuffer ||
    !petalTexture ||
    !centerTexture
  ) {
    return null
  }

  const uniformCamera = gl.getUniformLocation(program, "uCamera")
  const uniformView = gl.getUniformLocation(program, "uView")
  const uniformScale = gl.getUniformLocation(program, "uScale")
  const quadUniformCamera = gl.getUniformLocation(quadProgram, "uCamera")
  const quadUniformView = gl.getUniformLocation(quadProgram, "uView")
  const quadUniformScale = gl.getUniformLocation(quadProgram, "uScale")
  const trailUniformCamera = gl.getUniformLocation(trailProgram, "uCamera")
  const trailUniformView = gl.getUniformLocation(trailProgram, "uView")
  const trailUniformScale = gl.getUniformLocation(trailProgram, "uScale")
  const explosionUniformCamera = gl.getUniformLocation(explosionProgram, "uCamera")
  const explosionUniformView = gl.getUniformLocation(explosionProgram, "uView")
  const explosionUniformScale = gl.getUniformLocation(explosionProgram, "uScale")
  const explosionUniformCount = gl.getUniformLocation(explosionProgram, "uExplosionCount")
  const explosionUniformExplosions = gl.getUniformLocation(explosionProgram, "uExplosions")
  if (
    !uniformCamera ||
    !uniformView ||
    !uniformScale ||
    !quadUniformCamera ||
    !quadUniformView ||
    !quadUniformScale ||
    !trailUniformCamera ||
    !trailUniformView ||
    !trailUniformScale ||
    !explosionUniformCamera ||
    !explosionUniformView ||
    !explosionUniformScale ||
    !explosionUniformCount ||
    !explosionUniformExplosions
  ) {
    return null
  }

  gl.bindVertexArray(vao)

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      1,
      1,
    ]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 512 * FLOWER_INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW)
  const stride = FLOWER_INSTANCE_STRIDE * 4

  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 0)
  gl.vertexAttribDivisor(1, 1)

  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, stride, 2 * 4)
  gl.vertexAttribDivisor(2, 1)

  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride, 3 * 4)
  gl.vertexAttribDivisor(3, 1)

  gl.enableVertexAttribArray(4)
  gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 6 * 4)
  gl.vertexAttribDivisor(4, 1)

  gl.bindVertexArray(null)

  gl.bindVertexArray(explosionVao)

  gl.bindBuffer(gl.ARRAY_BUFFER, explosionStaticBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      1,
      1,
    ]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)

  gl.bindVertexArray(null)

  gl.bindVertexArray(quadVao)

  gl.bindBuffer(gl.ARRAY_BUFFER, quadStaticBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      1,
      1,
    ]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, quadInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 256 * QUAD_INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW)
  const quadStride = QUAD_INSTANCE_STRIDE * 4

  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, quadStride, 0)
  gl.vertexAttribDivisor(1, 1)

  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, quadStride, 2 * 4)
  gl.vertexAttribDivisor(2, 1)

  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, quadStride, 3 * 4)
  gl.vertexAttribDivisor(3, 1)

  gl.enableVertexAttribArray(4)
  gl.vertexAttribPointer(4, 3, gl.FLOAT, false, quadStride, 4 * 4)
  gl.vertexAttribDivisor(4, 1)

  gl.enableVertexAttribArray(5)
  gl.vertexAttribPointer(5, 1, gl.FLOAT, false, quadStride, 7 * 4)
  gl.vertexAttribDivisor(5, 1)

  gl.enableVertexAttribArray(6)
  gl.vertexAttribPointer(6, 1, gl.FLOAT, false, quadStride, 8 * 4)
  gl.vertexAttribDivisor(6, 1)

  gl.bindVertexArray(null)

  gl.bindVertexArray(trailVao)

  gl.bindBuffer(gl.ARRAY_BUFFER, trailStaticBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1,
      -1,
      1,
      -1,
      -1,
      1,
      1,
      1,
    ]),
    gl.STATIC_DRAW,
  )
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, trailInstanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, 512 * TRAIL_INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW)
  const trailStride = TRAIL_INSTANCE_STRIDE * 4

  gl.enableVertexAttribArray(1)
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, trailStride, 0)
  gl.vertexAttribDivisor(1, 1)

  gl.enableVertexAttribArray(2)
  gl.vertexAttribPointer(2, 2, gl.FLOAT, false, trailStride, 2 * 4)
  gl.vertexAttribDivisor(2, 1)

  gl.enableVertexAttribArray(3)
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, trailStride, 4 * 4)
  gl.vertexAttribDivisor(3, 1)

  gl.enableVertexAttribArray(4)
  gl.vertexAttribPointer(4, 1, gl.FLOAT, false, trailStride, 5 * 4)
  gl.vertexAttribDivisor(4, 1)

  gl.enableVertexAttribArray(5)
  gl.vertexAttribPointer(5, 3, gl.FLOAT, false, trailStride, 6 * 4)
  gl.vertexAttribDivisor(5, 1)

  gl.enableVertexAttribArray(6)
  gl.vertexAttribPointer(6, 1, gl.FLOAT, false, trailStride, 9 * 4)
  gl.vertexAttribDivisor(6, 1)

  gl.enableVertexAttribArray(7)
  gl.vertexAttribPointer(7, 1, gl.FLOAT, false, trailStride, 10 * 4)
  gl.vertexAttribDivisor(7, 1)

  gl.enableVertexAttribArray(8)
  gl.vertexAttribPointer(8, 1, gl.FLOAT, false, trailStride, 11 * 4)
  gl.vertexAttribDivisor(8, 1)

  gl.enableVertexAttribArray(9)
  gl.vertexAttribPointer(9, 1, gl.FLOAT, false, trailStride, 12 * 4)
  gl.vertexAttribDivisor(9, 1)

  gl.bindVertexArray(null)

  gl.useProgram(program)
  gl.uniform2f(uniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(uniformScale, WORLD_SCALE)
  gl.uniform1i(gl.getUniformLocation(program, "uPetalMask"), 0)
  gl.uniform1i(gl.getUniformLocation(program, "uCenterMask"), 1)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  gl.useProgram(quadProgram)
  gl.uniform2f(quadUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(quadUniformScale, WORLD_SCALE)

  gl.useProgram(trailProgram)
  gl.uniform2f(trailUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(trailUniformScale, WORLD_SCALE)

  gl.useProgram(explosionProgram)
  gl.uniform2f(explosionUniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(explosionUniformScale, WORLD_SCALE)

  loadTextureFromUrl(gl, petalTexture, FLOWER_PETAL_URL)
  loadTextureFromUrl(gl, centerTexture, FLOWER_CENTER_URL)

  flowerGpuState = {
    canvas,
    gl,
    program,
    vao,
    quadBuffer,
    instanceBuffer,
    quadProgram,
    quadVao,
    quadStaticBuffer,
    quadInstanceBuffer,
    trailProgram,
    trailVao,
    trailStaticBuffer,
    trailInstanceBuffer,
    explosionProgram,
    explosionVao,
    explosionStaticBuffer,
    petalTexture,
    centerTexture,
    instanceData: new Float32Array(512 * FLOWER_INSTANCE_STRIDE),
    quadInstanceData: new Float32Array(256 * QUAD_INSTANCE_STRIDE),
    trailInstanceData: new Float32Array(512 * TRAIL_INSTANCE_STRIDE),
    explosionUniformData: new Float32Array(MAX_GPU_EXPLOSIONS * 4),
    capacity: 512,
    quadCapacity: 256,
    trailCapacity: 512,
    uniformCamera,
    uniformView,
    uniformScale,
    quadUniformCamera,
    quadUniformView,
    quadUniformScale,
    trailUniformCamera,
    trailUniformView,
    trailUniformScale,
    explosionUniformCamera,
    explosionUniformView,
    explosionUniformScale,
    explosionUniformCount,
    explosionUniformExplosions,
  }

  return flowerGpuState
}
