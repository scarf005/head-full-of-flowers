import { loadedWebGLSprites, canonicalWebGLSpriteId } from "./webgl-direct-sprites.ts"

export type Rgba = readonly [number, number, number, number]
export type BlendMode = "normal" | "additive"

export interface WebGLRenderTarget {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

interface AtlasEntry {
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}

interface ViewTransform {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
}

const WHITE: Rgba = [1, 1, 1, 1]
const TWO_PI = Math.PI * 2
const VERTEX_STRIDE = 8
const INITIAL_VERTEX_CAPACITY = 262_144
const COLOR_CACHE = new Map<string, Rgba>()

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

export const parseWebGLColor = (input: string): Rgba => {
  const cached = COLOR_CACHE.get(input)
  if (cached) return cached
  const value = input.trim().toLowerCase()
  let result: Rgba = WHITE
  if (value.startsWith("#")) {
    const hex = value.slice(1)
    if (hex.length === 3) {
      result = [
        Number.parseInt(hex[0] + hex[0], 16) / 255,
        Number.parseInt(hex[1] + hex[1], 16) / 255,
        Number.parseInt(hex[2] + hex[2], 16) / 255,
        1,
      ]
    } else if (hex.length === 6 || hex.length === 8) {
      result = [
        Number.parseInt(hex.slice(0, 2), 16) / 255,
        Number.parseInt(hex.slice(2, 4), 16) / 255,
        Number.parseInt(hex.slice(4, 6), 16) / 255,
        hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
      ]
    }
  } else {
    const match = value.match(/^rgba?\(([^)]+)\)$/)
    if (match) {
      const parts = match[1].split(",").map((part) => Number(part.trim()))
      result = [
        clamp01((parts[0] ?? 255) / 255),
        clamp01((parts[1] ?? 255) / 255),
        clamp01((parts[2] ?? 255) / 255),
        clamp01(parts[3] ?? 1),
      ]
    } else if (value === "black") {
      result = [0, 0, 0, 1]
    } else if (value === "transparent") {
      result = [0, 0, 0, 0]
    }
  }
  COLOR_CACHE.set(input, result)
  return result
}

const createShader = (gl: WebGL2RenderingContext, type: number, source: string) => {
  const shader = gl.createShader(type)
  if (!shader) throw new Error("Unable to create WebGL shader")
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "unknown shader error"
    gl.deleteShader(shader)
    throw new Error(log)
  }
  return shader
}

const createProgram = (gl: WebGL2RenderingContext, vertex: string, fragment: string) => {
  const program = gl.createProgram()
  if (!program) throw new Error("Unable to create WebGL program")
  const vs = createShader(gl, gl.VERTEX_SHADER, vertex)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fragment)
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? "unknown program error"
    gl.deleteProgram(program)
    throw new Error(log)
  }
  return program
}

const BATCH_VERTEX = `#version 300 es
layout(location=0) in vec2 aPosition;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aColor;
uniform vec2 uResolution;
out vec2 vUv;
out vec4 vColor;
void main() {
  vec2 zeroToOne = aPosition / uResolution;
  vec2 clip = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vUv = aUv;
  vColor = aColor;
}`

