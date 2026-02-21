import { AudioDirector, SfxSynth } from "./audio.ts"
import { buildCullBounds, type CullBounds, isInsideCullBounds } from "./cull.ts"
import {
  clearMatchResultSignal,
  resetHudSignals,
  setFpsSignal,
  syncHudSignals,
  updateCoverageSignals,
  updatePlayerHpSignal,
  updatePlayerWeaponSignals,
} from "./adapters/hud-sync.ts"
import {
  crosshairSignal,
  debugEquipAllRocketLauncherSignal,
  debugGameSpeedSignal,
  debugImpactFeelLevelSignal,
  debugInfiniteHpSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
  duoTeamCountSignal,
  effectsVolumeSignal,
  ffaPlayerCountSignal,
  languageSignal,
  menuStartDifficultySignal,
  menuVisibleSignal,
  musicVolumeSignal,
  pausedSignal,
  secondaryModeSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  statusMessageSignal,
  tdmTeamSizeSignal,
} from "./signals.ts"
import { type InputAdapter, setupInputAdapter } from "./adapters/input.ts"
import { renderScene } from "./render/scene.ts"
import { registerDebugWorldStateProvider } from "./debug-state-copy.ts"
import {
  ARENA_END_RADIUS,
  ARENA_START_RADIUS,
  arenaRadiiForPlayerCount,
  clamp,
  distSquared,
  lerp,
  randomPointInArena,
  randomRange,
} from "./utils.ts"
import {
  EFFECT_SPEED,
  LOOT_PICKUP_INTERVAL_SECONDS,
  MATCH_DURATION_SECONDS,
  VIEW_HEIGHT,
  VIEW_WIDTH,
  WORLD_SCALE,
} from "./world/constants.ts"
import { createWorldState, rebuildUnitLookup, resetRenderPathProfile, type WorldState } from "./world/state.ts"
import { createBarrenGardenMap } from "./world/terrain-map.ts"
import { localizeFactionLabel } from "./i18n/faction-label.ts"
import { localizePerk, localizePrimaryWeapon } from "./i18n/localize.ts"
import {
  applyDamage,
  continueBurstFire,
  cyclePrimaryWeapon,
  equipPrimary,
  finishReload,
  firePrimary,
  type FirePrimaryDeps,
  randomLootablePrimary,
  startReload,
} from "./systems/combat.ts"
import { type DamageSource } from "./systems/combat-damage.ts"
import {
  constrainUnitsToArena,
  damageObstaclesByExplosion,
  hitObstacle,
  resolveUnitCollisions,
  updateObstacleFlash,
} from "./systems/collisions.ts"
import {
  isObstacleCellSolid,
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_HEDGE,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridIndex,
  obstacleGridToWorldCenter,
  worldToObstacleGrid,
} from "./world/obstacle-grid.ts"
import { spawnFlowers, updateDamagePopups, updateFlowers } from "./systems/flowers.ts"
import { igniteMolotov, spawnFlamePatch, updateMolotovZones } from "./systems/molotov.ts"
import { collectNearbyPickup, spawnPerkPickupAt, spawnPickupAt, updatePickups } from "./systems/pickups.ts"
import { updateCombatFeel, updateCrosshairWorld, updatePlayer } from "./systems/player.ts"
import { updateProjectiles } from "./systems/projectiles.ts"
import { respawnUnit, setupWorldUnits, spawnAllUnits, spawnMapLoot, spawnObstacles } from "./systems/respawn.ts"
import { explodeGrenade, throwSecondary, updateThrowables } from "./systems/throwables.ts"
import {
  spawnExplosion as spawnExplosionFx,
  spawnKillPetalBurst as spawnKillPetalBurstFx,
  spawnObstacleChipFx as spawnObstacleChipFxCore,
  spawnObstacleDebris as spawnObstacleDebrisCore,
  spawnUnitRagdoll as spawnUnitRagdollFx,
  updateExplosions as updateExplosionsFx,
  updateKillPetals as updateKillPetalsFx,
  updateObstacleDebris as updateObstacleDebrisFx,
  updateRagdolls as updateRagdollsFx,
} from "./game-fx.ts"
import { updateAI } from "./systems/ai.ts"
import { applyExplosionImpulse, explodeProjectilePayload } from "./systems/explosion-effects.ts"
import {
  cullHiddenDamagePopups,
  emitProjectileTrailEnd,
  emitThrowableTrailEnd,
  updateFlightTrailEmitters,
  updateFlightTrails,
} from "./systems/flight-trails.ts"
import {
  spawnDroppedMagazineFx,
  spawnMuzzleFlashFx,
  spawnShellCasingFx,
  updateShellCasingsFx,
} from "./systems/shell-fx.ts"
import {
  randomBotSecondaryMode,
  resetBotForMatch,
  resetCameraForMatchStart,
  resetPlayerForMatch,
  resetTransientEntitiesForMatch,
} from "./systems/match-reset.ts"
import { Flower, type Unit } from "./entities.ts"
import { HIGH_TIER_PRIMARY_IDS, pickupAmmoForWeapon, PRIMARY_WEAPONS } from "./weapons.ts"
import { applyPerkToUnit, perkStacks, randomPerkId } from "./perks.ts"
import { botPalette, BURNED_FACTION_ID, createFactionFlowerCounts, type FactionDescriptor } from "./factions.ts"
import { finishMatchResult } from "./game-match-results.ts"
import { updateGame } from "./game-update.ts"
import {
  allocFlower as allocFlowerCore,
  allocMolotovZone as allocMolotovZoneCore,
  allocPopup as allocPopupCore,
  allocProjectile as allocProjectileCore,
  allocThrowable as allocThrowableCore,
  applyDamageForGame,
  equipPrimaryForGame,
  finishReloadForGame,
  firePrimaryForGame,
  getUnit as getUnitCore,
  primaryFireDepsForGame,
  respawnUnitForGame,
  startReloadForGame,
  swapPrimaryForGame,
  throwSecondaryForGame,
} from "./game-combat-runtime.ts"
import {
  applyMatchMode as applyMatchModeCore,
  highTierLootBoxChance,
  randomHighTierPrimary,
  randomLootablePrimaryForMatch,
  spawnGuaranteedCenterHighTierLoot,
  spawnLootPickupAt as spawnLootPickupAtCore,
  spawnPerkPickupDropAt as spawnPerkPickupDropAtCore,
  spawnRandomWhiteLootBox as spawnRandomWhiteLootBoxCore,
  whiteLootBoxSpawnIntervalSeconds,
} from "./game-mode-loot.ts"
import {
  beginMatchForGame,
  primeAudioForGame,
  resetMatchFxCursorsForGame,
  returnToMenuForGame,
  togglePauseForGame,
} from "./game-match-lifecycle.ts"
import { applyDebugOverridesForGame } from "./game-debug.ts"
import { runFrameLoop } from "./game-frame-loop.ts"
import { setupInputForGame, syncPlayerOptionsForGame } from "./game-ui-sync.ts"
import {
  buildFogCullBoundsForGame,
  isInsideFogCullBoundsForGame,
  playerCoverageIdForGame,
  resolveScoreOwnerIdForGame,
  setupWorldForGame,
} from "./game-accessors.ts"
import type { GameModeId, MatchDifficulty, PrimaryWeaponId, Team } from "./types.ts"
import { t } from "@lingui/core/macro"

