import type { CullBounds } from "../cull.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"
import { createProgram } from "./flower-instanced-gl-utils.ts"
import {
  EXPLOSION_FRAGMENT_SHADER_SOURCE,
  EXPLOSION_VERTEX_SHADER_SOURCE,
} from "./flower-instanced-shaders.ts"
import { GPU_EXPLOSION_INSTANCES, MAX_GPU_EXPLOSIONS } from "./flower-instanced-types.ts"
import { DirectWebGLRenderer } from "./webgl-direct-renderer.ts"

interface ExplosionGpuState {
  program: WebGLProgram
  vao: WebGLVertexArrayObject
  cornerBuffer: WebGLBuffer
  cameraUniform: WebGLUniformLocation
  viewUniform: WebGLUniformLocation
  scaleUniform: WebGLUniformLocation
  countUniform: WebGLUniformLocation
  explosionsUniform: WebGLUniformLocation
  uniformData: Float32Array
}

const states = new WeakMap<DirectWebGLRenderer, ExplosionGpuState>()

const createState = (renderer: DirectWebGLRenderer): ExplosionGpuState => {
  const { gl } = renderer
  const program = createProgram(gl, EXPLOSION_VERTEX_SHADER_SOURCE, EXPLOSION_FRAGMENT_SHADER_SOURCE)
  const vao = gl.createVertexArray()
  const cornerBuffer = gl.createBuffer()
  if (!program || !vao || !cornerBuffer) {
    throw new Error("Unable to initialize direct WebGL explosion renderer")
  }

  const cameraUniform = gl.getUniformLocation(program, "uCamera")
  const viewUniform = gl.getUniformLocation(program, "uView")
  const scaleUniform = gl.getUniformLocation(program, "uScale")
  const countUniform = gl.getUniformLocation(program, "uExplosionCount")
  const explosionsUniform = gl.getUniformLocation(program, "uExplosions")
  if (!cameraUniform || !viewUniform || !scaleUniform || !countUniform || !explosionsUniform) {
    gl.deleteBuffer(cornerBuffer)
    gl.deleteVertexArray(vao)
    gl.deleteProgram(program)
    throw new Error("Unable to resolve direct WebGL explosion uniforms")
  }

  gl.bindVertexArray(vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 2 * Float32Array.BYTES_PER_ELEMENT, 0)
  gl.bindVertexArray(null)

  return {
    program,
    vao,
    cornerBuffer,
    cameraUniform,
    viewUniform,
    scaleUniform,
    countUniform,
    explosionsUniform,
    uniformData: new Float32Array(MAX_GPU_EXPLOSIONS * 4),
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

export const renderDirectExplosions = (
  renderer: DirectWebGLRenderer,
  world: WorldState,
  cullBounds: CullBounds,
) => {
  const cameraX = world.camera.x + world.cameraOffset.x
  const cameraY = world.camera.y + world.cameraOffset.y

  // Compile before the first explosion so the first rocket/grenade does not
  // pay shader compilation cost in the impact frame.
  const state = stateFor(renderer)
  let count = 0

  const collect = (explosion: WorldState["explosions"][number]) => {
    if (!explosion.active || explosion.radius <= 0.01) return false
    if (
      explosion.position.x < cullBounds.minX - explosion.radius - 1 ||
      explosion.position.x > cullBounds.maxX + explosion.radius + 1 ||
      explosion.position.y < cullBounds.minY - explosion.radius - 1 ||
      explosion.position.y > cullBounds.maxY + explosion.radius + 1
    ) return false
    if (count >= MAX_GPU_EXPLOSIONS) return true

    const write = count * 4
    state.uniformData[write] = explosion.position.x
    state.uniformData[write + 1] = explosion.position.y
    state.uniformData[write + 2] = explosion.radius
    state.uniformData[write + 3] = Math.max(0, Math.min(1, explosion.life / 0.24))
    count += 1
    return count >= MAX_GPU_EXPLOSIONS
  }

  if (world.activeExplosionIndices.size > 0) {
    for (const explosionIndex of world.activeExplosionIndices) {
      const explosion = world.explosions[explosionIndex]
      if (explosion && collect(explosion)) break
    }
  } else {
    for (const explosion of world.explosions) {
      if (collect(explosion)) break
    }
  }

  if (count <= 0) return

  // This is the pre-frame-pacing explosion shader, but it now renders into
  // the main WebGL framebuffer instead of a hidden WebGL canvas that is then
  // copied into Canvas2D. It restores the hot center/embers and glowing ring
  // while keeping the single-context renderer.
  renderer.setBlendMode("additive")
  const { gl } = renderer
  gl.useProgram(state.program)
  gl.uniform2f(state.cameraUniform, cameraX, cameraY)
  gl.uniform2f(state.viewUniform, VIEW_WIDTH, VIEW_HEIGHT)
  gl.uniform1f(state.scaleUniform, WORLD_SCALE)
  gl.uniform1i(state.countUniform, count)
  gl.uniform4fv(state.explosionsUniform, state.uniformData, 0, count * 4)
  gl.bindVertexArray(state.vao)
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count * GPU_EXPLOSION_INSTANCES)
  gl.bindVertexArray(null)
  renderer.setBlendMode("normal")
}
