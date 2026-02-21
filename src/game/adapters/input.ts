import { clamp } from "../utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "../world/constants.ts"
import type { MatchDifficulty } from "../types.ts"
import type { WorldState } from "../world/state.ts"
import {
  isMobileControlTarget,
  isPauseMainMenuTarget,
  isPausePanelTarget,
  isPauseResumeTarget,
  isRematchButtonTarget,
} from "./input-event-targets.ts"

export interface InputAdapterHandlers {
  onPrimeAudio: () => void
  onBeginMatch: (difficulty: MatchDifficulty) => void
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
  const INPUT_BOUNDS_SAMPLE_INTERVAL_MS = 120

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

  const pointerBoundsCache = {
    left: 0,
    top: 0,
    width: VIEW_WIDTH,
    height: VIEW_HEIGHT,
    frameLeft: 0,
    frameTop: 0,
    nextSampleAtMs: 0,
  }

  const samplePointerBounds = (force = false) => {
    const now = performance.now()
    if (!force && now < pointerBoundsCache.nextSampleAtMs) {
      return pointerBoundsCache
    }

    const rect = canvas.getBoundingClientRect()
    const frameRect = frame?.getBoundingClientRect()
    pointerBoundsCache.left = rect.left
    pointerBoundsCache.top = rect.top
    pointerBoundsCache.width = Math.max(1, rect.width)
    pointerBoundsCache.height = Math.max(1, rect.height)
    pointerBoundsCache.frameLeft = frameRect?.left ?? 0
    pointerBoundsCache.frameTop = frameRect?.top ?? 0
    pointerBoundsCache.nextSampleAtMs = now + INPUT_BOUNDS_SAMPLE_INTERVAL_MS
    return pointerBoundsCache
  }

  const pendingCrosshair = {
    x: VIEW_WIDTH * 0.5,
    y: VIEW_HEIGHT * 0.5,
    visible: false,
    dirty: false,
  }
  let crosshairRaf = 0
  const pendingDesktopPointer = {
    clientX: 0,
    clientY: 0,
    dirty: false,
  }
  let desktopPointerRaf = 0

  const flushCrosshair = () => {
    crosshairRaf = 0
    if (!pendingCrosshair.dirty) {
      return
    }
    pendingCrosshair.dirty = false
    handlers.onCrosshair(pendingCrosshair.x, pendingCrosshair.y, pendingCrosshair.visible)
  }

  const scheduleCrosshair = (x: number, y: number, visible: boolean) => {
    pendingCrosshair.x = x
    pendingCrosshair.y = y
    pendingCrosshair.visible = visible
    pendingCrosshair.dirty = true
    if (crosshairRaf !== 0) {
      return
    }
    crosshairRaf = requestAnimationFrame(flushCrosshair)
  }

  const flushDesktopPointerMove = () => {
    desktopPointerRaf = 0
    if (!pendingDesktopPointer.dirty) {
      return
    }

    pendingDesktopPointer.dirty = false
    const bounds = samplePointerBounds()
    const screenX = clamp(pendingDesktopPointer.clientX - bounds.left, 0, bounds.width)
    const screenY = clamp(pendingDesktopPointer.clientY - bounds.top, 0, bounds.height)
    const normalizedX = screenX / bounds.width
    const normalizedY = screenY / bounds.height

    world.input.screenX = pendingDesktopPointer.clientX - bounds.frameLeft
    world.input.screenY = pendingDesktopPointer.clientY - bounds.frameTop
    world.input.canvasX = normalizedX * VIEW_WIDTH
    world.input.canvasY = normalizedY * VIEW_HEIGHT
    syncAimFromCanvas()
    scheduleCrosshair(world.input.screenX, world.input.screenY, true)
  }

  const scheduleDesktopPointerMove = (clientX: number, clientY: number) => {
    pendingDesktopPointer.clientX = clientX
    pendingDesktopPointer.clientY = clientY
    pendingDesktopPointer.dirty = true
    if (desktopPointerRaf !== 0) {
      return
    }

    desktopPointerRaf = requestAnimationFrame(flushDesktopPointerMove)
  }

