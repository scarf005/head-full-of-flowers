import { AudioDirector, SfxSynth } from "./audio.ts"
import type { CullBounds } from "./cull.ts"
import { resetHudSignals, syncHudSignals } from "./adapters/hud-sync.ts"
import {
  crosshairSignal,
  duoTeamCountSignal,
  ffaPlayerCountSignal,
  languageSignal,
  selectedGameModeSignal,
  squadTeamCountSignal,
  statusMessageSignal,
  tdmTeamSizeSignal,
} from "./signals.ts"
import type { InputAdapter } from "./adapters/input.ts"
import { renderScene } from "./render/scene.ts"
import { registerDebugWorldStateProvider } from "./debug-state-copy.ts"
import {
  applyReplayInputFrame,
  createReplaySeed,
  createSeededRandom,
  type ParsedReplay,
  parseReplayJsonl,
  type RandomSource,
  registerReplayExportProvider,
  registerReplayLoadProvider,
  ReplayRecorder,
  withRandomSource,
} from "./replay.ts"
import { ARENA_END_RADIUS, ARENA_START_RADIUS } from "./utils.ts"
import { VIEW_HEIGHT, VIEW_WIDTH } from "./world/constants.ts"
import { createWorldState, rebuildUnitLookup, type WorldState } from "./world/state.ts"
import type { FirePrimaryDeps } from "./systems/combat.ts"
import { type DamageSource } from "./systems/combat-damage.ts"
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
import type { Unit } from "./entities.ts"
import { HIGH_TIER_PRIMARY_IDS } from "./weapons.ts"
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
  public replaySeed = ""
  public replaySeedFromUrl: string | null = null
  public replaySeedOverride: string | null = null
  public replayRandom: RandomSource = createSeededRandom("initial")
  public replayRecorder = new ReplayRecorder()
  public pendingReplay: ParsedReplay | null = null
  public pendingReplaySourceJsonl: string | null = null
  public replayPlayback: ParsedReplay | null = null
  public replayPlaybackSourceJsonl: string | null = null
  public replayPlaybackFrame = 0
  public replayPlaybackWallClockSeconds = 0
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
    this.replaySeedFromUrl = new URLSearchParams(globalThis.location?.search ?? "").get("seed")
    registerDebugWorldStateProvider(() => this.world)
    registerReplayExportProvider(() => this.replayPlaybackSourceJsonl ?? this.replayRecorder.exportJsonl())
    registerReplayLoadProvider((jsonl) => this.loadReplayJsonl(jsonl))
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
    registerReplayExportProvider(null)
    registerReplayLoadProvider(null)
  }
  private applyReplaySettings(replay: ParsedReplay) {
    const settings = replay.meta?.settings ?? {}
    const mode = typeof settings.mode === "string" ? settings.mode : "ffa"
    const players = typeof settings.players === "number" ? Math.max(2, Math.round(settings.players)) : 4

    if (mode === "tdm") {
      selectedGameModeSignal.value = "tdm"
      tdmTeamSizeSignal.value = Math.max(2, Math.round(players / 2))
      return
    }

    if (mode === "duo") {
      selectedGameModeSignal.value = "duo"
      duoTeamCountSignal.value = Math.max(2, Math.round(players / 2))
      return
    }

    if (mode === "squad") {
      selectedGameModeSignal.value = "squad"
      squadTeamCountSignal.value = Math.max(2, Math.round(players / 4))
      return
    }

    selectedGameModeSignal.value = "ffa"
    ffaPlayerCountSignal.value = Math.max(2, players)
  }
  public async loadReplayJsonl(jsonl: string) {
    const replay = parseReplayJsonl(jsonl)
    if (!replay.meta?.seed || replay.inputs.length <= 0) {
      return false
    }

    this.applyReplaySettings(replay)
    this.pendingReplay = replay
    this.pendingReplaySourceJsonl = jsonl
    this.replaySeedOverride = replay.meta.seed
    await this.beginMatch(replay.meta.difficulty)

    if (this.pendingReplay !== replay || !this.world.running) {
      return false
    }

    this.replayPlayback = replay
    this.replayPlaybackSourceJsonl = this.pendingReplaySourceJsonl
    this.pendingReplay = null
    this.pendingReplaySourceJsonl = null
    this.replayPlaybackFrame = 0
    this.replayPlaybackWallClockSeconds = 0
    this.world.replayPlaybackActive = true
    return true
  }
  public resetReplayForMatch(difficulty: MatchDifficulty) {
    if (!this.pendingReplay) {
      this.replayPlayback = null
      this.replayPlaybackSourceJsonl = null
      this.replayPlaybackFrame = 0
      this.replayPlaybackWallClockSeconds = 0
      this.world.replayPlaybackActive = false
    }

    this.replaySeed = this.replaySeedOverride?.trim() || this.replaySeedFromUrl?.trim() || createReplaySeed()
    this.replaySeedOverride = null
    this.replayRandom = createSeededRandom(this.replaySeed)
    this.replayRecorder.reset({
      seed: this.replaySeed,
      difficulty,
      settings: {
        mode: this.currentMode,
        players: this.world.units.length,
        matchArenaStartRadius: this.matchArenaStartRadius,
        matchArenaEndRadius: this.matchArenaEndRadius,
        impactFeelLevel: this.world.impactFeelLevel,
      },
    })
  }
  public withReplayRandom<T>(action: () => T): T {
    return withRandomSource(this.replayRandom, action)
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
    this.world.replayPlaybackActive = false
    this.audioDirector.startMenu()
    finishMatchResult(this.world, this.currentMode, this.playerCoverageId())
  }
  public returnToMenu() {
    this.pendingReplay = null
    this.pendingReplaySourceJsonl = null
    this.replayPlayback = null
    this.replayPlaybackSourceJsonl = null
    this.replayPlaybackFrame = 0
    this.replayPlaybackWallClockSeconds = 0
    this.world.replayPlaybackActive = false
    returnToMenuForGame(this)
  }
  private syncReplayCrosshair() {
    const rect = this.canvas.getBoundingClientRect()
    const frameRect = this.canvas.parentElement?.getBoundingClientRect()
    const x = rect.left - (frameRect?.left ?? 0) + rect.width * (this.world.input.canvasX / VIEW_WIDTH)
    const y = rect.top - (frameRect?.top ?? 0) + rect.height * (this.world.input.canvasY / VIEW_HEIGHT)
    crosshairSignal.value = { x, y, visible: true }
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
    if (this.replayPlayback && this.world.running && !this.world.paused) {
      this.replayPlaybackWallClockSeconds += frameDt
      let consumedFrames = 0
      while (consumedFrames < 8 && this.world.running && !this.world.paused) {
        const frame = this.replayPlayback.inputs[this.replayPlaybackFrame]
        if (!frame) {
          this.world.replayPlaybackActive = false
          this.finishMatch()
          statusMessageSignal.value = ""
          return
        }

        const frameDuration = Math.max(0.001, frame.frameDt)
        if (this.replayPlaybackWallClockSeconds + 0.0005 < frameDuration) {
          break
        }

        this.replayPlaybackWallClockSeconds -= frameDuration
        applyReplayInputFrame(this.world.input, frame)
        this.syncReplayCrosshair()
        this.replayPlaybackFrame += 1
        consumedFrames += 1
        this.withReplayRandom(() => updateGame(this, frame.frameDt, frame.gameplayDt))
        if (this.world.finished) {
          this.world.replayPlaybackActive = false
          break
        }
      }
      return
    }

    if (this.world.running && !this.world.paused) {
      this.replayRecorder.record(frameDt, gameplayDt, this.world.input)
    }
    this.withReplayRandom(() => updateGame(this, frameDt, gameplayDt))
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
