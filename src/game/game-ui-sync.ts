import { setupInputAdapter } from "./adapters/input.ts"
import { updateCoverageSignals } from "./adapters/hud-sync.ts"
import { crosshairSignal, effectsVolumeSignal, languageSignal, musicVolumeSignal } from "./signals.ts"
import { localizeFactionLabel } from "./i18n/faction-label.ts"
import type { FlowerArenaGame } from "./game.ts"

export function syncPlayerOptionsForGame(game: FlowerArenaGame) {
  const musicVolume = musicVolumeSignal.value
  if (musicVolume !== game.lastMusicVolume) {
    game.lastMusicVolume = musicVolume
    game.audioDirector.setMusicVolume(musicVolume)
  }

  const effectsVolume = effectsVolumeSignal.value
  if (effectsVolume !== game.lastEffectsVolume) {
    game.lastEffectsVolume = effectsVolume
    game.sfx.setEffectsVolume(effectsVolume)
  }

  const locale = languageSignal.value
  if (locale !== game.lastLocale) {
    game.lastLocale = locale
    game.world.factions = game.world.factions.map((faction) => ({
      ...faction,
      label: localizeFactionLabel(game.currentMode, faction.id, game.world.player.id),
    }))
    updateCoverageSignals(game.world)
  }
}

export function setupInputForGame(game: FlowerArenaGame) {
  game.inputAdapter = setupInputAdapter(game.canvas, game.world, {
    onPrimeAudio: () => game.primeAudio(),
    onBeginMatch: (difficulty) => game.beginMatch(difficulty),
    onReturnToMenu: () => game.returnToMenu(),
    onTogglePause: () => game.togglePause(),
    onPrimaryDown: () => game.firePrimary(game.world.player.id),
    onPrimarySwap: (direction) => game.swapPrimary(game.world.player.id, direction),
    onSecondaryDown: () => game.throwSecondary(game.world.player.id),
    onCrosshair: (x, y, visible) => {
      crosshairSignal.value = { x, y, visible }
    },
  })
}