const BATCH_FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec4 texel = texture(uTexture, vUv);
  float alpha = texel.a * vColor.a;
  if (alpha <= 0.001) discard;
  outColor = vec4(texel.rgb * vColor.rgb, alpha);
}`

const RADIAL_VERTEX = `#version 300 es
const vec2 POSITIONS[6] = vec2[6](
  vec2(-1.0,-1.0), vec2(1.0,-1.0), vec2(1.0,1.0),
  vec2(-1.0,-1.0), vec2(1.0,1.0), vec2(-1.0,1.0)
);
out vec2 vUv;
void main() {
  vec2 p = POSITIONS[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  vUv = p * 0.5 + 0.5;
}`

const RADIAL_FRAGMENT = `#version 300 es
precision mediump float;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uInner;
uniform float uOuter;
uniform float uPower;
uniform vec4 uColor;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 p = vUv * uResolution;
  float d = distance(p, uCenter);
  float t = clamp((d - uInner) / max(0.001, uOuter - uInner), 0.0, 1.0);
  t = pow(t, max(0.001, uPower));
  outColor = vec4(uColor.rgb, uColor.a * t);
}`

const FONT: Record<string, readonly string[]> = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  ".": ["000", "000", "000", "000", "010"],
  "m": ["000", "110", "101", "101", "101"],
  "x": ["000", "101", "010", "101", "000"],
}

const nextPow2 = (value: number) => {
  let result = 1
  while (result < value) result *= 2
  return result
}

export class DirectWebGLRenderer {
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGL2RenderingContext
  readonly maxTextureSize: number

  private batchProgram: WebGLProgram
  private batchVao: WebGLVertexArrayObject
  private batchBuffer: WebGLBuffer
  private batchResolution: WebGLUniformLocation
  private batchTextureUniform: WebGLUniformLocation
  private radialProgram: WebGLProgram
  private radialResolution: WebGLUniformLocation
  private radialCenter: WebGLUniformLocation
  private radialInner: WebGLUniformLocation
  private radialOuter: WebGLUniformLocation
  private radialPower: WebGLUniformLocation
  private radialColor: WebGLUniformLocation

  private atlasTexture: WebGLTexture
  private atlasWidth = 1
  private atlasHeight = 1
  private atlas = new Map<string, AtlasEntry>()
  private whiteUv: readonly [number, number] = [0.5, 0.5]

  private vertices = new Float32Array(INITIAL_VERTEX_CAPACITY * VERTEX_STRIDE)
  private vertexCount = 0
  private gpuCapacityBytes = this.vertices.byteLength
  private currentTexture: WebGLTexture
  private resolutionWidth: number
  private resolutionHeight: number
  private view: ViewTransform = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
  private blendMode: BlendMode = "normal"
  private currentFramebuffer: WebGLFramebuffer | null = null
  private renderTargets = new Set<WebGLRenderTarget>()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      desynchronized: true,
      powerPreference: "high-performance",
    })
    if (!gl) throw new Error("WebGL2 context is not available")
    this.gl = gl
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number
    this.resolutionWidth = canvas.width
    this.resolutionHeight = canvas.height

    this.batchProgram = createProgram(gl, BATCH_VERTEX, BATCH_FRAGMENT)
    this.radialProgram = createProgram(gl, RADIAL_VERTEX, RADIAL_FRAGMENT)
    const vao = gl.createVertexArray()
    const buffer = gl.createBuffer()
    const atlasTexture = gl.createTexture()
    const batchResolution = gl.getUniformLocation(this.batchProgram, "uResolution")
    const batchTextureUniform = gl.getUniformLocation(this.batchProgram, "uTexture")
    const radialResolution = gl.getUniformLocation(this.radialProgram, "uResolution")
    const radialCenter = gl.getUniformLocation(this.radialProgram, "uCenter")
    const radialInner = gl.getUniformLocation(this.radialProgram, "uInner")
    const radialOuter = gl.getUniformLocation(this.radialProgram, "uOuter")
    const radialPower = gl.getUniformLocation(this.radialProgram, "uPower")
    const radialColor = gl.getUniformLocation(this.radialProgram, "uColor")
    if (
      !vao || !buffer || !atlasTexture || !batchResolution || !batchTextureUniform ||
      !radialResolution || !radialCenter || !radialInner || !radialOuter || !radialPower || !radialColor
    ) throw new Error("Unable to initialize WebGL renderer")
    this.batchVao = vao
    this.batchBuffer = buffer
    this.atlasTexture = atlasTexture
    this.batchResolution = batchResolution
    this.batchTextureUniform = batchTextureUniform
    this.radialResolution = radialResolution
    this.radialCenter = radialCenter
    this.radialInner = radialInner
    this.radialOuter = radialOuter
    this.radialPower = radialPower
    this.radialColor = radialColor
    this.currentTexture = atlasTexture

    gl.bindVertexArray(vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.gpuCapacityBytes, gl.DYNAMIC_DRAW)
    const stride = VERTEX_STRIDE * Float32Array.BYTES_PER_ELEMENT
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, stride, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, stride, 2 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, stride, 4 * 4)
    gl.bindVertexArray(null)

    gl.enable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    this.buildAtlas()
    this.applyBlendMode()
  }

  private buildAtlas() {
    const gl = this.gl
    const sprites = loadedWebGLSprites()
    const padding = 1
    let width = 512
    const maxWidth = Math.min(this.maxTextureSize, 4096)
    let packed: { id: string; image: HTMLImageElement; x: number; y: number }[] = []
    let usedHeight = 0

    while (true) {
      let x = padding + 2
      let y = padding
      let rowHeight = 2
      packed = []
      let failed = false
      for (const sprite of sprites) {
        const w = sprite.image.naturalWidth
        const h = sprite.image.naturalHeight
        if (w + padding * 2 > width) {
          failed = true
          break
        }
        if (x + w + padding > width) {
          x = padding
          y += rowHeight + padding
          rowHeight = 0
        }
        packed.push({ id: sprite.id, image: sprite.image, x, y })
        x += w + padding
        rowHeight = Math.max(rowHeight, h)
      }
      usedHeight = y + rowHeight + padding
      if (!failed && usedHeight <= this.maxTextureSize) break
      if (width >= maxWidth) throw new Error("Sprite atlas exceeds WebGL texture limits")
      width = Math.min(maxWidth, width * 2)
    }

    this.atlasWidth = width
    this.atlasHeight = Math.min(this.maxTextureSize, nextPow2(Math.max(4, usedHeight)))
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.atlasWidth, this.atlasHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]))
    this.whiteUv = [1.5 / this.atlasWidth, 1.5 / this.atlasHeight]
    this.atlas.clear()
    for (const item of packed) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, item.x, item.y, gl.RGBA, gl.UNSIGNED_BYTE, item.image)
      this.atlas.set(item.id, {
        x: item.x,
        y: item.y,
        width: item.image.naturalWidth,
        height: item.image.naturalHeight,
        imageWidth: item.image.naturalWidth,
        imageHeight: item.image.naturalHeight,
      })
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
  }

  beginFrame(clearColor = "#889684") {
    this.flush()
    this.currentFramebuffer = null
    this.resolutionWidth = this.canvas.width
    this.resolutionHeight = this.canvas.height
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
    const color = parseWebGLColor(clearColor)
    gl.clearColor(color[0], color[1], color[2], color[3])
    gl.clearStencil(0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    gl.disable(gl.STENCIL_TEST)
    this.blendMode = "normal"
    this.applyBlendMode()
    this.useScreenView()
    this.currentTexture = this.atlasTexture
  }

  endFrame() {
    this.flush()
  }

  destroy() {
    this.flush()
    const gl = this.gl
    for (const target of this.renderTargets) {
      gl.deleteFramebuffer(target.framebuffer)
      gl.deleteTexture(target.texture)
    }
    this.renderTargets.clear()
    gl.deleteBuffer(this.batchBuffer)
    gl.deleteVertexArray(this.batchVao)
    gl.deleteTexture(this.atlasTexture)
    gl.deleteProgram(this.batchProgram)
    gl.deleteProgram(this.radialProgram)
  }

  useScreenView() {
    this.view = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
  }

  useWorldView(cameraX: number, cameraY: number, scale: number, viewWidth: number, viewHeight: number) {
    this.view = {
      scaleX: scale,
      scaleY: scale,
      offsetX: viewWidth * 0.5 - cameraX * scale,
      offsetY: viewHeight * 0.5 - cameraY * scale,
    }
  }

  useMapView(worldSize: number, pixelsPerWorld: number) {
    const half = worldSize * 0.5 * pixelsPerWorld
    this.view = { scaleX: pixelsPerWorld, scaleY: pixelsPerWorld, offsetX: half, offsetY: half }
  }

  private sx(x: number) { return x * this.view.scaleX + this.view.offsetX }
  private sy(y: number) { return y * this.view.scaleY + this.view.offsetY }
  private averageScale() { return (Math.abs(this.view.scaleX) + Math.abs(this.view.scaleY)) * 0.5 }

  setBlendMode(mode: BlendMode) {
    if (mode === this.blendMode) return
    this.flush()
    this.blendMode = mode
    this.applyBlendMode()
  }

  private applyBlendMode() {
    const gl = this.gl
    gl.enable(gl.BLEND)
    if (this.blendMode === "additive") gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
  }

  private ensureVertices(extraVertices: number) {
    const neededFloats = (this.vertexCount + extraVertices) * VERTEX_STRIDE
    if (neededFloats <= this.vertices.length) return
    this.flush()
    let nextFloats = this.vertices.length
    while (nextFloats < neededFloats) nextFloats *= 2
    this.vertices = new Float32Array(nextFloats)
    const bytes = this.vertices.byteLength
    if (bytes > this.gpuCapacityBytes) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.batchBuffer)
      this.gl.bufferData(this.gl.ARRAY_BUFFER, bytes, this.gl.DYNAMIC_DRAW)
      this.gpuCapacityBytes = bytes
    }
  }

  private pushVertex(x: number, y: number, u: number, v: number, color: Rgba, alphaMultiplier = 1) {
    this.ensureVertices(1)
    const i = this.vertexCount * VERTEX_STRIDE
    this.vertices[i] = x
    this.vertices[i + 1] = y
    this.vertices[i + 2] = u
    this.vertices[i + 3] = v
    this.vertices[i + 4] = color[0]
    this.vertices[i + 5] = color[1]
    this.vertices[i + 6] = color[2]
    this.vertices[i + 7] = color[3] * alphaMultiplier
    this.vertexCount += 1
  }

  private pushTriangle(
    ax: number, ay: number, bx: number, by: number, cx: number, cy: number,
    color: Rgba, alphaA = 1, alphaB = 1, alphaC = 1,
  ) {
    const [u, v] = this.whiteUv
    this.pushVertex(ax, ay, u, v, color, alphaA)
    this.pushVertex(bx, by, u, v, color, alphaB)
    this.pushVertex(cx, cy, u, v, color, alphaC)
  }

  private useTexture(texture: WebGLTexture) {
    if (texture === this.currentTexture) return
    this.flush()
    this.currentTexture = texture
  }

  flush() {
    if (this.vertexCount <= 0) return
    const gl = this.gl
    gl.useProgram(this.batchProgram)
    gl.uniform2f(this.batchResolution, this.resolutionWidth, this.resolutionHeight)
    gl.uniform1i(this.batchTextureUniform, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture)
    gl.bindVertexArray(this.batchVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.batchBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices, 0, this.vertexCount * VERTEX_STRIDE)
    gl.drawArrays(gl.TRIANGLES, 0, this.vertexCount)
    gl.bindVertexArray(null)
    this.vertexCount = 0
  }

  rect(x: number, y: number, width: number, height: number, color: string | Rgba, alpha = 1, rotation = 0) {
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    const cx = x + width * 0.5
    const cy = y + height * 0.5
    const hw = width * 0.5
    const hh = height * 0.5
    const c = Math.cos(rotation)
    const s = Math.sin(rotation)
    const point = (lx: number, ly: number) => ({
      x: this.sx(cx + lx * c - ly * s),
      y: this.sy(cy + lx * s + ly * c),
    })
    const p0 = point(-hw, -hh)
    const p1 = point(hw, -hh)
    const p2 = point(hw, hh)
    const p3 = point(-hw, hh)
    this.pushTriangle(p0.x, p0.y, p1.x, p1.y, p2.x, p2.y, rgba, alpha, alpha, alpha)
    this.pushTriangle(p0.x, p0.y, p2.x, p2.y, p3.x, p3.y, rgba, alpha, alpha, alpha)
  }

  polygon(points: readonly number[], color: string | Rgba, alpha = 1) {
    if (points.length < 6) return
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    const x0 = this.sx(points[0])
    const y0 = this.sy(points[1])
    for (let i = 2; i + 3 < points.length; i += 2) {
      this.pushTriangle(
        x0, y0,
        this.sx(points[i]), this.sy(points[i + 1]),
        this.sx(points[i + 2]), this.sy(points[i + 3]),
        rgba, alpha, alpha, alpha,
      )
    }
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    color: string | Rgba,
    alpha = 1,
    rotation = 0,
    segments = 20,
  ) {
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    const centerX = this.sx(x)
    const centerY = this.sy(y)
    const c = Math.cos(rotation)
    const s = Math.sin(rotation)
    let prevX = this.sx(x + radiusX * c)
    let prevY = this.sy(y + radiusX * s)
    const count = Math.max(8, segments)
    for (let i = 1; i <= count; i += 1) {
      const angle = (i / count) * TWO_PI
      const lx = Math.cos(angle) * radiusX
      const ly = Math.sin(angle) * radiusY
      const nextX = this.sx(x + lx * c - ly * s)
      const nextY = this.sy(y + lx * s + ly * c)
      this.pushTriangle(centerX, centerY, prevX, prevY, nextX, nextY, rgba, alpha, alpha, alpha)
      prevX = nextX
      prevY = nextY
    }
  }

  circle(x: number, y: number, radius: number, color: string | Rgba, alpha = 1, segments = 20) {
    this.ellipse(x, y, radius, radius, color, alpha, 0, segments)
  }

  line(x0: number, y0: number, x1: number, y1: number, width: number, color: string | Rgba, alpha = 1) {
    const ax = this.sx(x0)
    const ay = this.sy(y0)
    const bx = this.sx(x1)
    const by = this.sy(y1)
    const dx = bx - ax
    const dy = by - ay
    const len = Math.hypot(dx, dy)
    if (len <= 0.0001) return
    const half = Math.max(0.5, width * this.averageScale() * 0.5)
    const nx = -dy / len * half
    const ny = dx / len * half
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    this.pushTriangle(ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, rgba, alpha, alpha, alpha)
    this.pushTriangle(ax + nx, ay + ny, bx - nx, by - ny, ax - nx, ay - ny, rgba, alpha, alpha, alpha)
  }

  ring(
    x: number,
    y: number,
    radius: number,
    thickness: number,
    color: string | Rgba,
    alpha = 1,
    startAngle = 0,
    endAngle = TWO_PI,
    segments = 36,
  ) {
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    const outer = radius + thickness * 0.5
    const inner = Math.max(0, radius - thickness * 0.5)
    const sweep = endAngle - startAngle
    const count = Math.max(3, Math.ceil(Math.abs(sweep) / TWO_PI * segments))
    for (let i = 0; i < count; i += 1) {
      const a0 = startAngle + sweep * (i / count)
      const a1 = startAngle + sweep * ((i + 1) / count)
      const p0x = this.sx(x + Math.cos(a0) * inner)
      const p0y = this.sy(y + Math.sin(a0) * inner)
      const p1x = this.sx(x + Math.cos(a0) * outer)
      const p1y = this.sy(y + Math.sin(a0) * outer)
      const p2x = this.sx(x + Math.cos(a1) * outer)
      const p2y = this.sy(y + Math.sin(a1) * outer)
      const p3x = this.sx(x + Math.cos(a1) * inner)
      const p3y = this.sy(y + Math.sin(a1) * inner)
      this.pushTriangle(p0x, p0y, p1x, p1y, p2x, p2y, rgba, alpha, alpha, alpha)
      this.pushTriangle(p0x, p0y, p2x, p2y, p3x, p3y, rgba, alpha, alpha, alpha)
    }
  }

  taperedTrail(
    headX: number,
    headY: number,
    directionX: number,
    directionY: number,
    length: number,
    width: number,
    color: string | Rgba,
    alpha: number,
  ) {
    const mag = Math.hypot(directionX, directionY)
    if (mag <= 0.0001 || length <= 0) return
    const dx = directionX / mag
    const dy = directionY / mag
    const nx = -dy
    const ny = dx
    const tailX = headX - dx * length
    const tailY = headY - dy * length
    const headHalf = width * 0.5
    const tailHalf = width * 0.1
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    const h0x = this.sx(headX + nx * headHalf)
    const h0y = this.sy(headY + ny * headHalf)
    const h1x = this.sx(headX - nx * headHalf)
    const h1y = this.sy(headY - ny * headHalf)
    const t0x = this.sx(tailX + nx * tailHalf)
    const t0y = this.sy(tailY + ny * tailHalf)
    const t1x = this.sx(tailX - nx * tailHalf)
    const t1y = this.sy(tailY - ny * tailHalf)
    this.pushTriangle(t0x, t0y, h0x, h0y, h1x, h1y, rgba, 0, alpha, alpha)
    this.pushTriangle(t0x, t0y, h1x, h1y, t1x, t1y, rgba, 0, alpha, 0)
  }

  sprite(
    id: string,
    x: number,
    y: number,
    height: number,
    options: {
      anchorX?: number
      anchorY?: number
      rotation?: number
      flipY?: boolean
      tint?: string | Rgba
      alpha?: number
      width?: number
    } = {},
  ) {
    const canonical = canonicalWebGLSpriteId(id)
    const entry = this.atlas.get(canonical)
    if (!entry) return false
    const width = options.width ?? height * entry.imageWidth / entry.imageHeight
    this.spriteRegion(canonical, 0, 0, entry.imageWidth, entry.imageHeight, x, y, width, height, options)
    return true
  }

  spriteRegion(
    id: string,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    x: number,
    y: number,
    width: number,
    height: number,
    options: {
      anchorX?: number
      anchorY?: number
      rotation?: number
      flipY?: boolean
      tint?: string | Rgba
      alpha?: number
    } = {},
  ) {
    const entry = this.atlas.get(canonicalWebGLSpriteId(id))
    if (!entry) return false
    this.useTexture(this.atlasTexture)
    const anchorX = options.anchorX ?? 0.5
    const anchorY = options.anchorY ?? 0.5
    const rotation = options.rotation ?? 0
    const flipY = options.flipY ?? false
    const alpha = options.alpha ?? 1
    const tint = options.tint ?? WHITE
    const color = typeof tint === "string" ? parseWebGLColor(tint) : tint
    const left = -width * anchorX
    const top = -height * anchorY
    const right = left + width
    const bottom = top + height
    const c = Math.cos(rotation)
    const s = Math.sin(rotation)
    const point = (lx: number, ly: number) => {
      const fy = flipY ? -ly : ly
      return {
        x: this.sx(x + lx * c - fy * s),
        y: this.sy(y + lx * s + fy * c),
      }
    }
    const p0 = point(left, top)
    const p1 = point(right, top)
    const p2 = point(right, bottom)
    const p3 = point(left, bottom)
    const u0 = (entry.x + sx) / this.atlasWidth
    const u1 = (entry.x + sx + sw) / this.atlasWidth
    const v0 = (entry.y + sy) / this.atlasHeight
    const v1 = (entry.y + sy + sh) / this.atlasHeight
    this.pushVertex(p0.x, p0.y, u0, v0, color, alpha)
    this.pushVertex(p1.x, p1.y, u1, v0, color, alpha)
    this.pushVertex(p2.x, p2.y, u1, v1, color, alpha)
    this.pushVertex(p0.x, p0.y, u0, v0, color, alpha)
    this.pushVertex(p2.x, p2.y, u1, v1, color, alpha)
    this.pushVertex(p3.x, p3.y, u0, v1, color, alpha)
    return true
  }

  text(
    text: string,
    x: number,
    y: number,
    pixelSize: number,
    color: string | Rgba,
    alpha = 1,
    align: "left" | "center" | "right" = "left",
  ) {
    const glyphWidth = 3 * pixelSize
    const advance = 4 * pixelSize
    const totalWidth = text.length > 0 ? text.length * advance - pixelSize : 0
    let cursor = align === "center" ? x - totalWidth * 0.5 : align === "right" ? x - totalWidth : x
    for (const char of text) {
      const glyph = FONT[char]
      if (glyph) {
        for (let row = 0; row < glyph.length; row += 1) {
          for (let col = 0; col < glyph[row].length; col += 1) {
            if (glyph[row][col] === "1") {
              this.rect(cursor + col * pixelSize, y + row * pixelSize, pixelSize, pixelSize, color, alpha)
            }
          }
        }
      }
      cursor += advance
    }
    return { width: Math.max(glyphWidth, totalWidth), height: 5 * pixelSize }
  }

  beginCircleClip(x: number, y: number, radius: number) {
    this.flush()
    const gl = this.gl
    gl.enable(gl.STENCIL_TEST)
    gl.clearStencil(0)
    gl.stencilMask(0xff)
    gl.clear(gl.STENCIL_BUFFER_BIT)
    gl.colorMask(false, false, false, false)
    gl.stencilFunc(gl.ALWAYS, 1, 0xff)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.REPLACE)
    this.circle(x, y, radius, WHITE, 1, 48)
    this.flush()
    gl.colorMask(true, true, true, true)
    gl.stencilMask(0x00)
    gl.stencilFunc(gl.EQUAL, 1, 0xff)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
  }

  endClip() {
    this.flush()
    const gl = this.gl
    gl.stencilMask(0xff)
    gl.disable(gl.STENCIL_TEST)
  }

  createRenderTarget(width: number, height: number): WebGLRenderTarget {
    const gl = this.gl
    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    if (!texture || !framebuffer) throw new Error("Unable to create WebGL render target")
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("WebGL framebuffer is incomplete")
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentFramebuffer)
    const target = { framebuffer, texture, width, height }
    this.renderTargets.add(target)
    return target
  }

  destroyRenderTarget(target: WebGLRenderTarget) {
    this.flush()
    this.gl.deleteFramebuffer(target.framebuffer)
    this.gl.deleteTexture(target.texture)
    this.renderTargets.delete(target)
  }

  withRenderTarget(target: WebGLRenderTarget, clear: boolean, render: () => void) {
    this.flush()
    const gl = this.gl
    const previousFramebuffer = this.currentFramebuffer
    const previousWidth = this.resolutionWidth
    const previousHeight = this.resolutionHeight
    const previousView = this.view
    const previousTexture = this.currentTexture
    const stencilEnabled = gl.isEnabled(gl.STENCIL_TEST)
    this.currentFramebuffer = target.framebuffer
    this.resolutionWidth = target.width
    this.resolutionHeight = target.height
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.viewport(0, 0, target.width, target.height)
    if (clear) {
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.disable(gl.STENCIL_TEST)
    this.useScreenView()
    this.currentTexture = this.atlasTexture
    render()
    this.flush()
    this.currentFramebuffer = previousFramebuffer
    this.resolutionWidth = previousWidth
    this.resolutionHeight = previousHeight
    this.view = previousView
    this.currentTexture = previousTexture
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer)
    gl.viewport(0, 0, previousWidth, previousHeight)
    if (stencilEnabled) {
      gl.enable(gl.STENCIL_TEST)
      gl.stencilMask(0x00)
      gl.stencilFunc(gl.EQUAL, 1, 0xff)
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
    } else {
      gl.disable(gl.STENCIL_TEST)
    }
  }

  drawRenderTarget(
    target: WebGLRenderTarget,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    alpha = 1,
  ) {
    this.useTexture(target.texture)
    const p0x = this.sx(dx)
    const p0y = this.sy(dy)
    const p1x = this.sx(dx + dw)
    const p1y = this.sy(dy)
    const p2x = this.sx(dx + dw)
    const p2y = this.sy(dy + dh)
    const p3x = this.sx(dx)
    const p3y = this.sy(dy + dh)
    const u0 = sx / target.width
    const u1 = (sx + sw) / target.width
    // FBO logical top is texture v=1.
    const vTop = 1 - sy / target.height
    const vBottom = 1 - (sy + sh) / target.height
    this.pushVertex(p0x, p0y, u0, vTop, WHITE, alpha)
    this.pushVertex(p1x, p1y, u1, vTop, WHITE, alpha)
    this.pushVertex(p2x, p2y, u1, vBottom, WHITE, alpha)
    this.pushVertex(p0x, p0y, u0, vTop, WHITE, alpha)
    this.pushVertex(p2x, p2y, u1, vBottom, WHITE, alpha)
    this.pushVertex(p3x, p3y, u0, vBottom, WHITE, alpha)
    this.flush()
    this.currentTexture = this.atlasTexture
  }

  radialOverlay(
    centerX: number,
    centerY: number,
    innerRadius: number,
    outerRadius: number,
    color: string | Rgba,
    alpha = 1,
    power = 1,
  ) {
    this.flush()
    const gl = this.gl
    const rgba = typeof color === "string" ? parseWebGLColor(color) : color
    gl.useProgram(this.radialProgram)
    gl.uniform2f(this.radialResolution, this.resolutionWidth, this.resolutionHeight)
    gl.uniform2f(this.radialCenter, centerX, this.resolutionHeight - centerY)
    gl.uniform1f(this.radialInner, innerRadius)
    gl.uniform1f(this.radialOuter, outerRadius)
    gl.uniform1f(this.radialPower, power)
    gl.uniform4f(this.radialColor, rgba[0], rgba[1], rgba[2], rgba[3] * alpha)
    gl.drawArrays(gl.TRIANGLES, 0, 6)
  }
}
