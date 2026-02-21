import { t } from "@lingui/core/macro"
import { clearMatchResultSignal, syncHudSignals, updateCoverageSignals } from "./adapters/hud-sync.ts"
import {
  randomBotSecondaryMode,
  resetBotForMatch,
  resetCameraForMatchStart,
  resetPlayerForMatch,
  resetTransientEntitiesForMatch,
} from "./systems/match-reset.ts"
import { spawnAllUnits, spawnMapLoot, spawnObstacles } from "./systems/respawn.ts"
import { clamp } from "./utils.ts"
import { LOOT_PICKUP_INTERVAL_SECONDS, MATCH_DURATION_SECONDS } from "./world/constants.ts"
import { createBarrenGardenMap } from "./world/terrain-map.ts"
import { resetRenderPathProfile } from "./world/state.ts"
import { createFactionFlowerCounts } from "./factions.ts"
import {
  debugImpactFeelLevelSignal,
  menuStartDifficultySignal,
  menuVisibleSignal,
  pausedSignal,
  statusMessageSignal,
} from "./signals.ts"
import type { MatchDifficulty } from "./types.ts"
import type { FlowerArenaGame } from "./game.ts"

export async function beginMatchForGame(game: FlowerArenaGame, difficulty: MatchDifficulty = "hard") {
  const generationToken = ++game.beginMatchGenerationToken
  game.applyMatchMode()
  game.world.started = true
  game.world.running = false
  game.world.paused = true
  game.world.finished = false
  game.world.aiDifficulty = difficulty
  menuStartDifficultySignal.value = null
  game.world.timeRemaining = MATCH_DURATION_SECONDS
  game.world.arenaRadius = game.matchArenaStartRadius
  game.world.pickupTimer = LOOT_PICKUP_INTERVAL_SECONDS
  game.world.lootBoxTimer = game.whiteLootBoxSpawnIntervalSeconds()
  game.world.pickupSpawnSequence = 1
  game.world.factionFlowerCounts = createFactionFlowerCounts(game.world.factions)
  game.world.playerBulletsFired = 0
  game.world.playerBulletsHit = 0
  game.world.playerKills = 0
  game.world.playerDamageDealt = 0
  game.world.playerFlowerTotal = 0
  resetRenderPathProfile(game.world)
  game.world.impactFeelLevel = clamp(debugImpactFeelLevelSignal.value, 1, 2)
  menuVisibleSignal.value = true
  pausedSignal.value = true
  clearMatchResultSignal()
  statusMessageSignal.value = t`Generating arena...`

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })

  if (generationToken !== game.beginMatchGenerationToken || !game.world.started) {
    return
  }

  game.world.terrainMap = createBarrenGardenMap(112)
  game.world.flowerDensityGrid = new Uint16Array(game.world.terrainMap.size * game.world.terrainMap.size)
  game.world.flowerCellHead = new Int32Array(game.world.terrainMap.size * game.world.terrainMap.size)
  game.world.flowerCellHead.fill(-1)
  game.world.flowerDirtyIndices.clear()
  game.world.flowerDirtyCount = 0

  const player = game.world.player
  resetPlayerForMatch(player)
  game.equipPrimary(player.id, "pistol", Number.POSITIVE_INFINITY)

  game.world.bots.forEach((bot) => {
    resetBotForMatch(bot, randomBotSecondaryMode)
    game.equipPrimary(bot.id, "pistol", Number.POSITIVE_INFINITY)
  })

  resetTransientEntitiesForMatch(game.world)
  resetMatchFxCursorsForGame(game)

  spawnObstacles(game.world)
  spawnAllUnits(game.world)
  spawnMapLoot(game.world, {
    spawnPickupAt: (x, y) => game.spawnLootPickupAt(x, y),
  })
  game.spawnGuaranteedCenterHighTierLoot()

  resetCameraForMatchStart(game.world)
  game.world.running = true
  game.world.paused = false

  updateCoverageSignals(game.world)
  syncHudSignals(game.world)
  menuVisibleSignal.value = false
  pausedSignal.value = false
  clearMatchResultSignal()
  statusMessageSignal.value = ""
  game.audioDirector.startGameplay()
}

export function resetMatchFxCursorsForGame(game: FlowerArenaGame) {
  game.obstacleDebrisCursor = 0
  game.killPetalCursor = 0
  game.ragdollCursor = 0
  game.shellCasingCursor = 0
  game.muzzleFlashCursor = 0
  game.explosionCursor = 0
}

export function returnToMenuForGame(game: FlowerArenaGame) {
  game.beginMatchGenerationToken += 1
  game.world.running = false
  game.world.paused = false
  game.world.finished = false
  game.world.started = false
  menuStartDifficultySignal.value = null
  game.world.factionFlowerCounts = createFactionFlowerCounts(game.world.factions)
  updateCoverageSignals(game.world)
  menuVisibleSignal.value = true
  pausedSignal.value = false
  clearMatchResultSignal()
  statusMessageSignal.value = t`Click once to wake audio, then begin fighting`
  game.audioDirector.startMenu()
}

export function togglePauseForGame(game: FlowerArenaGame) {
  if (!game.world.running || game.world.finished) {
    return
  }

  game.world.paused = !game.world.paused
  pausedSignal.value = game.world.paused
}

export function primeAudioForGame(game: FlowerArenaGame) {
  if (game.world.audioPrimed) {
    return
  }

  game.world.audioPrimed = true
  game.audioDirector.prime()
  game.sfx.prime()
  game.audioDirector.startMenu()
}