  const getFrameOffset = () => {
    const bounds = samplePointerBounds()
    return {
      left: bounds.frameLeft,
      top: bounds.frameTop,
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
    const bounds = samplePointerBounds()
    const centerX = bounds.left - bounds.frameLeft + bounds.width * 0.5
    const centerY = bounds.top - bounds.frameTop + bounds.height * 0.5
    const aimScreenX = centerX + dirX * 48
    const aimScreenY = centerY + dirY * 48

    world.input.canvasX = VIEW_WIDTH * 0.5 + dirX * AIM_CANVAS_RADIUS
    world.input.canvasY = VIEW_HEIGHT * 0.5 + dirY * AIM_CANVAS_RADIUS
    syncAimFromCanvas()
    scheduleCrosshair(aimScreenX, aimScreenY, active)
    world.input.leftDown = active
    aimThumbTo(scaledX, scaledY)
  }

  const resetAimStick = () => {
    world.input.leftDown = false
    world.input.canvasX = VIEW_WIDTH * 0.5
    world.input.canvasY = VIEW_HEIGHT * 0.5
    syncAimFromCanvas()
    scheduleCrosshair(world.input.screenX, world.input.screenY, false)
    aimThumbTo(0, 0)
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
          handlers.onBeginMatch("hard")
        }
      }
      return
    }
  }

  const onKeyUp = (event: KeyboardEvent) => {
    world.input.keys.delete(event.key.toLowerCase())
  }

  const onTouchPointerMove = (event: PointerEvent) => {
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
  }

  let touchPointerMoveListening = false
  const syncTouchPointerMoveListener = () => {
    const shouldListen = moveStickState.pointerId >= 0 || aimStickState.pointerId >= 0
    if (shouldListen === touchPointerMoveListening) {
      return
    }

    touchPointerMoveListening = shouldListen
    if (shouldListen) {
      globalThis.addEventListener("pointermove", onTouchPointerMove)
    } else {
      globalThis.removeEventListener("pointermove", onTouchPointerMove)
    }
  }

  const onMouseMove = (event: MouseEvent) => {
    if (!world.running || world.paused || !world.started || world.finished) {
      return
    }

    scheduleDesktopPointerMove(event.clientX, event.clientY)
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
      syncTouchPointerMoveListener()
      const bounds = (target.closest(".mobile-move-zone") as Element).getBoundingClientRect()
      moveStickState.centerX = bounds.left + bounds.width * 0.5
      moveStickState.centerY = bounds.top + bounds.height * 0.5
      updateMoveStick(event.clientX, event.clientY)
      event.preventDefault()
      return
    }

    if (aimStickState.pointerId < 0 && target.closest(".mobile-aim-zone")) {
      aimStickState.pointerId = event.pointerId
      syncTouchPointerMoveListener()
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
      syncTouchPointerMoveListener()
      clearMoveInput()
      moveThumbTo(0, 0)
      return
    }

    if (event.pointerId === aimStickState.pointerId) {
      aimStickState.pointerId = -1
      syncTouchPointerMoveListener()
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
    pendingDesktopPointer.dirty = false
    if (desktopPointerRaf !== 0) {
      cancelAnimationFrame(desktopPointerRaf)
      desktopPointerRaf = 0
    }
    scheduleCrosshair(world.input.screenX, world.input.screenY, false)
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

  globalThis.addEventListener("keydown", onKeyDown)
  globalThis.addEventListener("keyup", onKeyUp)
  globalThis.addEventListener("pointerdown", onMobileControlsPointerDown)
  globalThis.addEventListener("pointerdown", onPointerDown)
  globalThis.addEventListener("pointerup", onPointerUp)
  globalThis.addEventListener("pointercancel", onPointerUp)
  globalThis.addEventListener("wheel", onWheel, { passive: false })
  globalThis.addEventListener("contextmenu", onContextMenu)
  canvas.addEventListener("mousemove", onMouseMove)
  canvas.addEventListener("pointerleave", onPointerLeave)
  canvas.addEventListener("contextmenu", onContextMenu)

  samplePointerBounds(true)

  return {
    destroy: () => {
      if (crosshairRaf !== 0) {
        cancelAnimationFrame(crosshairRaf)
        crosshairRaf = 0
      }
      if (desktopPointerRaf !== 0) {
        cancelAnimationFrame(desktopPointerRaf)
        desktopPointerRaf = 0
      }
      globalThis.removeEventListener("keydown", onKeyDown)
      globalThis.removeEventListener("keyup", onKeyUp)
      globalThis.removeEventListener("pointerdown", onMobileControlsPointerDown)
      globalThis.removeEventListener("pointermove", onTouchPointerMove)
      globalThis.removeEventListener("pointerdown", onPointerDown)
      globalThis.removeEventListener("pointerup", onPointerUp)
      globalThis.removeEventListener("pointercancel", onPointerUp)
      globalThis.removeEventListener("wheel", onWheel)
      globalThis.removeEventListener("contextmenu", onContextMenu)
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("pointerleave", onPointerLeave)
      canvas.removeEventListener("contextmenu", onContextMenu)
    },
  }
}
