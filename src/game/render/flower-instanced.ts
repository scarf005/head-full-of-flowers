import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

const FLOWER_INSTANCE_STRIDE = 9
const FLOWER_PETAL_URL = "/flowers/flower-petal-mask.png"
const FLOWER_CENTER_URL = "/flowers/flower-accent-mask.png"

interface FlowerGpuState {
  canvas: HTMLCanvasElement
  gl: WebGL2RenderingContext
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  quadBuffer: WebGLBuffer
  instanceBuffer: WebGLBuffer
  petalTexture: WebGLTexture
  centerTexture: WebGLTexture
  instanceData: Float32Array
  capacity: number
  uniformCamera: WebGLUniformLocation
  uniformView: WebGLUniformLocation
  uniformScale: WebGLUniformLocation
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
    new Uint8Array([255, 255, 255, 255])
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
    premultipliedAlpha: true
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

  const vao = gl.createVertexArray()
  const quadBuffer = gl.createBuffer()
  const instanceBuffer = gl.createBuffer()
  const petalTexture = createTexture(gl)
  const centerTexture = createTexture(gl)
  if (!vao || !quadBuffer || !instanceBuffer || !petalTexture || !centerTexture) {
    return null
  }

  const uniformCamera = gl.getUniformLocation(program, "uCamera")
  const uniformView = gl.getUniformLocation(program, "uView")
  const uniformScale = gl.getUniformLocation(program, "uScale")
  if (!uniformCamera || !uniformView || !uniformScale) {
    return null
  }

  gl.bindVertexArray(vao)

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,
    1, -1,
    -1, 1,
    1, 1
  ]), gl.STATIC_DRAW)
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

  gl.useProgram(program)
  gl.uniform2f(uniformView, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(uniformScale, WORLD_SCALE)
  gl.uniform1i(gl.getUniformLocation(program, "uPetalMask"), 0)
  gl.uniform1i(gl.getUniformLocation(program, "uCenterMask"), 1)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  loadTextureFromUrl(gl, petalTexture, FLOWER_PETAL_URL)
  loadTextureFromUrl(gl, centerTexture, FLOWER_CENTER_URL)

  flowerGpuState = {
    canvas,
    gl,
    program,
    vao,
    quadBuffer,
    instanceBuffer,
    petalTexture,
    centerTexture,
    instanceData: new Float32Array(512 * FLOWER_INSTANCE_STRIDE),
    capacity: 512,
    uniformCamera,
    uniformView,
    uniformScale
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

  const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
  const minX = cameraX - halfViewX - 1.5
  const maxX = cameraX + halfViewX + 1.5
  const minY = cameraY - halfViewY - 1.5
  const maxY = cameraY + halfViewY + 1.5

  let instanceCount = 0
  for (const flower of world.flowers) {
    if (!flower.active) {
      continue
    }
    if (flower.position.x < minX || flower.position.x > maxX || flower.position.y < minY || flower.position.y > maxY) {
      continue
    }

    const writeIndex = instanceCount * FLOWER_INSTANCE_STRIDE
    ensureCapacity(state, instanceCount + 1)

    const [petalRed, petalGreen, petalBlue] = parseHexColorFloat(flower.color)
    const centerColor = flower.accent === "#29261f" ? "#6d5e42" : flower.accent
    const [centerRed, centerGreen, centerBlue] = parseHexColorFloat(centerColor)
    const size = Math.max(0.12, flower.size * 0.9)

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
    context.save()
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
    context.restore()
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
  gl.bufferData(gl.ARRAY_BUFFER, state.instanceData.subarray(0, instanceCount * FLOWER_INSTANCE_STRIDE), gl.DYNAMIC_DRAW)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount)
  gl.bindVertexArray(null)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()

  return true
}
