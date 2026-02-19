import { VIEW_HEIGHT, VIEW_WIDTH, WORLD_SCALE } from "./world/constants.ts"
import type { WorldState } from "./world/state.ts"

interface DebugUnitSnapshot {
  id: string
  team: string
  isPlayer: boolean
  position: { x: number; y: number }
  aim: { x: number; y: number }
  recoil: number
  radius: number
  hp: number
  maxHp: number
}

interface DebugWorldStateSnapshot {
  capturedAt: string
  match: {
    started: boolean
    running: boolean
    paused: boolean
    finished: boolean
    timeRemaining: number
    arenaRadius: number
  }
  camera: {
    base: { x: number; y: number }
    offset: { x: number; y: number }
    render: { x: number; y: number }
    viewWorldBounds: { minX: number; maxX: number; minY: number; maxY: number }
    viewPixels: { width: number; height: number; worldScale: number }
  }
  playerId: string
  playerTeam: string
  units: DebugUnitSnapshot[]
}

let debugWorldStateProvider: (() => WorldState | null) | null = null

export const registerDebugWorldStateProvider = (provider: (() => WorldState | null) | null) => {
  debugWorldStateProvider = provider
}

const buildDebugWorldStateSnapshot = (world: WorldState): DebugWorldStateSnapshot => {
  const renderCameraX = world.camera.x + world.cameraOffset.x
  const renderCameraY = world.camera.y + world.cameraOffset.y
  const viewHalfWidthWorld = VIEW_WIDTH * 0.5 / WORLD_SCALE
  const viewHalfHeightWorld = VIEW_HEIGHT * 0.5 / WORLD_SCALE

  return {
    capturedAt: new Date().toISOString(),
    match: {
      started: world.started,
      running: world.running,
      paused: world.paused,
      finished: world.finished,
      timeRemaining: world.timeRemaining,
      arenaRadius: world.arenaRadius,
    },
    camera: {
      base: { x: world.camera.x, y: world.camera.y },
      offset: { x: world.cameraOffset.x, y: world.cameraOffset.y },
      render: { x: renderCameraX, y: renderCameraY },
      viewWorldBounds: {
        minX: renderCameraX - viewHalfWidthWorld,
        maxX: renderCameraX + viewHalfWidthWorld,
        minY: renderCameraY - viewHalfHeightWorld,
        maxY: renderCameraY + viewHalfHeightWorld,
      },
      viewPixels: { width: VIEW_WIDTH, height: VIEW_HEIGHT, worldScale: WORLD_SCALE },
    },
    playerId: world.player.id,
    playerTeam: world.player.team,
    units: world.units.map((unit) => ({
      id: unit.id,
      team: unit.team,
      isPlayer: unit.isPlayer,
      position: { x: unit.position.x, y: unit.position.y },
      aim: { x: unit.aim.x, y: unit.aim.y },
      recoil: unit.recoil,
      radius: unit.radius,
      hp: unit.hp,
      maxHp: unit.maxHp,
    })),
  }
}

const writeTextToClipboard = async (text: string) => {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (error) {
      console.error("Failed to write debug state via navigator clipboard", error)
    }
  }

  if (typeof document === "undefined") {
    return false
  }

  const textarea = document.createElement("textarea")
  textarea.value = text
  textarea.setAttribute("readonly", "")
  textarea.style.position = "fixed"
  textarea.style.left = "-10000px"
  textarea.style.top = "-10000px"
  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()

  try {
    const copied = document.execCommand("copy")
    document.body.removeChild(textarea)
    return copied
  } catch (error) {
    console.error("Failed to write debug state via execCommand", error)
    document.body.removeChild(textarea)
    return false
  }
}

export const copyDebugWorldStateToClipboard = async () => {
  const provider = debugWorldStateProvider
  if (!provider) {
    return false
  }

  const world = provider()
  if (!world) {
    return false
  }

  const snapshot = buildDebugWorldStateSnapshot(world)
  return await writeTextToClipboard(JSON.stringify(snapshot, null, 2))
}
