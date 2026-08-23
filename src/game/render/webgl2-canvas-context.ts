export type Rgba = readonly [number, number, number, number]

type Matrix = readonly [number, number, number, number, number, number]

type BlendMode = "source-over" | "lighter"

interface SavedState {
  transform: Matrix
  fillStyle: unknown
  strokeStyle: unknown
  globalAlpha: number
  lineWidth: number
  lineCap: CanvasLineCap
  blendMode: BlendMode
  imageSmoothingEnabled: boolean
  font: string
  textAlign: CanvasTextAlign
  textBaseline: CanvasTextBaseline
  clipDepth: number
}

interface PathPoint {
  x: number
  y: number
  move?: boolean
}

export interface WebGLRenderTarget {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

interface RadialStop {
  offset: number
  color: Rgba
}

class WebGLRadialGradient {
  readonly kind = "radial-gradient"
  readonly stops: RadialStop[] = []

  constructor(
    public readonly x0: number,
    public readonly y0: number,
    public readonly r0: number,
    public readonly x1: number,
    public readonly y1: number,
    public readonly r1: number,
  ) {}

  addColorStop(offset: number, color: string) {
    this.stops.push({ offset: Math.max(0, Math.min(1, offset)), color: parseColor(color) })
    this.stops.sort((a, b) => a.offset - b.offset)
  }
}

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0]
const TWO_PI = Math.PI * 2
const COLOR_CACHE = new Map<string, Rgba>()

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const parseHex = (value: string): Rgba | null => {
  const raw = value.slice(1)
  if (raw.length === 3 || raw.length === 4) {
    const r = Number.parseInt(raw[0] + raw[0], 16) / 255
    const g = Number.parseInt(raw[1] + raw[1], 16) / 255
    const b = Number.parseInt(raw[2] + raw[2], 16) / 255
    const a = raw.length === 4 ? Number.parseInt(raw[3] + raw[3], 16) / 255 : 1
    return [r, g, b, a]
  }
  if (raw.length === 6 || raw.length === 8) {
    const r = Number.parseInt(raw.slice(0, 2), 16) / 255
    const g = Number.parseInt(raw.slice(2, 4), 16) / 255
    const b = Number.parseInt(raw.slice(4, 6), 16) / 255
    const a = raw.length === 8 ? Number.parseInt(raw.slice(6, 8), 16) / 255 : 1
    return [r, g, b, a]
  }
  return null
}

export const parseColor = (input: string): Rgba => {
  const cached = COLOR_CACHE.get(input)
  if (cached) return cached

  const value = input.trim().toLowerCase()
  let result: Rgba = [1, 1, 1, 1]
  if (value.startsWith("#")) {
    result = parseHex(value) ?? result
  } else {
    const match = value.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
    if (match) {
      result = [
        clamp01(Number(match[1]) / 255),
        clamp01(Number(match[2]) / 255),
        clamp01(Number(match[3]) / 255),
        match[4] === undefined ? 1 : clamp01(Number(match[4])),
      ]
    } else if (value === "transparent") {
      result = [0, 0, 0, 0]
    } else if (value === "white") {
      result = [1, 1, 1, 1]
    } else if (value === "black") {
      result = [0, 0, 0, 1]
    }
  }
  COLOR_CACHE.set(input, result)
  return result
}

const multiply = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
]

const transformPoint = (matrix: Matrix, x: number, y: number) => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
})

const effectiveScale = (matrix: Matrix) => {
  const x = Math.hypot(matrix[0], matrix[1])
  const y = Math.hypot(matrix[2], matrix[3])
  return Math.max(0.0001, (x + y) * 0.5)
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

const SOLID_VERTEX = `#version 300 es
layout(location=0) in vec2 aPosition;
layout(location=1) in vec4 aColor;
uniform vec2 uResolution;
out vec4 vColor;
void main() {
  vec2 zeroToOne = aPosition / uResolution;
  vec2 clip = zeroToOne * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  vColor = aColor;
}`

const SOLID_FRAGMENT = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vColor; }`

const TEXTURE_VERTEX = `#version 300 es
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