import menuTrackUrl from "../assets/music/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 02 linear & gestalt.ogg"
import gameplayTrackUrl from "../assets/music/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 01 MY DIVINE PERVERSIONS.ogg"

const FX_CULL_PADDING_WORLD = 2.25
const FPS_SIGNAL_UPDATE_INTERVAL_SECONDS = 0.2
const HUD_SYNC_INTERVAL_SECONDS = 0.1
type FogCullBounds = CullBounds

export class FlowerArenaGame {
  public canvas: HTMLCanvasElement
  public context: CanvasRenderingContext2D
  public world: WorldState
  public inputAdapter: InputAdapter | null = null
  public raf = 0
  public previousTime = 0
  public smoothedFps = 0
  public fpsSignalElapsed = 0
  public hudSyncElapsed = 0
  public audioDirector = new AudioDirector(menuTrackUrl, gameplayTrackUrl)
  public sfx = new SfxSynth()
  public currentMode: GameModeId = "ffa"
  public botPool: Unit[]
  public matchArenaStartRadius = ARENA_START_RADIUS
  public matchArenaEndRadius = ARENA_END_RADIUS
  public lastMusicVolume = -1
  public lastEffectsVolume = -1
  public lastLocale = languageSignal.value
  public beginMatchGenerationToken = 0
  public obstacleDebrisCursor = 0
  public killPetalCursor = 0
  public ragdollCursor = 0
  public shellCasingCursor = 0
  public muzzleFlashCursor = 0
  public explosionCursor = 0
  private musicSuppressedByFocusLoss = false
  private disposeFocusHandlers: (() => void) | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Canvas2D context is not available")
    }

    this.context = context
    this.canvas.width = VIEW_WIDTH
    this.canvas.height = VIEW_HEIGHT
    this.world = createWorldState()
    registerDebugWorldStateProvider(() => this.world)
    this.botPool = [...this.world.bots]
    this.applyMatchMode()
    this.syncPlayerOptions()

    this.setupWorld()
    this.setupInput()
    this.setupFocusAudioHandling()
    resetHudSignals(this.world, this.canvas)
    renderScene({ context: this.context, world: this.world, dt: 0 })
  }
  public syncPlayerOptions() {
    syncPlayerOptionsForGame(this)
  }

  start() {
    void this.audioDirector.tryAutoplayMenu().then((started) => {
      if (started) {
        this.world.audioPrimed = true
      }
    })
    this.previousTime = performance.now()
    this.fpsSignalElapsed = FPS_SIGNAL_UPDATE_INTERVAL_SECONDS
    this.hudSyncElapsed = HUD_SYNC_INTERVAL_SECONDS
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    this.beginMatchGenerationToken += 1
    cancelAnimationFrame(this.raf)
    this.inputAdapter?.destroy()
    this.disposeFocusHandlers?.()
    this.disposeFocusHandlers = null
    this.audioDirector.stopAll()
    registerDebugWorldStateProvider(null)
  }
  private suppressMusicForFocusLoss() {
    if (this.musicSuppressedByFocusLoss) {
      return
    }

    this.musicSuppressedByFocusLoss = true
    this.audioDirector.pauseCurrentMusic()
  }
  private restoreMusicAfterFocusGain() {
    if (!this.musicSuppressedByFocusLoss || document.hidden) {
      return
    }

    this.musicSuppressedByFocusLoss = false
    this.audioDirector.resumeCurrentMusic()
  }
  private setupFocusAudioHandling() {
    const onVisibilityChange = () => {
      if (document.hidden) {
        this.suppressMusicForFocusLoss()
        return
      }

      this.restoreMusicAfterFocusGain()
    }
    const onWindowBlur = () => {
      this.suppressMusicForFocusLoss()
    }
    const onWindowFocus = () => {
      this.restoreMusicAfterFocusGain()
    }

    document.addEventListener("visibilitychange", onVisibilityChange)
    globalThis.addEventListener("blur", onWindowBlur)
    globalThis.addEventListener("focus", onWindowFocus)

    this.disposeFocusHandlers = () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      globalThis.removeEventListener("blur", onWindowBlur)
      globalThis.removeEventListener("focus", onWindowFocus)
    }
  }
  public setupWorld() {
    setupWorldForGame(this)
  }
  public playerCoverageId() {
    return playerCoverageIdForGame(this)
  }
  public buildFogCullBounds(padding = FX_CULL_PADDING_WORLD): FogCullBounds {
    return buildFogCullBoundsForGame(this, padding)
  }
  public isInsideFogCullBounds(x: number, y: number, bounds: FogCullBounds, padding = 0) {
    return isInsideFogCullBoundsForGame(this, x, y, bounds, padding)
  }
  public resolveScoreOwnerId(ownerId: string) {
    return resolveScoreOwnerIdForGame(this, ownerId)
  }
  public applyMatchMode() {
    const result = applyMatchModeCore(this.world, this.botPool)
    this.currentMode = result.currentMode
    this.matchArenaStartRadius = result.matchArenaStartRadius
    this.matchArenaEndRadius = result.matchArenaEndRadius
    rebuildUnitLookup(this.world)
  }
  public randomHighTierPrimary() {
    return randomHighTierPrimary(HIGH_TIER_PRIMARY_IDS)
  }
  public highTierLootBoxChance() {
    return highTierLootBoxChance(this.world.timeRemaining)
  }
  public whiteLootBoxSpawnIntervalSeconds() {
    return whiteLootBoxSpawnIntervalSeconds(this.world.timeRemaining)
  }
  public spawnRandomWhiteLootBox() {
    spawnRandomWhiteLootBoxCore(this.world)
  }
  public spawnGuaranteedCenterHighTierLoot() {
    spawnGuaranteedCenterHighTierLoot(this.world, () => this.randomHighTierPrimary())
  }
  public randomLootablePrimaryForMatch() {
    return randomLootablePrimaryForMatch(this.world.timeRemaining)
  }
  public spawnLootPickupAt(
    x: number,
    y: number,
    force = false,
    allowHighTier = false,
    forceHighTier = false,
  ) {
    spawnLootPickupAtCore(this.world, x, y, {
      force,
      allowHighTier,
      forceHighTier,
      randomHighTier: () => this.randomHighTierPrimary(),
    })
  }
  public spawnPerkPickupDropAt(x: number, y: number, force = true) {
    spawnPerkPickupDropAtCore(this.world, x, y, force)
  }
  public setupInput() {
    setupInputForGame(this)
  }
  public primeAudio() {
    primeAudioForGame(this)
  }
  public async beginMatch(difficulty: MatchDifficulty = "hard") {
    await beginMatchForGame(this, difficulty)
  }
  public resetMatchFxCursors() {
    resetMatchFxCursorsForGame(this)
  }
  public finishMatch() {
    this.world.running = false
    this.world.paused = false
    this.world.finished = true
    this.audioDirector.startMenu()
    finishMatchResult(this.world, this.currentMode, this.playerCoverageId())
  }
  public returnToMenu() {
    returnToMenuForGame(this)
  }
  public togglePause() {
    togglePauseForGame(this)
  }
  public updateExplosions(dt: number) {
    updateExplosionsFx(this.world, dt)
  }
  public spawnObstacleDebris(x: number, y: number, material: number) {
    this.obstacleDebrisCursor = spawnObstacleDebrisCore(this.world, this.obstacleDebrisCursor, x, y, material)
  }
  public spawnObstacleChipFx(x: number, y: number, material: number, damage: number) {
    this.obstacleDebrisCursor = spawnObstacleChipFxCore(this.world, this.obstacleDebrisCursor, x, y, material, damage)
  }
  public updateObstacleDebris(dt: number, fogCullBounds?: FogCullBounds) {
    updateObstacleDebrisFx(this.world, dt, fogCullBounds)
  }
  public spawnKillPetalBurst(x: number, y: number) {
    this.killPetalCursor = spawnKillPetalBurstFx(this.world, this.killPetalCursor, x, y)
  }
  public spawnUnitRagdoll(
    target: Unit,
    killImpulse: {
      impactX: number
      impactY: number
      damage: number
      damageSource: DamageSource
    },
  ) {
    this.ragdollCursor = spawnUnitRagdollFx(this.world, this.ragdollCursor, target, killImpulse)
  }
  public updateRagdolls(dt: number) {
    updateRagdollsFx(this.world, dt)
  }
  public updateKillPetals(dt: number, fogCullBounds?: FogCullBounds) {
    updateKillPetalsFx(this.world, dt, fogCullBounds)
  }
  public spawnExplosion(x: number, y: number, radius: number) {
    this.explosionCursor = spawnExplosionFx(this.world, this.explosionCursor, x, y, radius)
  }
  public applyDebugOverrides() {
    applyDebugOverridesForGame(this)
  }
  public allocProjectile() {
    return allocProjectileCore(this)
  }
  public allocThrowable() {
    return allocThrowableCore(this)
  }
  public allocFlower() {
    return allocFlowerCore(this)
  }
  public allocPopup() {
    return allocPopupCore(this)
  }
  public allocMolotovZone() {
    return allocMolotovZoneCore(this)
  }
  public getUnit(id: string) {
    return getUnitCore(this, id)
  }
  public equipPrimary(unitId: string, weaponId: PrimaryWeaponId, ammo: number) {
    return equipPrimaryForGame(this, unitId, weaponId, ammo)
  }
  public startReload(unitId: string) {
    startReloadForGame(this, unitId)
  }
  public finishReload(unitId: string) {
    finishReloadForGame(this, unitId)
  }
  public firePrimary(unitId: string) {
    firePrimaryForGame(this, unitId)
  }
  public primaryFireDeps(): FirePrimaryDeps {
    return primaryFireDepsForGame(this)
  }
  public swapPrimary(unitId: string, direction: number) {
    swapPrimaryForGame(this, unitId, direction)
  }
  public throwSecondary(unitId: string) {
    throwSecondaryForGame(this, unitId)
  }
  public respawnUnit(unitId: string) {
    respawnUnitForGame(this, unitId)
  }
  public applyDamage(
    targetId: string,
    amount: number,
    sourceId: string,
    sourceTeam: Team,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number,
    damageSource: DamageSource = "other",
  ) {
    applyDamageForGame(this, targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, damageSource)
  }
  public loop = (time: number) => {
    runFrameLoop(this, time)
  }
  public update(frameDt: number, gameplayDt: number) {
    updateGame(this, frameDt, gameplayDt)
  }
  public syncHudSignalsThrottled(dt: number) {
    this.hudSyncElapsed += dt
    if (this.hudSyncElapsed < HUD_SYNC_INTERVAL_SECONDS) {
      return
    }

    this.hudSyncElapsed = this.hudSyncElapsed % HUD_SYNC_INTERVAL_SECONDS
    syncHudSignals(this.world)
  }
}
