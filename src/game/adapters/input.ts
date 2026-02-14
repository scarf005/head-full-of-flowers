import { clamp } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

export interface InputAdapterHandlers {
  onPrimeAudio: () => void
  onBeginMatch: () => void
  onTogglePause: () => void
  onConsumePerk: (index: number) => void
  onPrimaryDown: () => void
  onSecondaryDown: () => void
  onCrosshair: (x: number, y: number, visible: boolean) => void
}

export interface InputAdapter {
  destroy: () => void
}

export const setupInputAdapter = (
  canvas: HTMLCanvasElement,
  world: WorldState,
  handlers: InputAdapterHandlers
): InputAdapter => {
  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()

    if (!world.audioPrimed) {
      handlers.onPrimeAudio()
    }

    world.input.keys.add(key)

    if (key === "escape" || key === "p") {
      event.preventDefault()
      handlers.onTogglePause()
      return
    }

    if (event.key === "Enter" && (!world.started || world.finished)) {
      handlers.onBeginMatch()
      return
    }

    if (event.key === "1" || event.key === "2" || event.key === "3") {
      handlers.onConsumePerk(Number(event.key) - 1)
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    world.input.keys.delete(event.key.toLowerCase())
  }

  const onPointerMove = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect()
    const screenX = clamp(event.clientX - rect.left, 0, rect.width)
    const screenY = clamp(event.clientY - rect.top, 0, rect.height)
    const normalizedX = rect.width > 0 ? screenX / rect.width : 0.5
    const normalizedY = rect.height > 0 ? screenY / rect.height : 0.5

    world.input.screenX = screenX
    world.input.screenY = screenY
    world.input.canvasX = normalizedX * VIEW_WIDTH
    world.input.canvasY = normalizedY * VIEW_HEIGHT
    world.input.worldX = world.camera.x + (world.input.canvasX - VIEW_WIDTH * 0.5) / WORLD_SCALE
    world.input.worldY = world.camera.y + (world.input.canvasY - VIEW_HEIGHT * 0.5) / WORLD_SCALE

    handlers.onCrosshair(world.input.screenX, world.input.screenY, true)
  }

  const onPointerDown = (event: PointerEvent) => {
    if (!world.audioPrimed) {
      handlers.onPrimeAudio()
    }

    if (!world.started || world.finished) {
      handlers.onBeginMatch()
    }

    if (event.button === 0) {
      world.input.leftDown = true
      if (world.running && !world.paused) {
        handlers.onPrimaryDown()
      }
    }

    if (event.button === 2) {
      event.preventDefault()
      world.input.rightDown = true
      if (world.running && !world.paused) {
        handlers.onSecondaryDown()
      }
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.button === 0) {
      world.input.leftDown = false
    }

    if (event.button === 2) {
      world.input.rightDown = false
    }
  }

  const onPointerLeave = () => {
    handlers.onCrosshair(world.input.screenX, world.input.screenY, false)
  }

  const onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("contextmenu", onContextMenu)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("contextmenu", onContextMenu)

  return {
    destroy: () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("contextmenu", onContextMenu)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("contextmenu", onContextMenu)
    }
  }
}
