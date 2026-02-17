import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import { buildCullBounds } from "../cull.ts"
import type { WorldState } from "../world/state.ts"
import flowerPetalMaskUrl from "../../assets/flowers/flower-petal-mask.png"
import flowerAccentMaskUrl from "../../assets/flowers/flower-accent-mask.png"

const FLOWER_INSTANCE_STRIDE = 9
const QUAD_INSTANCE_STRIDE = 9
const TRAIL_INSTANCE_STRIDE = 10
const FLOWER_PETAL_URL = flowerPetalMaskUrl
const FLOWER_CENTER_URL = flowerAccentMaskUrl

interface FlowerGpuState {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  quadBuffer: WebGLBuffer
  instanceBuffer: WebGLBuffer
  petalTexture: WebGLTexture
  centerTexture: WebGLTexture
  quadProgram: WebGLProgram
  quadVao: WebGLVertexArrayObject
  quadStaticBuffer: WebGLBuffer
  quadInstanceBuffer: WebGLBuffer
  trailProgram: WebGLProgram
  trailVao: WebGLVertexArrayObject
  trailStaticBuffer: WebGLBuffer
  trailInstanceBuffer: WebGLBuffer
  instanceData: Float32Array
  quadInstanceData: Float32Array
  trailInstanceData: Float32Array
  capacity: number
  quadCapacity: number
  trailCapacity: number
  uniformCamera: WebGLUniformLocation
  uniformView: WebGLUniformLocation
  uniformScale: WebGLUniformLocation
  quadUniformCamera: WebGLUniformLocation
  quadUniformView: WebGLUniformLocation
  quadUniformScale: WebGLUniformLocation
  trailUniformCamera: WebGLUniformLocation
  trailUniformView: WebGLUniformLocation
  trailUniformScale: WebGLUniformLocation
}

let flowerGpuState: FlowerGpuState | null = null
let flowerGpuInitTried = false
const colorFloatCache = new Map<string, readonly [number, number, number]>()

const parseHexColorFloat = (hex: string) => {
  const cached = colorFloatCache.get(hex)
  if (cached) {
    return cached
  }

  const cleaned = hex.replace("#", "")
  if (cleaned.length !== 6) {
    const fallback = [1, 1, 1] as const
    colorFloatCache.set(hex, fallback)
    return fallback
  }

  const red = Number.parseInt(cleaned.slice(0, 2), 16) / 255
  const green = Number.parseInt(cleaned.slice(2, 4), 16) / 255
  const blue = Number.parseInt(cleaned.slice(4, 6), 16) / 255
  const parsed = [red, green, blue] as const
  colorFloatCache.set(hex, parsed)
  return parsed
}

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) {
    return null
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }

  return shader
}

const createProgram = (gl: WebGL2RenderingContext, vertexSource: string, fragmentSource: string) => {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource)
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource)
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader)
    if (fragmentShader) gl.deleteShader(fragmentShader)
    return null
  }

  const program = gl.createProgram()
  if (!program) {
    gl.deleteShader(vertexShader)
    gl.deleteShader(fragmentShader)
    return null
  }

  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)
  gl.deleteShader(vertexShader)
  gl.deleteShader(fragmentShader)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program)
    return null
  }

  return program
}

const createTexture = (gl: WebGL2RenderingContext) => {
  const texture = gl.createTexture()
  if (!texture) {
    return null
  }

  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([255, 255, 255, 255]),
  )

  return texture
}

const loadTextureFromUrl = (gl: WebGL2RenderingContext, texture: WebGLTexture, url: string) => {
  const image = new Image()
  image.src = url
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)
  }
}

