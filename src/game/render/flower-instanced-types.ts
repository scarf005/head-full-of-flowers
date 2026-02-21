export const FLOWER_INSTANCE_STRIDE = 9
export const QUAD_INSTANCE_STRIDE = 9
export const TRAIL_INSTANCE_STRIDE = 14
export const MAX_GPU_EXPLOSIONS = 24
export const GPU_EXPLOSION_PARTICLES = 28
export const GPU_EXPLOSION_INSTANCES = GPU_EXPLOSION_PARTICLES + 1

export interface FlowerGpuState {
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
  explosionProgram: WebGLProgram
  explosionVao: WebGLVertexArrayObject
  explosionStaticBuffer: WebGLBuffer
  instanceData: Float32Array
  quadInstanceData: Float32Array
  trailInstanceData: Float32Array
  explosionUniformData: Float32Array
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
  explosionUniformCamera: WebGLUniformLocation
  explosionUniformView: WebGLUniformLocation
  explosionUniformScale: WebGLUniformLocation
  explosionUniformCount: WebGLUniformLocation
  explosionUniformExplosions: WebGLUniformLocation
}
