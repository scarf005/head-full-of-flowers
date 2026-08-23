import { renderScene } from "./render/scene-direct-webgl.ts"
import { debugGameSpeedSignal } from "./signals.ts"
import { setFpsSignal } from "./adapters/hud-sync.ts"
import { clamp, lerp } from "./utils.ts"
import type { FlowerArenaGame } from "./game.ts"

const FPS_SIGNAL_UPDATE_INTERVAL_SECONDS = 0.2
const SIMULATION_STEP_SECONDS = 1 / 60
const MAX_CATCH_UP_STEPS = 4
const MAX_FRAME_DELTA_SECONDS = 0.25
const MAX_RENDER_DELTA_SECONDS = 0.05
const JANK_MARK_THRESHOLD_MS = 50
const SLOW_WORK_MARK_THRESHOLD_MS = 12

interface FrameLoopState {
  accumulatorSeconds: number
}

const frameLoopStates = new WeakMap<FlowerArenaGame, FrameLoopState>()

const frameLoopStateFor = (game: FlowerArenaGame) => {
  const existing = frameLoopStates.get(game)
  if (existing) {
    return existing
  }

  const created: FrameLoopState = { accumulatorSeconds: 0 }
  frameLoopStates.set(game, created)
  return created
}

const markJank = (
  gapMs: number,
  updateMs: number,
  renderMs: number,
  simulationSteps: number,
  droppedSimulationMs: number,
) => {
  if (
    typeof performance === "undefined" ||
    typeof performance.mark !== "function" ||
    (gapMs < JANK_MARK_THRESHOLD_MS && updateMs + renderMs < SLOW_WORK_MARK_THRESHOLD_MS)
  ) {
    return
  }

  performance.mark("flower-arena:frame-jank", {
    detail: {
      gapMs,
      updateMs,
      renderMs,
      simulationSteps,
      droppedSimulationMs,
    },
  })
}

export function runFrameLoop(game: FlowerArenaGame, time: number) {
  const realDt = Math.max(0, (time - game.previousTime) / 1000)
  game.previousTime = time

  const instantFps = realDt > 0 ? 1 / realDt : 0
  game.smoothedFps = game.smoothedFps <= 0 ? instantFps : lerp(game.smoothedFps, instantFps, 0.18)
  game.fpsSignalElapsed += realDt
  if (game.fpsSignalElapsed >= FPS_SIGNAL_UPDATE_INTERVAL_SECONDS) {
    setFpsSignal(game.smoothedFps)
    game.fpsSignalElapsed %= FPS_SIGNAL_UPDATE_INTERVAL_SECONDS
  }

  const state = frameLoopStateFor(game)
  const clampedDt = Math.min(realDt, MAX_FRAME_DELTA_SECONDS)
  state.accumulatorSeconds += clampedDt
  let droppedSimulationSeconds = Math.max(0, realDt - clampedDt)
  let simulationSteps = 0
  const speedScale = clamp(debugGameSpeedSignal.value, 0.4, 1.5)

  const updateStartedAt = performance.now()
  while (
    state.accumulatorSeconds >= SIMULATION_STEP_SECONDS &&
    simulationSteps < MAX_CATCH_UP_STEPS
  ) {
    game.update(SIMULATION_STEP_SECONDS, SIMULATION_STEP_SECONDS * speedScale)
    state.accumulatorSeconds -= SIMULATION_STEP_SECONDS
    simulationSteps += 1
  }

  if (state.accumulatorSeconds >= SIMULATION_STEP_SECONDS) {
    const retainedSeconds = state.accumulatorSeconds % SIMULATION_STEP_SECONDS
    droppedSimulationSeconds += state.accumulatorSeconds - retainedSeconds
    state.accumulatorSeconds = retainedSeconds
  }
  const updateMs = performance.now() - updateStartedAt

  const renderStartedAt = performance.now()
  const renderDt = game.world.paused ? 0 : Math.min(realDt, MAX_RENDER_DELTA_SECONDS)
  renderScene({ renderer: game.renderer, world: game.world, dt: renderDt })
  const renderMs = performance.now() - renderStartedAt

  markJank(
    realDt * 1000,
    updateMs,
    renderMs,
    simulationSteps,
    droppedSimulationSeconds * 1000,
  )

  game.raf = requestAnimationFrame(game.loop)
}