const ensureCapacity = (state: FlowerGpuState, needed: number) => {
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

const ensureQuadCapacity = (state: FlowerGpuState, needed: number) => {
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

const ensureTrailCapacity = (state: FlowerGpuState, needed: number) => {
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

const initFlowerGpuState = () => {
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

  const vertexSource = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in float iSize;
layout(location = 3) in vec3 iPetal;
layout(location = 4) in vec3 iCenter;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vPetal;
out vec3 vCenter;

void main() {
  vec2 world = iPosition + aCorner * iSize;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aCorner * 0.5 + 0.5;
  vPetal = iPetal;
  vCenter = iCenter;
}
`

  const fragmentSource = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vPetal;
in vec3 vCenter;

uniform sampler2D uPetalMask;
uniform sampler2D uCenterMask;

out vec4 outColor;

void main() {
  float petalA = texture(uPetalMask, vUv).a;
  float centerA = texture(uCenterMask, vUv).a;
  float alpha = max(petalA, centerA);
  if (alpha <= 0.01) {
    discard;
  }

  vec3 color = mix(vPetal, vCenter, centerA);
  outColor = vec4(color, alpha);
}
`

  const program = createProgram(gl, vertexSource, fragmentSource)
  if (!program) {
    return null
  }

  const quadVertexSource = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in float iSize;
layout(location = 3) in float iRotation;
layout(location = 4) in vec3 iColor;
layout(location = 5) in float iAlpha;
layout(location = 6) in float iStyle;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;
out float vStyle;

void main() {
  float c = cos(iRotation);
  float s = sin(iRotation);
  vec2 rotated = vec2(
    aCorner.x * c - aCorner.y * s,
    aCorner.x * s + aCorner.y * c
  );
  vec2 world = iPosition + rotated * iSize;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aCorner * 0.5 + 0.5;
  vColor = iColor;
  vAlpha = iAlpha;
  vStyle = iStyle;
}
`

  const quadFragmentSource = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vColor;
in float vAlpha;
in float vStyle;

out vec4 outColor;

void main() {
  if (vStyle > 0.5) {
    vec2 centered = vUv * 2.0 - 1.0;
    float profile = abs(centered.x) * 1.18 + centered.y * centered.y * 0.92;
    float petalMask = 1.0 - smoothstep(0.78, 1.0, profile);
    float tipFade = 1.0 - smoothstep(0.72, 1.0, abs(centered.y));
    float alpha = vAlpha * petalMask * tipFade;
    if (alpha <= 0.01) {
      discard;
    }

    float vein = smoothstep(0.24, 0.0, abs(centered.x));
    vec3 color = mix(vColor * 0.76, min(vec3(1.0), vColor * 1.2), vein * 0.45 + 0.15);
    outColor = vec4(color, alpha);
    return;
  }

  vec3 color = vColor;
  float stripe = smoothstep(0.54, 0.62, vUv.y) * (1.0 - smoothstep(0.76, 0.84, vUv.y));
  color = mix(color, color * 0.52, stripe);
  outColor = vec4(color, vAlpha);
}
`

  const quadProgram = createProgram(gl, quadVertexSource, quadFragmentSource)
  if (!quadProgram) {
    return null
  }

  const trailVertexSource = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec2 iPosition;
layout(location = 2) in vec2 iDirection;
layout(location = 3) in float iLength;
layout(location = 4) in float iWidth;
layout(location = 5) in vec3 iColor;
layout(location = 6) in float iAlpha;

uniform vec2 uCamera;
uniform vec2 uView;
uniform float uScale;

out vec2 vUv;
out vec3 vColor;
out float vAlpha;

void main() {
  vec2 dir = normalize(iDirection);
  vec2 normal = vec2(-dir.y, dir.x);
  float t = aCorner.x * 0.5 + 0.5;
  vec2 along = dir * ((t - 1.0) * iLength);
  vec2 across = normal * (aCorner.y * iWidth * 0.5);
  vec2 world = iPosition + along + across;
  vec2 screen = (world - uCamera) * uScale + uView * 0.5;
  vec2 clip = screen / uView * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = vec2(t, aCorner.y * 0.5 + 0.5);
  vColor = iColor;
  vAlpha = iAlpha;
}
`

  const trailFragmentSource = `#version 300 es
precision mediump float;

in vec2 vUv;
in vec3 vColor;
in float vAlpha;

out vec4 outColor;

void main() {
  float centered = abs(vUv.y * 2.0 - 1.0);
  float tailTaper = smoothstep(0.0, 0.55, vUv.x);
  float halfWidth = mix(0.18, 1.0, tailTaper);
  float sideFade = 1.0 - smoothstep(halfWidth * 0.72, halfWidth, centered);
  float headFade = smoothstep(1.0, 0.9, vUv.x);
  float tailFade = smoothstep(0.0, 0.28, vUv.x);
  float alpha = vAlpha * sideFade * headFade * tailFade;
  if (alpha <= 0.01) {
    discard;
  }
  outColor = vec4(vColor, alpha);
}
`

  const trailProgram = createProgram(gl, trailVertexSource, trailFragmentSource)
  if (!trailProgram) {
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
  if (
    !uniformCamera ||
    !uniformView ||
    !uniformScale ||
    !quadUniformCamera ||
    !quadUniformView ||
    !quadUniformScale ||
    !trailUniformCamera ||
    !trailUniformView ||
    !trailUniformScale
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
    petalTexture,
    centerTexture,
    instanceData: new Float32Array(512 * FLOWER_INSTANCE_STRIDE),
    quadInstanceData: new Float32Array(256 * QUAD_INSTANCE_STRIDE),
    trailInstanceData: new Float32Array(512 * TRAIL_INSTANCE_STRIDE),
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
  }

  return flowerGpuState
}

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
    const alpha = trail.alpha * lifeRatio * lifeRatio
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