const TEXTURE_FRAGMENT = `#version 300 es
precision mediump float;
uniform sampler2D uTexture;
in vec2 vUv;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec4 texel = texture(uTexture, vUv);
  if (texel.a <= 0.001) discard;
  outColor = texel * vColor;
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
  ".": ["000", "000", "000", "000", "010"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
  "m": ["00000", "11011", "10101", "10101", "10101"],
  "k": ["100", "101", "110", "101", "101"],
}

class WebGL2CanvasContext {
  readonly canvas: HTMLCanvasElement
  readonly gl: WebGL2RenderingContext

  fillStyle: unknown = "#000000"
  strokeStyle: unknown = "#000000"
  globalAlpha = 1
  lineWidth = 1
  lineCap: CanvasLineCap = "butt"
  imageSmoothingEnabled = false
  font = "10px monospace"
  textAlign: CanvasTextAlign = "start"
  textBaseline: CanvasTextBaseline = "alphabetic"

  private currentTransform: Matrix = IDENTITY
  private stack: SavedState[] = []
  private path: PathPoint[] = []
  private clipDepth = 0
  private blendMode: BlendMode = "source-over"
  private resolutionWidth = 1
  private resolutionHeight = 1
  private activeFramebuffer: WebGLFramebuffer | null = null

  private solidProgram: WebGLProgram
  private solidVao: WebGLVertexArrayObject
  private solidBuffer: WebGLBuffer
  private solidResolution: WebGLUniformLocation
  private solidData = new Float32Array(6 * 4096)
  private solidFloats = 0

  private textureProgram: WebGLProgram
  private textureVao: WebGLVertexArrayObject
  private textureBuffer: WebGLBuffer
  private textureResolution: WebGLUniformLocation
  private textureData = new Float32Array(8 * 2048)
  private textureFloats = 0
  private textureBatchTexture: WebGLTexture | null = null

  private imageTextures = new WeakMap<object, WebGLTexture>()
  private imageTextureSizes = new WeakMap<object, { width: number; height: number }>()

  constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.canvas = canvas
    this.gl = gl

    this.solidProgram = createProgram(gl, SOLID_VERTEX, SOLID_FRAGMENT)
    const solidVao = gl.createVertexArray()
    const solidBuffer = gl.createBuffer()
    const solidResolution = gl.getUniformLocation(this.solidProgram, "uResolution")
    if (!solidVao || !solidBuffer || !solidResolution) throw new Error("Unable to initialize solid WebGL batch")
    this.solidVao = solidVao
    this.solidBuffer = solidBuffer
    this.solidResolution = solidResolution
    gl.bindVertexArray(solidVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, solidBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 6 * 4, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 6 * 4, 2 * 4)

    this.textureProgram = createProgram(gl, TEXTURE_VERTEX, TEXTURE_FRAGMENT)
    const textureVao = gl.createVertexArray()
    const textureBuffer = gl.createBuffer()
    const textureResolution = gl.getUniformLocation(this.textureProgram, "uResolution")
    if (!textureVao || !textureBuffer || !textureResolution) throw new Error("Unable to initialize texture WebGL batch")
    this.textureVao = textureVao
    this.textureBuffer = textureBuffer
    this.textureResolution = textureResolution
    gl.bindVertexArray(textureVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, textureBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8 * 4, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 8 * 4, 2 * 4)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 8 * 4, 4 * 4)

    gl.bindVertexArray(null)
    gl.enable(gl.BLEND)
    this.applyBlendMode()
  }

  get globalCompositeOperation() {
    return this.blendMode
  }

  set globalCompositeOperation(value: string) {
    const next: BlendMode = value === "lighter" ? "lighter" : "source-over"
    if (next === this.blendMode) return
    this.flush()
    this.blendMode = next
    this.applyBlendMode()
  }

  beginFrame() {
    this.flush()
    this.activeFramebuffer = null
    this.resolutionWidth = Math.max(1, this.canvas.width)
    this.resolutionHeight = Math.max(1, this.canvas.height)
    const { gl } = this
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.resolutionWidth, this.resolutionHeight)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.CULL_FACE)
    gl.enable(gl.BLEND)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clearStencil(0)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT)
    this.resetState()
  }

  endFrame() {
    this.flush()
  }

  private resetState() {
    this.currentTransform = IDENTITY
    this.stack.length = 0
    this.path.length = 0
    this.clipDepth = 0
    this.fillStyle = "#000000"
    this.strokeStyle = "#000000"
    this.globalAlpha = 1
    this.lineWidth = 1
    this.lineCap = "butt"
    this.blendMode = "source-over"
    this.imageSmoothingEnabled = false
    this.font = "10px monospace"
    this.textAlign = "start"
    this.textBaseline = "alphabetic"
    this.applyBlendMode()
  }

  private applyBlendMode() {
    const { gl } = this
    if (this.blendMode === "lighter") {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE)
    } else {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    }
  }

  private ensureSolidCapacity(extraFloats: number) {
    const needed = this.solidFloats + extraFloats
    if (needed <= this.solidData.length) return
    let size = this.solidData.length
    while (size < needed) size *= 2
    const next = new Float32Array(size)
    next.set(this.solidData.subarray(0, this.solidFloats))
    this.solidData = next
  }

  private ensureTextureCapacity(extraFloats: number) {
    const needed = this.textureFloats + extraFloats
    if (needed <= this.textureData.length) return
    let size = this.textureData.length
    while (size < needed) size *= 2
    const next = new Float32Array(size)
    next.set(this.textureData.subarray(0, this.textureFloats))
    this.textureData = next
  }

  private pushSolidVertex(x: number, y: number, color: Rgba) {
    this.ensureSolidCapacity(6)
    const i = this.solidFloats
    this.solidData[i] = x
    this.solidData[i + 1] = y
    this.solidData[i + 2] = color[0]
    this.solidData[i + 3] = color[1]
    this.solidData[i + 4] = color[2]
    this.solidData[i + 5] = color[3] * this.globalAlpha
    this.solidFloats += 6
  }

  private pushTriangle(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    color: Rgba,
  ) {
    this.flushTexture()
    this.pushSolidVertex(a.x, a.y, color)
    this.pushSolidVertex(b.x, b.y, color)
    this.pushSolidVertex(c.x, c.y, color)
  }

  private flushSolid() {
    if (this.solidFloats <= 0) return
    const { gl } = this
    gl.useProgram(this.solidProgram)
    gl.uniform2f(this.solidResolution, this.resolutionWidth, this.resolutionHeight)
    gl.bindVertexArray(this.solidVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.solidBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.solidFloats * 4, gl.STREAM_DRAW)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.solidData, 0, this.solidFloats)
    gl.drawArrays(gl.TRIANGLES, 0, this.solidFloats / 6)
    this.solidFloats = 0
  }

  private flushTexture() {
    if (this.textureFloats <= 0 || !this.textureBatchTexture) return
    const { gl } = this
    gl.useProgram(this.textureProgram)
    gl.uniform2f(this.textureResolution, this.resolutionWidth, this.resolutionHeight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.textureBatchTexture)
    gl.bindVertexArray(this.textureVao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.textureBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.textureFloats * 4, gl.STREAM_DRAW)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.textureData, 0, this.textureFloats)
    gl.drawArrays(gl.TRIANGLES, 0, this.textureFloats / 8)
    this.textureFloats = 0
    this.textureBatchTexture = null
  }

  flush() {
    this.flushSolid()
    this.flushTexture()
  }

  private styleColor(style: unknown): Rgba {
    if (typeof style === "string") return parseColor(style)
    return [1, 1, 1, 1]
  }

  private quadPoints(x: number, y: number, width: number, height: number) {
    return [
      transformPoint(this.currentTransform, x, y),
      transformPoint(this.currentTransform, x + width, y),
      transformPoint(this.currentTransform, x + width, y + height),
      transformPoint(this.currentTransform, x, y + height),
    ] as const
  }

  private fillQuad(points: readonly { x: number; y: number }[], color: Rgba) {
    this.pushTriangle(points[0], points[1], points[2], color)
    this.pushTriangle(points[0], points[2], points[3], color)
  }

  save() {
    this.stack.push({
      transform: this.currentTransform,
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      globalAlpha: this.globalAlpha,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      blendMode: this.blendMode,
      imageSmoothingEnabled: this.imageSmoothingEnabled,
      font: this.font,
      textAlign: this.textAlign,
      textBaseline: this.textBaseline,
      clipDepth: this.clipDepth,
    })
  }

  restore() {
    const state = this.stack.pop()
    if (!state) return
    const clipChanged = state.clipDepth !== this.clipDepth
    this.currentTransform = state.transform
    this.fillStyle = state.fillStyle
    this.strokeStyle = state.strokeStyle
    this.globalAlpha = state.globalAlpha
    this.lineWidth = state.lineWidth
    this.lineCap = state.lineCap
    this.imageSmoothingEnabled = state.imageSmoothingEnabled
    this.font = state.font
    this.textAlign = state.textAlign
    this.textBaseline = state.textBaseline
    if (state.blendMode !== this.blendMode) {
      this.flush()
      this.blendMode = state.blendMode
      this.applyBlendMode()
    }
    if (clipChanged) {
      this.flush()
      this.clipDepth = state.clipDepth
      this.applyStencilDepth()
    }
  }

  translate(x: number, y: number) {
    this.currentTransform = multiply(this.currentTransform, [1, 0, 0, 1, x, y])
  }

  scale(x: number, y: number) {
    this.currentTransform = multiply(this.currentTransform, [x, 0, 0, y, 0, 0])
  }

  rotate(angle: number) {
    const c = Math.cos(angle)
    const s = Math.sin(angle)
    this.currentTransform = multiply(this.currentTransform, [c, s, -s, c, 0, 0])
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number) {
    this.currentTransform = multiply(this.currentTransform, [a, b, c, d, e, f])
  }

  setTransform(a: number | DOMMatrix2DInit, b?: number, c?: number, d?: number, e?: number, f?: number) {
    if (typeof a === "number") {
      this.currentTransform = [a, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0]
      return
    }
    this.currentTransform = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0]
  }

  resetTransform() {
    this.currentTransform = IDENTITY
  }

  fillRect(x: number, y: number, width: number, height: number) {
    if (this.fillStyle instanceof WebGLRadialGradient) {
      this.fillRadialGradientRect(x, y, width, height, this.fillStyle)
      return
    }
    this.fillQuad(this.quadPoints(x, y, width, height), this.styleColor(this.fillStyle))
  }

  strokeRect(x: number, y: number, width: number, height: number) {
    const points = this.quadPoints(x, y, width, height)
    const color = this.styleColor(this.strokeStyle)
    const line = this.lineWidth * effectiveScale(this.currentTransform)
    this.strokeSegment(points[0], points[1], line, color)
    this.strokeSegment(points[1], points[2], line, color)
    this.strokeSegment(points[2], points[3], line, color)
    this.strokeSegment(points[3], points[0], line, color)
  }

  clearRect(x: number, y: number, width: number, height: number) {
    this.flush()
    const full = x === 0 && y === 0 && width >= this.resolutionWidth && height >= this.resolutionHeight
    if (full) {
      this.gl.clearColor(0, 0, 0, 0)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
      return
    }
    const prev = this.blendMode
    this.gl.enable(this.gl.SCISSOR_TEST)
    const p0 = transformPoint(this.currentTransform, x, y)
    const p1 = transformPoint(this.currentTransform, x + width, y + height)
    const left = Math.floor(Math.min(p0.x, p1.x))
    const top = Math.floor(Math.min(p0.y, p1.y))
    const right = Math.ceil(Math.max(p0.x, p1.x))
    const bottom = Math.ceil(Math.max(p0.y, p1.y))
    this.gl.scissor(left, this.resolutionHeight - bottom, Math.max(0, right - left), Math.max(0, bottom - top))
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    this.gl.disable(this.gl.SCISSOR_TEST)
    this.blendMode = prev
    this.applyBlendMode()
  }

  beginPath() {
    this.path.length = 0
  }

  moveTo(x: number, y: number) {
    const point = transformPoint(this.currentTransform, x, y)
    this.path.push({ ...point, move: true })
  }

  lineTo(x: number, y: number) {
    this.path.push(transformPoint(this.currentTransform, x, y))
  }

  closePath() {
    const start = this.findCurrentSubpathStart()
    const end = this.path[this.path.length - 1]
    if (start && end && (start.x !== end.x || start.y !== end.y)) {
      this.path.push({ x: start.x, y: start.y })
    }
  }

  private findCurrentSubpathStart() {
    for (let i = this.path.length - 1; i >= 0; i -= 1) {
      if (this.path[i].move || i === 0) return this.path[i]
    }
    return null
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false) {
    let sweep = endAngle - startAngle
    if (!counterclockwise && sweep < 0) sweep += TWO_PI
    if (counterclockwise && sweep > 0) sweep -= TWO_PI
    if (Math.abs(sweep) > TWO_PI) sweep = Math.sign(sweep) * TWO_PI
    const pixelRadius = Math.max(1, radius * effectiveScale(this.currentTransform))
    const segments = Math.max(
      8,
      Math.min(96, Math.ceil((Math.abs(sweep) / TWO_PI) * Math.max(12, Math.sqrt(pixelRadius) * 4))),
    )
    for (let i = 0; i <= segments; i += 1) {
      const angle = startAngle + sweep * (i / segments)
      const p = transformPoint(this.currentTransform, x + Math.cos(angle) * radius, y + Math.sin(angle) * radius)
      if (i === 0 && this.path.length === 0) this.path.push({ ...p, move: true })
      else this.path.push(p)
    }
  }

  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    endAngle: number,
    counterclockwise = false,
  ) {
    let sweep = endAngle - startAngle
    if (!counterclockwise && sweep < 0) sweep += TWO_PI
    if (counterclockwise && sweep > 0) sweep -= TWO_PI
    const pixelRadius = Math.max(1, Math.max(radiusX, radiusY) * effectiveScale(this.currentTransform))
    const segments = Math.max(
      10,
      Math.min(96, Math.ceil((Math.abs(sweep) / TWO_PI) * Math.max(14, Math.sqrt(pixelRadius) * 4))),
    )
    const cr = Math.cos(rotation)
    const sr = Math.sin(rotation)
    for (let i = 0; i <= segments; i += 1) {
      const angle = startAngle + sweep * (i / segments)
      const lx = Math.cos(angle) * radiusX
      const ly = Math.sin(angle) * radiusY
      const p = transformPoint(this.currentTransform, x + lx * cr - ly * sr, y + lx * sr + ly * cr)
      if (i === 0 && this.path.length === 0) this.path.push({ ...p, move: true })
      else this.path.push(p)
    }
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
    const last = this.path[this.path.length - 1]
    if (!last) {
      this.moveTo(x, y)
      return
    }
    const control = transformPoint(this.currentTransform, cpx, cpy)
    const end = transformPoint(this.currentTransform, x, y)
    const start = { x: last.x, y: last.y }
    const segments = 10
    for (let i = 1; i <= segments; i += 1) {
      const t = i / segments
      const inv = 1 - t
      this.path.push({
        x: inv * inv * start.x + 2 * inv * t * control.x + t * t * end.x,
        y: inv * inv * start.y + 2 * inv * t * control.y + t * t * end.y,
      })
    }
  }

  roundRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radii: number | DOMPointInit | (number | DOMPointInit)[],
  ) {
    const radiusValue = Array.isArray(radii) ? radii[0] : radii
    const radius = typeof radiusValue === "number" ? radiusValue : radiusValue?.x ?? 0
    const r = Math.min(Math.min(Math.abs(width), Math.abs(height)) * 0.5, Math.max(0, radius))
    this.moveTo(x + r, y)
    this.lineTo(x + width - r, y)
    this.arc(x + width - r, y + r, r, -Math.PI / 2, 0)
    this.lineTo(x + width, y + height - r)
    this.arc(x + width - r, y + height - r, r, 0, Math.PI / 2)
    this.lineTo(x + r, y + height)
    this.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI)
    this.lineTo(x, y + r)
    this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5)
    this.closePath()
  }

  fill() {
    const color = this.styleColor(this.fillStyle)
    const subpaths = this.splitSubpaths()
    for (const points of subpaths) {
      if (points.length < 3) continue
      const first = points[0]
      for (let i = 1; i < points.length - 1; i += 1) {
        this.pushTriangle(first, points[i], points[i + 1], color)
      }
    }
  }

  stroke() {
    const color = this.styleColor(this.strokeStyle)
    const line = this.lineWidth * effectiveScale(this.currentTransform)
    const subpaths = this.splitSubpaths()
    for (const points of subpaths) {
      for (let i = 0; i < points.length - 1; i += 1) {
        this.strokeSegment(points[i], points[i + 1], line, color)
      }
    }
  }

  private splitSubpaths() {
    const result: { x: number; y: number }[][] = []
    let current: { x: number; y: number }[] = []
    for (const point of this.path) {
      if (point.move && current.length > 0) {
        result.push(current)
        current = []
      }
      current.push({ x: point.x, y: point.y })
    }
    if (current.length > 0) result.push(current)
    return result
  }

  private strokeSegment(a: { x: number; y: number }, b: { x: number; y: number }, width: number, color: Rgba) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (length <= 0.0001) return
    const nx = (-dy / length) * width * 0.5
    const ny = (dx / length) * width * 0.5
    const p0 = { x: a.x + nx, y: a.y + ny }
    const p1 = { x: b.x + nx, y: b.y + ny }
    const p2 = { x: b.x - nx, y: b.y - ny }
    const p3 = { x: a.x - nx, y: a.y - ny }
    this.fillQuad([p0, p1, p2, p3], color)
    if (this.lineCap === "round") {
      this.fillCircleScreen(a.x, a.y, width * 0.5, color)
      this.fillCircleScreen(b.x, b.y, width * 0.5, color)
    }
  }

  private fillCircleScreen(x: number, y: number, radius: number, color: Rgba) {
    const segments = Math.max(8, Math.ceil(radius * 0.6))
    const center = { x, y }
    for (let i = 0; i < segments; i += 1) {
      const a0 = (i / segments) * TWO_PI
      const a1 = ((i + 1) / segments) * TWO_PI
      this.pushTriangle(
        center,
        { x: x + Math.cos(a0) * radius, y: y + Math.sin(a0) * radius },
        { x: x + Math.cos(a1) * radius, y: y + Math.sin(a1) * radius },
        color,
      )
    }
  }

  clip() {
    const subpaths = this.splitSubpaths()
    if (subpaths.length <= 0) return
    this.flush()
    const { gl } = this
    gl.enable(gl.STENCIL_TEST)
    gl.colorMask(false, false, false, false)
    gl.stencilMask(0xff)
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR)
    const oldAlpha = this.globalAlpha
    const oldFill = this.fillStyle
    this.globalAlpha = 1
    this.fillStyle = "#ffffff"
    for (const points of subpaths) {
      if (points.length < 3) continue
      const first = points[0]
      for (let i = 1; i < points.length - 1; i += 1) this.pushTriangle(first, points[i], points[i + 1], [1, 1, 1, 1])
    }
    this.flushSolid()
    this.fillStyle = oldFill
    this.globalAlpha = oldAlpha
    gl.colorMask(true, true, true, true)
    this.clipDepth += 1
    this.applyStencilDepth()
  }

  private applyStencilDepth() {
    const { gl } = this
    if (this.clipDepth <= 0) {
      gl.stencilMask(0xff)
      gl.clearStencil(0)
      gl.clear(gl.STENCIL_BUFFER_BIT)
      gl.disable(gl.STENCIL_TEST)
      return
    }
    gl.enable(gl.STENCIL_TEST)
    gl.stencilMask(0x00)
    gl.stencilFunc(gl.EQUAL, this.clipDepth, 0xff)
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP)
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
    const p0 = transformPoint(this.currentTransform, x0, y0)
    const p1 = transformPoint(this.currentTransform, x1, y1)
    const scale = effectiveScale(this.currentTransform)
    return new WebGLRadialGradient(p0.x, p0.y, r0 * scale, p1.x, p1.y, r1 * scale)
  }

  private fillRadialGradientRect(
    _x: number,
    _y: number,
    _width: number,
    _height: number,
    gradient: WebGLRadialGradient,
  ) {
    const stops = gradient.stops.length > 0 ? gradient.stops : [{ offset: 0, color: [1, 1, 1, 1] as Rgba }]
    const innerRadius = Math.max(0, gradient.r0)
    const outerRadius = Math.max(innerRadius + 0.001, gradient.r1)
    const center = { x: gradient.x1, y: gradient.y1 }
    const segments = 48
    const rings = 24
    const colorAt = (t: number): Rgba => {
      if (t <= stops[0].offset) return stops[0].color
      if (t >= stops[stops.length - 1].offset) return stops[stops.length - 1].color
      let left = stops[0]
      let right = stops[stops.length - 1]
      for (let i = 1; i < stops.length; i += 1) {
        if (stops[i].offset >= t) {
          left = stops[i - 1]
          right = stops[i]
          break
        }
      }
      const span = Math.max(0.0001, right.offset - left.offset)
      const u = clamp01((t - left.offset) / span)
      return [
        left.color[0] + (right.color[0] - left.color[0]) * u,
        left.color[1] + (right.color[1] - left.color[1]) * u,
        left.color[2] + (right.color[2] - left.color[2]) * u,
        left.color[3] + (right.color[3] - left.color[3]) * u,
      ]
    }

    for (let ring = 0; ring < rings; ring += 1) {
      const t0 = ring / rings
      const t1 = (ring + 1) / rings
      const radius0 = innerRadius + (outerRadius - innerRadius) * t0
      const radius1 = innerRadius + (outerRadius - innerRadius) * t1
      const color = colorAt((t0 + t1) * 0.5)
      if (color[3] <= 0.0001) continue
      for (let i = 0; i < segments; i += 1) {
        const a0 = (i / segments) * TWO_PI
        const a1 = ((i + 1) / segments) * TWO_PI
        const p00 = { x: center.x + Math.cos(a0) * radius0, y: center.y + Math.sin(a0) * radius0 }
        const p01 = { x: center.x + Math.cos(a1) * radius0, y: center.y + Math.sin(a1) * radius0 }
        const p10 = { x: center.x + Math.cos(a0) * radius1, y: center.y + Math.sin(a0) * radius1 }
        const p11 = { x: center.x + Math.cos(a1) * radius1, y: center.y + Math.sin(a1) * radius1 }
        this.pushTriangle(p00, p10, p11, color)
        this.pushTriangle(p00, p11, p01, color)
      }
    }
  }

  private textureForImage(image: CanvasImageSource) {
    const cached = this.imageTextures.get(image as object)
    if (cached) return cached
    const { gl } = this
    const texture = gl.createTexture()
    if (!texture) throw new Error("Unable to create image texture")
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image as TexImageSource)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
    this.imageTextures.set(image as object, texture)
    const dimensions = imageDimensions(image)
    this.imageTextureSizes.set(image as object, dimensions)
    return texture
  }

  drawImage(image: CanvasImageSource, ...args: number[]) {
    const dimensions = imageDimensions(image)
    let sx = 0
    let sy = 0
    let sw = dimensions.width
    let sh = dimensions.height
    let dx = 0
    let dy = 0
    let dw = dimensions.width
    let dh = dimensions.height
    if (args.length === 2) {
      ;[dx, dy] = args
    } else if (args.length === 4) {
      ;[dx, dy, dw, dh] = args
    } else if (args.length === 8) {
      ;[sx, sy, sw, sh, dx, dy, dw, dh] = args
    } else {
      return
    }
    const texture = this.textureForImage(image)
    this.drawTexture(texture, dimensions.width, dimensions.height, sx, sy, sw, sh, dx, dy, dw, dh, [1, 1, 1, 1], false)
  }

  drawTintedImage(image: CanvasImageSource, x: number, y: number, width: number, height: number, tint: Rgba) {
    const dimensions = imageDimensions(image)
    const texture = this.textureForImage(image)
    this.drawTexture(
      texture,
      dimensions.width,
      dimensions.height,
      0,
      0,
      dimensions.width,
      dimensions.height,
      x,
      y,
      width,
      height,
      tint,
      false,
    )
  }

  private drawTexture(
    texture: WebGLTexture,
    textureWidth: number,
    textureHeight: number,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
    tint: Rgba,
    framebufferTexture: boolean,
  ) {
    this.flushSolid()
    if (this.textureBatchTexture && this.textureBatchTexture !== texture) this.flushTexture()
    this.textureBatchTexture = texture
    this.ensureTextureCapacity(8 * 6)
    const points = this.quadPoints(dx, dy, dw, dh)
    const u0 = sx / textureWidth
    const u1 = (sx + sw) / textureWidth
    let v0 = sy / textureHeight
    let v1 = (sy + sh) / textureHeight
    if (framebufferTexture) {
      v0 = 1 - v0
      v1 = 1 - v1
    }
    const color: Rgba = [tint[0], tint[1], tint[2], tint[3] * this.globalAlpha]
    const vertices = [
      [points[0], u0, v0],
      [points[1], u1, v0],
      [points[2], u1, v1],
      [points[0], u0, v0],
      [points[2], u1, v1],
      [points[3], u0, v1],
    ] as const
    for (const [point, u, v] of vertices) {
      const i = this.textureFloats
      this.textureData[i] = point.x
      this.textureData[i + 1] = point.y
      this.textureData[i + 2] = u
      this.textureData[i + 3] = v
      this.textureData[i + 4] = color[0]
      this.textureData[i + 5] = color[1]
      this.textureData[i + 6] = color[2]
      this.textureData[i + 7] = color[3]
      this.textureFloats += 8
    }
  }

  createRenderTarget(width: number, height: number): WebGLRenderTarget {
    const { gl } = this
    const texture = gl.createTexture()
    const framebuffer = gl.createFramebuffer()
    if (!texture || !framebuffer) throw new Error("Unable to create WebGL render target")
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Incomplete WebGL render target")
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.activeFramebuffer)
    return { framebuffer, texture, width, height }
  }

  destroyRenderTarget(target: WebGLRenderTarget) {
    this.flush()
    this.gl.deleteFramebuffer(target.framebuffer)
    this.gl.deleteTexture(target.texture)
  }

  withRenderTarget(target: WebGLRenderTarget, clear: boolean, draw: () => void) {
    this.flush()
    const oldFramebuffer = this.activeFramebuffer
    const oldWidth = this.resolutionWidth
    const oldHeight = this.resolutionHeight
    const oldTransform = this.currentTransform
    const oldClipDepth = this.clipDepth
    this.activeFramebuffer = target.framebuffer
    this.resolutionWidth = target.width
    this.resolutionHeight = target.height
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer)
    this.gl.viewport(0, 0, target.width, target.height)
    this.gl.disable(this.gl.STENCIL_TEST)
    this.clipDepth = 0
    this.currentTransform = IDENTITY
    if (clear) {
      this.gl.clearColor(0, 0, 0, 0)
      this.gl.clear(this.gl.COLOR_BUFFER_BIT)
    }
    draw()
    this.flush()
    this.activeFramebuffer = oldFramebuffer
    this.resolutionWidth = oldWidth
    this.resolutionHeight = oldHeight
    this.currentTransform = oldTransform
    this.clipDepth = oldClipDepth
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, oldFramebuffer)
    this.gl.viewport(0, 0, oldWidth, oldHeight)
    this.applyStencilDepth()
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
    this.drawTexture(
      target.texture,
      target.width,
      target.height,
      sx,
      sy,
      sw,
      sh,
      dx,
      dy,
      dw,
      dh,
      [1, 1, 1, alpha],
      true,
    )
  }

  fillText(text: string, x: number, y: number) {
    const pxMatch = this.font.match(/([\d.]+)px/)
    const height = pxMatch ? Number(pxMatch[1]) : 10
    const scale = Math.max(0.2, height / 5)
    const glyphWidths = [...text].map((char) => (FONT[char]?.[0]?.length ?? 3) * scale)
    const totalWidth = glyphWidths.reduce((sum, width) => sum + width + scale, 0) - (text.length > 0 ? scale : 0)
    let startX = x
    if (this.textAlign === "center") startX -= totalWidth * 0.5
    else if (this.textAlign === "right" || this.textAlign === "end") startX -= totalWidth
    let startY = y
    if (this.textBaseline === "middle") startY -= height * 0.5
    else if (this.textBaseline === "bottom" || this.textBaseline === "ideographic") startY -= height
    else if (this.textBaseline === "alphabetic") startY -= height * 0.8

    const oldTransform = this.currentTransform
    let cursor = startX
    for (const char of text) {
      const glyph = FONT[char]
      const width = (glyph?.[0]?.length ?? 3) * scale
      if (glyph) {
        for (let row = 0; row < glyph.length; row += 1) {
          for (let col = 0; col < glyph[row].length; col += 1) {
            if (glyph[row][col] === "1") this.fillRect(cursor + col * scale, startY + row * scale, scale, scale)
          }
        }
      }
      cursor += width + scale
    }
    this.currentTransform = oldTransform
  }

  measureText(text: string) {
    const pxMatch = this.font.match(/([\d.]+)px/)
    const height = pxMatch ? Number(pxMatch[1]) : 10
    const scale = Math.max(0.2, height / 5)
    const width = [...text].reduce((sum, char) => sum + (FONT[char]?.[0]?.length ?? 3) * scale + scale, 0)
    return { width: Math.max(0, width - scale) } as TextMetrics
  }
}

const imageDimensions = (image: CanvasImageSource) => {
  if (typeof HTMLImageElement !== "undefined" && image instanceof HTMLImageElement) {
    return { width: image.naturalWidth || image.width || 1, height: image.naturalHeight || image.height || 1 }
  }
  if (typeof HTMLCanvasElement !== "undefined" && image instanceof HTMLCanvasElement) {
    return { width: image.width || 1, height: image.height || 1 }
  }
  if (typeof ImageBitmap !== "undefined" && image instanceof ImageBitmap) {
    return { width: image.width || 1, height: image.height || 1 }
  }
  const candidate = image as { width?: number; height?: number }
  return { width: candidate.width ?? 1, height: candidate.height ?? 1 }
}

const CONTEXTS = new WeakMap<object, WebGL2CanvasContext>()

const implFor = (context: CanvasRenderingContext2D) => {
  const impl = CONTEXTS.get(context as unknown as object)
  if (!impl) throw new Error("Canvas is not using the unified WebGL2 renderer")
  return impl
}

export const installWebGL2CanvasContext = (canvas: HTMLCanvasElement) => {
  const nativeGetContext = canvas.getContext.bind(canvas)
  const gl = nativeGetContext("webgl2", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }) as WebGL2RenderingContext | null
  if (!gl) throw new Error("WebGL2 context is not available")

  const impl = new WebGL2CanvasContext(canvas, gl)
  const facade = impl as unknown as CanvasRenderingContext2D
  CONTEXTS.set(facade as unknown as object, impl)

  Object.defineProperty(canvas, "getContext", {
    configurable: true,
    value: (contextId: string, ...args: unknown[]) => {
      if (contextId === "2d") return facade
      if (contextId === "webgl2") return gl
      return (nativeGetContext as (...nativeArgs: unknown[]) => RenderingContext | null)(contextId, ...args)
    },
  })
}

export const beginWebGLFrame = (context: CanvasRenderingContext2D) => implFor(context).beginFrame()
export const endWebGLFrame = (context: CanvasRenderingContext2D) => implFor(context).endFrame()
export const createWebGLRenderTarget = (context: CanvasRenderingContext2D, width: number, height: number) =>
  implFor(context).createRenderTarget(width, height)
export const destroyWebGLRenderTarget = (context: CanvasRenderingContext2D, target: WebGLRenderTarget) =>
  implFor(context).destroyRenderTarget(target)
export const withWebGLRenderTarget = (
  context: CanvasRenderingContext2D,
  target: WebGLRenderTarget,
  clear: boolean,
  draw: () => void,
) => implFor(context).withRenderTarget(target, clear, draw)
export const drawWebGLRenderTarget = (
  context: CanvasRenderingContext2D,
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
) => implFor(context).drawRenderTarget(target, sx, sy, sw, sh, dx, dy, dw, dh, alpha)
export const drawTintedWebGLImage = (
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  tint: Rgba,
) => implFor(context).drawTintedImage(image, x, y, width, height, tint)
export const getWebGL2RenderingContext = (context: CanvasRenderingContext2D) => implFor(context).gl
