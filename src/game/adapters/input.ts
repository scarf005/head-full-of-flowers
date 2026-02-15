import { clamp } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

export interface InputAdapterHandlers {
  onPrimeAudio: () => void
  onBeginMatch: () => void
  onReturnToMenu: () => void
  onTogglePause: () => void
  onPrimaryDown: () => void
  onPrimarySwap: (direction: number) => void
  onSecondaryDown: () => void
  onCrosshair: (x: number, y: number, visible: boolean) => void
}

export interface InputAdapter {
  destroy: () => void
}

export const setupInputAdapter = (
  canvas: HTMLCanvasElement,
  world: WorldState,
  handlers: InputAdapterHandlers,
): InputAdapter => {
  let menuStartBlockUntilMs = 0
  const frame = canvas.parentElement

  const MOVE_DEADZONE = 0.18
  const STICK_MAX_DISTANCE = 58
  const AIM_CANVAS_RADIUS = 170

  const moveStickState = {
    pointerId: -1,
    centerX: 0,
    centerY: 0,
  }

  const aimStickState = {
    pointerId: -1,
    centerX: 0,
    centerY: 0,
  }

  const syncAimFromCanvas = () => {
    world.input.worldX = world.camera.x + (world.input.canvasX - VIEW_WIDTH * 0.5) / WORLD_SCALE
    world.input.worldY = world.camera.y + (world.input.canvasY - VIEW_HEIGHT * 0.5) / WORLD_SCALE
  }

  const getFrameOffset = () => {
    const bounds = frame?.getBoundingClientRect()
    return {
      left: bounds?.left ?? 0,
      top: bounds?.top ?? 0,
    }
  }

  const getThumb = (selector: string) => document.querySelector<HTMLElement>(selector)

  const moveThumbTo = (x: number, y: number) => {
    const thumb = getThumb(".mobile-move-thumb")
    if (!thumb) {
      return
    }
    thumb.style.transform = `translate(${x}px, ${y}px)`
  }

  const aimThumbTo = (x: number, y: number) => {
    const thumb = getThumb(".mobile-aim-thumb")
    if (!thumb) {
      return
    }
    thumb.style.transform = `translate(${x}px, ${y}px)`
  }

  const clearMoveInput = () => {
    world.input.moveAxisX = 0
    world.input.moveAxisY = 0
  }

  const updateMoveStick = (clientX: number, clientY: number) => {
    const offsetX = clientX - moveStickState.centerX
    const offsetY = clientY - moveStickState.centerY
    const distance = Math.hypot(offsetX, offsetY)
    const clampedDistance = Math.min(distance, STICK_MAX_DISTANCE)
    const dirX = distance > 0.001 ? offsetX / distance : 0
    const dirY = distance > 0.001 ? offsetY / distance : 0
    const scaledX = dirX * clampedDistance
    const scaledY = dirY * clampedDistance
    const normalized = STICK_MAX_DISTANCE > 0 ? clampedDistance / STICK_MAX_DISTANCE : 0
    const intensity = normalized <= MOVE_DEADZONE ? 0 : (normalized - MOVE_DEADZONE) / (1 - MOVE_DEADZONE)

    world.input.moveAxisX = dirX * intensity
    world.input.moveAxisY = dirY * intensity
    moveThumbTo(scaledX, scaledY)
  }

  const updateAimStick = (clientX: number, clientY: number) => {
    const offsetX = clientX - aimStickState.centerX
    const offsetY = clientY - aimStickState.centerY
    const distance = Math.hypot(offsetX, offsetY)
    const clampedDistance = Math.min(distance, STICK_MAX_DISTANCE)
    const dirX = distance > 0.001 ? offsetX / distance : 0
    const dirY = distance > 0.001 ? offsetY / distance : 0
    const scaledX = dirX * clampedDistance
    const scaledY = dirY * clampedDistance
    const normalized = STICK_MAX_DISTANCE > 0 ? clampedDistance / STICK_MAX_DISTANCE : 0
    const active = normalized > 0.12
    const frameOffset = getFrameOffset()
    const canvasBounds = canvas.getBoundingClientRect()
    const centerX = canvasBounds.left - frameOffset.left + canvasBounds.width * 0.5
    const centerY = canvasBounds.top - frameOffset.top + canvasBounds.height * 0.5
    const aimScreenX = centerX + dirX * 48
    const aimScreenY = centerY + dirY * 48

    world.input.canvasX = VIEW_WIDTH * 0.5 + dirX * AIM_CANVAS_RADIUS
    world.input.canvasY = VIEW_HEIGHT * 0.5 + dirY * AIM_CANVAS_RADIUS
    syncAimFromCanvas()
    handlers.onCrosshair(aimScreenX, aimScreenY, active)
    world.input.leftDown = active
    aimThumbTo(scaledX, scaledY)
  }

  const resetAimStick = () => {
    world.input.leftDown = false
    world.input.canvasX = VIEW_WIDTH * 0.5
    world.input.canvasY = VIEW_HEIGHT * 0.5
    syncAimFromCanvas()
    handlers.onCrosshair(world.input.screenX, world.input.screenY, false)
    aimThumbTo(0, 0)
  }

  const isMobileControlTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".mobile-controls"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".mobile-controls"))) {
        return true
      }
    }

    return false
  }

  const isMenuStartTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".menu-start-button"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".menu-start-button"))) {
        return true
      }
    }

    const button = document.querySelector<HTMLButtonElement>(".menu-start-button")
    if (!button) {
      return false
    }

    const bounds = button.getBoundingClientRect()
    return event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
  }

  const isRematchButtonTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".match-result-rematch"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".match-result-rematch"))) {
        return true
      }
    }

    const button = document.querySelector<HTMLButtonElement>(".match-result-rematch")
    if (!button) {
      return false
    }

    const bounds = button.getBoundingClientRect()
    return event.clientX >= bounds.left &&
      event.clientX <= bounds.right &&
      event.clientY >= bounds.top &&
      event.clientY <= bounds.bottom
  }

  const isPausePanelTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".pause-panel"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".pause-panel"))) {
        return true
      }
    }

    return false
  }

  const isPauseResumeTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".pause-resume-button"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".pause-resume-button"))) {
        return true
      }
    }

    return false
  }

  const isPauseMainMenuTarget = (event: PointerEvent) => {
    if (event.target instanceof Element && Boolean(event.target.closest(".pause-main-menu-button"))) {
      return true
    }

    const path = typeof event.composedPath === "function" ? event.composedPath() : []
    for (const node of path) {
      if (node instanceof Element && Boolean(node.closest(".pause-main-menu-button"))) {
        return true
      }
    }

    return false
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase()
    const hadAudioPrimed = world.audioPrimed

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
      if (hadAudioPrimed) {
        if (world.finished) {
          handlers.onReturnToMenu()
          menuStartBlockUntilMs = performance.now() + 220
        } else {
          if (performance.now() < menuStartBlockUntilMs) {
            return
          }
          handlers.onBeginMatch()
        }
      }
      return
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    world.input.keys.delete(event.key.toLowerCase())
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId === moveStickState.pointerId) {
      updateMoveStick(event.clientX, event.clientY)
      event.preventDefault()
      return
    }

    if (event.pointerId === aimStickState.pointerId) {
      updateAimStick(event.clientX, event.clientY)
      event.preventDefault()
      return
    }

    if (isMobileControlTarget(event)) {
      return
    }

    const rect = canvas.getBoundingClientRect()
    const frameOffset = getFrameOffset()
    const screenX = clamp(event.clientX - rect.left, 0, rect.width)
    const screenY = clamp(event.clientY - rect.top, 0, rect.height)
    const normalizedX = rect.width > 0 ? screenX / rect.width : 0.5
    const normalizedY = rect.height > 0 ? screenY / rect.height : 0.5

    world.input.screenX = event.clientX - frameOffset.left
    world.input.screenY = event.clientY - frameOffset.top
    world.input.canvasX = normalizedX * VIEW_WIDTH
    world.input.canvasY = normalizedY * VIEW_HEIGHT
    syncAimFromCanvas()

    handlers.onCrosshair(world.input.screenX, world.input.screenY, true)
  }

  const onMobileControlsPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !isMobileControlTarget(event)) {
      return
    }

    if (!world.audioPrimed) {
      handlers.onPrimeAudio()
    }

    const target = event.target
    if (!(target instanceof Element)) {
      return
    }

    if (target.closest(".mobile-secondary-button")) {
      world.input.rightDown = true
      event.preventDefault()
      return
    }

    if (moveStickState.pointerId < 0 && target.closest(".mobile-move-zone")) {
      moveStickState.pointerId = event.pointerId
      const bounds = (target.closest(".mobile-move-zone") as Element).getBoundingClientRect()
      moveStickState.centerX = bounds.left + bounds.width * 0.5
      moveStickState.centerY = bounds.top + bounds.height * 0.5
      updateMoveStick(event.clientX, event.clientY)
      event.preventDefault()
      return
    }

    if (aimStickState.pointerId < 0 && target.closest(".mobile-aim-zone")) {
      aimStickState.pointerId = event.pointerId
      const bounds = (target.closest(".mobile-aim-zone") as Element).getBoundingClientRect()
      aimStickState.centerX = bounds.left + bounds.width * 0.5
      aimStickState.centerY = bounds.top + bounds.height * 0.5
      updateAimStick(event.clientX, event.clientY)
      event.preventDefault()
    }
  }

  const onPointerDown = (event: PointerEvent) => {
    if (isMobileControlTarget(event)) {
      return
    }

    if (performance.now() < menuStartBlockUntilMs) {
      return
    }

    if (!world.audioPrimed) {
      handlers.onPrimeAudio()
    }

    if (world.finished) {
      if (event.button !== 0 || !isRematchButtonTarget(event)) {
        return
      }
      handlers.onReturnToMenu()
      menuStartBlockUntilMs = performance.now() + 220
      return
    }

    if (!world.started) {
      if (event.button !== 0 || !isMenuStartTarget(event)) {
        return
      }

      handlers.onBeginMatch()
      return
    }

    if (world.paused && isPausePanelTarget(event)) {
      if (event.button === 0 && isPauseResumeTarget(event)) {
        handlers.onTogglePause()
      } else if (event.button === 0 && isPauseMainMenuTarget(event)) {
        handlers.onReturnToMenu()
        menuStartBlockUntilMs = performance.now() + 220
      }
      return
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
    if (event.pointerId === moveStickState.pointerId) {
      moveStickState.pointerId = -1
      clearMoveInput()
      moveThumbTo(0, 0)
      return
    }

    if (event.pointerId === aimStickState.pointerId) {
      aimStickState.pointerId = -1
      resetAimStick()
      return
    }

    if (isMobileControlTarget(event)) {
      world.input.rightDown = false
      return
    }

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

  const onWheel = (event: WheelEvent) => {
    if (!world.running || world.paused || !world.started || world.finished) {
      return
    }

    const direction = event.deltaY > 0 ? 1 : -1
    event.preventDefault()
    handlers.onPrimarySwap(direction)
  }

  const onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  window.addEventListener("keydown", onKeyDown)
  window.addEventListener("keyup", onKeyUp)
  window.addEventListener("pointerdown", onMobileControlsPointerDown)
  window.addEventListener("pointermove", onPointerMove)
  window.addEventListener("pointerdown", onPointerDown)
  window.addEventListener("pointerup", onPointerUp)
  window.addEventListener("pointercancel", onPointerUp)
  window.addEventListener("wheel", onWheel, { passive: false })
  window.addEventListener("contextmenu", onContextMenu)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("contextmenu", onContextMenu)

  return {
    destroy: () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("pointerdown", onMobileControlsPointerDown)
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerdown", onPointerDown)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerUp)
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("contextmenu", onContextMenu)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("contextmenu", onContextMenu)
    },
  }
}
