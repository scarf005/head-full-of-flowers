import { VIEW_HEIGHT, VIEW_WIDTH } from "../world/constants.ts"
import { ensureGpuViewport, initFlowerGpuState } from "./flower-instanced-state.ts"
import { screenShakeChromaticAberrationAlpha } from "./chromatic-aberration.ts"

const CHROMATIC_ABERRATION_SOURCE_SCALE = 0.5

type ChromaticAberrationSourceBuffer = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
}

let chromaticAberrationSourceBuffer: ChromaticAberrationSourceBuffer | null = null

const ensureChromaticAberrationSourceBuffer = () => {
  if (typeof document === "undefined") {
    return null
  }

  const targetWidth = Math.max(1, Math.round(VIEW_WIDTH * CHROMATIC_ABERRATION_SOURCE_SCALE))
  const targetHeight = Math.max(1, Math.round(VIEW_HEIGHT * CHROMATIC_ABERRATION_SOURCE_SCALE))

  if (
    chromaticAberrationSourceBuffer &&
    chromaticAberrationSourceBuffer.canvas.width === targetWidth &&
    chromaticAberrationSourceBuffer.canvas.height === targetHeight
  ) {
    return chromaticAberrationSourceBuffer
  }

  const canvas = document.createElement("canvas")
  canvas.width = targetWidth
  canvas.height = targetHeight
  const sourceContext = canvas.getContext("2d")
  if (!sourceContext) {
    return null
  }

  sourceContext.imageSmoothingEnabled = true
  chromaticAberrationSourceBuffer = { canvas, context: sourceContext }
  return chromaticAberrationSourceBuffer
}

interface RenderChromaticAberrationArgs {
  context: CanvasRenderingContext2D
  shiftPx: number
}

export const renderChromaticAberrationPass = ({ context, shiftPx }: RenderChromaticAberrationArgs) => {
  const intensity = screenShakeChromaticAberrationAlpha(shiftPx)
  if (shiftPx <= 0.0001 || intensity <= 0.0001) {
    return false
  }

  const sourceBuffer = ensureChromaticAberrationSourceBuffer()
  if (!sourceBuffer) {
    return false
  }

  sourceBuffer.context.save()
  sourceBuffer.context.setTransform(1, 0, 0, 1, 0, 0)
  sourceBuffer.context.globalCompositeOperation = "copy"
  sourceBuffer.context.drawImage(context.canvas, 0, 0, sourceBuffer.canvas.width, sourceBuffer.canvas.height)
  sourceBuffer.context.restore()

  const state = initFlowerGpuState()
  if (!state) {
    return false
  }

  const { gl } = state
  if (state.canvas.width !== VIEW_WIDTH || state.canvas.height !== VIEW_HEIGHT) {
    state.canvas.width = VIEW_WIDTH
    state.canvas.height = VIEW_HEIGHT
  }

  ensureGpuViewport(state, VIEW_WIDTH, VIEW_HEIGHT)
  gl.disable(gl.BLEND)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, state.postProcessTexture)
  if (
    state.postProcessTextureWidth !== sourceBuffer.canvas.width ||
    state.postProcessTextureHeight !== sourceBuffer.canvas.height
  ) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      sourceBuffer.canvas.width,
      sourceBuffer.canvas.height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    state.postProcessTextureWidth = sourceBuffer.canvas.width
    state.postProcessTextureHeight = sourceBuffer.canvas.height
  }
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, sourceBuffer.canvas)

  gl.useProgram(state.postProcessProgram)
  gl.uniform2f(state.postProcessUniformResolution, sourceBuffer.canvas.width, sourceBuffer.canvas.height)
  gl.uniform1f(state.postProcessUniformShiftPx, shiftPx * CHROMATIC_ABERRATION_SOURCE_SCALE)
  gl.uniform1f(state.postProcessUniformIntensity, intensity)

  gl.bindVertexArray(state.postProcessVao)
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  gl.bindVertexArray(null)

  gl.enable(gl.BLEND)
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

  context.save()
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = "copy"
  context.drawImage(state.canvas, 0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  context.restore()
  return true
}
