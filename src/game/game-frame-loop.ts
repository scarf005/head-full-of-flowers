import { renderScene } from "./render/scene.ts"
import { debugGameSpeedSignal } from "./signals.ts"
import { setFpsSignal } from "./adapters/hud-sync.ts"
import { clamp, lerp } from "./utils.ts"
import type { FlowerArenaGame } from "./game.ts"

const FPS_SIGNAL_UPDATE_INTERVAL_SECONDS = 0.2

export function runFrameLoop(game: FlowerArenaGame, time: number) {
  const realDt = Math.max(0, (time - game.previousTime) / 1000)
  const frameDt = Math.min(0.033, realDt)
  const speedScale = clamp(debugGameSpeedSignal.value, 0.4, 1.5)
  const gameplayDt = frameDt * speedScale
  game.previousTime = time

  const instantFps = realDt > 0 ? 1 / realDt : 0
  game.smoothedFps = game.smoothedFps <= 0 ? instantFps : lerp(game.smoothedFps, instantFps, 0.18)
  game.fpsSignalElapsed += realDt
  if (game.fpsSignalElapsed >= FPS_SIGNAL_UPDATE_INTERVAL_SECONDS) {
    setFpsSignal(game.smoothedFps)
    game.fpsSignalElapsed = game.fpsSignalElapsed % FPS_SIGNAL_UPDATE_INTERVAL_SECONDS
  }

  game.update(frameDt, gameplayDt)
  renderScene({ context: game.context, world: game.world, dt: game.world.paused ? 0 : frameDt })
  game.raf = requestAnimationFrame(game.loop)
}
