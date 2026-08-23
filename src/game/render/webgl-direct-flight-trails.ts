import type { CullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { parseHexColorFloat } from "./flower-instanced-color.ts"
import {
  TRAIL_FRAGMENT_SHADER_SOURCE,
  TRAIL_VERTEX_SHADER_SOURCE,
} from "./flower-instanced-shaders.ts"
import { TRAIL_INSTANCE_STRIDE } from "./flower-instanced-types.ts"
import { DirectWebGLRenderer } from "./webgl-direct-renderer.ts"

const INITIAL_TRAIL_CAPACITY = 4096

interface TrailGpuState {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  instanceBuffer: WebGLBuffer
  cameraUniform: WebGLUniformLocation
  viewUniform: WebGLUniformLocation
  scaleUniform: WebGLUniformLocation
  instanceData: Float32Array
  capacity: number
}

const states = new WeakMap<DirectWebGLRenderer, TrailGpuState>()

const compileShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("Unable to create trail shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "unknown trail shader error"
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

const createProgram = (gl: WebGL2RenderingContext) => {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, TRAIL_VERTEX_SHADER_SOURCE)
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, TRAIL_FRAGMENT_SHADER_SOURCE)
  const program = gl.createProgram()
  if (!program) throw new Error("Unable to create trail program")
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  gl.deleteShader(vertex)
  gl.deleteShader(fragment)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "unknown trail link error"
    gl.deleteProgram(program)
    throw new Error(message)
  }
  return program
}

const createState = (renderer: DirectWebGLRenderer): TrailGpuState => {
  const { gl } = renderer
  const program = createProgram(gl)
  const vao = gl.createVertexArray()
  const cornerBuffer = gl.createBuffer()
  const instanceBuffer = gl.createBuffer()
  const cameraUniform = gl.getUniformLocation(program, "uCamera")
  const viewUniform = gl.getUniformLocation(program, "uView")
  const scaleUniform = gl.getUniformLocation(program, "uScale")
  if (!vao || !cornerBuffer || !instanceBuffer || !cameraUniform || !viewUniform || !scaleUniform) {
    throw new Error("Unable to initialize direct WebGL trail renderer")
  }

  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * 4, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, INITIAL_TRAIL_CAPACITY * TRAIL_INSTANCE_STRIDE * 4, gl.DYNAMIC_DRAW)
  const stride = TRAIL_INSTANCE_STRIDE * 4
  const attribute = (location: number, size: number, offsetFloats: number) => {
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offsetFloats * 4)
    gl.vertexAttribDivisor(location, 1)
  }
  attribute(1, 2, 0)
  attribute(2, 2, 2)
  attribute(3, 1, 4)
  attribute(4, 1, 5)
  attribute(5, 3, 6)
  attribute(6, 1, 9)
  attribute(7, 1, 10)
  attribute(8, 1, 11)
  attribute(9, 1, 12)
  gl.bindVertexArray(null)

  return {
    program,
    vao,
    instanceBuffer,
    cameraUniform,
    viewUniform,
    scaleUniform,
    instanceData: new Float32Array(INITIAL_TRAIL_CAPACITY * TRAIL_INSTANCE_STRIDE),
    capacity: INITIAL_TRAIL_CAPACITY,
  }
}

const stateFor = (renderer: DirectWebGLRenderer) => {
  let state = states.get(renderer)
  if (!state) {
    state = createState(renderer)
    states.set(renderer, state)
  }
  return state
}

const ensureCapacity = (renderer: DirectWebGLRenderer, state: TrailGpuState, needed: number) => {
  if (needed <= state.capacity) return
  let capacity = state.capacity
  while (capacity < needed) capacity *= 2
  state.capacity = capacity
  state.instanceData = new Float32Array(capacity * TRAIL_INSTANCE_STRIDE)
  const { gl } = renderer
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instanceBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, state.instanceData.byteLength, gl.DYNAMIC_DRAW)
}

export const renderDirectFlightTrails = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  cullBounds: CullBounds,
  cameraX: number,
  cameraY: number,
) => {
  // Initialize before the first projectile appears so shader compilation does
  // not become a first-shot hitch.
  const state = stateFor(renderer)
  let count = 0

  for (const trailIndex of world.activeFlightTrailIndices) {
    const trail = world.flightTrails[trailIndex]
    if (!trail?.active || trail.maxLife <= 0) continue
    if (
      trail.position.x < cullBounds.minX || trail.position.x > cullBounds.maxX ||
      trail.position.y < cullBounds.minY || trail.position.y > cullBounds.maxY
    ) continue

    const lifeRatio = Math.max(0, Math.min(1, trail.life / trail.maxLife))
    const alpha = trail.style > 0.5
      ? trail.alpha * (lifeRatio * lifeRatio * (3 - 2 * lifeRatio))
      : trail.alpha * lifeRatio * lifeRatio
    if (alpha <= 0.01) continue

    ensureCapacity(renderer, state, count + 1)
    const write = count * TRAIL_INSTANCE_STRIDE
    const [red, green, blue] = parseHexColorFloat(trail.color)
    state.instanceData[write] = trail.position.x
    state.instanceData[write + 1] = trail.position.y
    state.instanceData[write + 2] = trail.direction.x
    state.instanceData[write + 3] = trail.direction.y
    state.instanceData[write + 4] = trail.length
    state.instanceData[write + 5] = trail.width
    state.instanceData[write + 6] = red
    state.instanceData[write + 7] = green
    state.instanceData[write + 8] = blue
    state.instanceData[write + 9] = alpha
    state.instanceData[write + 10] = trail.style
    state.instanceData[write + 11] = trail.growth
    state.instanceData[write + 12] = trail.turbulence
    state.instanceData[write + 13] = trail.driftSpeed
    count += 1
  }

  if (count <= 0) return

  // This is the pre-perf trail shader and instance layout, rendered into the
  // main framebuffer. There is no hidden WebGL canvas or Canvas2D composite.
  renderer.flush()
  const { gl } = renderer
  gl.useProgram(state.program)
  gl.uniform2f(state.cameraUniform, cameraX, cameraY)
  gl.uniform2f(state.viewUniform, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.scaleUniform, WORLD_SCALE)
  gl.bindVertexArray(state.vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, state.instanceBuffer)
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, state.instanceData, 0, count * TRAIL_INSTANCE_STRIDE)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
  gl.bindVertexArray(null)
}
