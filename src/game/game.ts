import { AudioDirector, SfxSynth } from "./audio.ts"
import {
  clearMatchResultSignal,
  resetHudSignals,
  setFpsSignal,
  setMatchResultSignal,
  syncHudSignals,
  updateCoverageSignals,
  updatePlayerHpSignal,
  updatePlayerWeaponSignals,
} from "./adapters/hud-sync.ts"
import {
  crosshairSignal,
  debugGameSpeedSignal,
  debugImpactFeelLevelSignal,
  debugInfiniteReloadSignal,
  debugSkipToMatchEndSignal,
  duoTeamCountSignal,
  effectsVolumeSignal,
  ffaPlayerCountSignal,
  languageSignal,
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
import { ARENA_END_RADIUS, ARENA_START_RADIUS, clamp, lerp, randomRange } from "./utils.ts"
import {
  BOT_BASE_SPEED,
  BOT_RADIUS,
  EFFECT_SPEED,
  LOOT_PICKUP_INTERVAL_SECONDS,
  MATCH_DURATION_SECONDS,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  UNIT_BASE_HP,
  VIEW_HEIGHT,
  VIEW_WIDTH,
} from "./world/constants.ts"
import { createWorldState, type WorldState } from "./world/state.ts"
import { createBarrenGardenMap } from "./world/wfc-map.ts"
import {
  applyDamage,
  cyclePrimaryWeapon,
  equipPrimary,
  finishReload,
  firePrimary,
  randomLootablePrimary,
  startReload,
} from "./systems/combat.ts"
import {
  constrainUnitsToArena,
  damageObstaclesByExplosion,
  hitObstacle,
  resolveUnitCollisions,
  updateObstacleFlash,
} from "./systems/collisions.ts"
import {
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_ROCK,
  OBSTACLE_MATERIAL_WALL,
  OBSTACLE_MATERIAL_WAREHOUSE,
} from "./world/obstacle-grid.ts"
import { spawnFlowers, updateDamagePopups, updateFlowers } from "./systems/flowers.ts"
import { igniteMolotov, spawnFlamePatch, updateMolotovZones } from "./systems/molotov.ts"
import { collectNearbyPickup, spawnPickupAt, updatePickups } from "./systems/pickups.ts"
import { updateCombatFeel, updateCrosshairWorld, updatePlayer } from "./systems/player.ts"
import { updateProjectiles } from "./systems/projectiles.ts"
import { respawnUnit, setupWorldUnits, spawnAllUnits, spawnMapLoot, spawnObstacles } from "./systems/respawn.ts"
import { explodeGrenade, throwSecondary, updateThrowables } from "./systems/throwables.ts"
import { updateAI } from "./systems/ai.ts"
import { Flower, type Unit } from "./entities.ts"
import { HIGH_TIER_PRIMARY_IDS, PRIMARY_WEAPONS } from "./weapons.ts"
import {
  botPalette,
  BURNED_FACTION_COLOR,
  BURNED_FACTION_ID,
  BURNED_FACTION_LABEL,
  createFactionFlowerCounts,
  type FactionDescriptor,
} from "./factions.ts"
import type { GameModeId, PrimaryWeaponId, Team } from "./types.ts"
import { t } from "@lingui/core/macro"

import menuTrackUrl from "../assets/music/MY BLOOD IS YOURS.opus"
import gameplayTrackUrl from "../assets/music/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 01 MY DIVINE PERVERSIONS.ogg"

const BULLET_TRAIL_WIDTH_SCALE = 4
const SECONDARY_TRAIL_WIDTH_SCALE = 6
const BULLET_TRAIL_COLOR = "#ff9e3a"
const HIGH_TIER_BOX_DROP_CHANCE_START = 0.07
const HIGH_TIER_BOX_DROP_CHANCE_END = 0.5
const KILL_PETAL_COLORS = ["#8bff92", "#5cf47a", "#b4ffb8"]
const TEAM_COLOR_RAMP = [
  "#ff6f7b",
  "#68a8ff",
  "#84d8a4",
  "#f0bd6a",
  "#c9a5ff",
  "#ff9dd2",
]

export class FlowerArenaGame {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private world: WorldState
  private inputAdapter: InputAdapter | null = null
  private raf = 0
  private previousTime = 0
  private smoothedFps = 0
  private audioDirector = new AudioDirector(menuTrackUrl, gameplayTrackUrl)
  private sfx = new SfxSynth()
  private currentMode: GameModeId = "ffa"
  private botPool: Unit[]
  private lastMusicVolume = -1
  private lastEffectsVolume = -1
  private lastLocale = languageSignal.value

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
    this.botPool = [...this.world.bots]
    this.applyMatchMode()
    this.syncPlayerOptions()

    this.setupWorld()
    this.setupInput()
    resetHudSignals(this.world, this.canvas)
    renderScene({ context: this.context, world: this.world, dt: 0 })
  }

  private localizeFactionLabel(factionId: string) {
    if (this.currentMode === "ffa") {
      if (factionId === this.world.player.id) {
        return t`You`
      }
      const botIndex = Number(factionId.replace("bot-", ""))
      if (Number.isFinite(botIndex) && botIndex > 0) {
        return t`Bot ${botIndex}`
      }
      return factionId
    }

    if (this.currentMode === "tdm") {
      if (factionId === "red") {
        return t`Red (You)`
      }
      if (factionId === "blue") {
        return t`Blue`
      }
      return factionId
    }

    const teamIndex = Number(factionId.replace("team-", ""))
    if (!Number.isFinite(teamIndex) || teamIndex <= 0) {
      return factionId
    }

    if (this.currentMode === "duo") {
      return teamIndex === 1 ? t`Duo 1 (You)` : t`Duo ${teamIndex}`
    }

    return teamIndex === 1 ? t`Squad 1 (You)` : t`Squad ${teamIndex}`
  }

  private syncPlayerOptions() {
    const musicVolume = musicVolumeSignal.value
    if (musicVolume !== this.lastMusicVolume) {
      this.lastMusicVolume = musicVolume
      this.audioDirector.setMusicVolume(musicVolume)
    }

    const effectsVolume = effectsVolumeSignal.value
    if (effectsVolume !== this.lastEffectsVolume) {
      this.lastEffectsVolume = effectsVolume
      this.sfx.setEffectsVolume(effectsVolume)
    }

    const locale = languageSignal.value
    if (locale !== this.lastLocale) {
      this.lastLocale = locale
      this.world.factions = this.world.factions.map((faction) => ({
        ...faction,
        label: this.localizeFactionLabel(faction.id),
      }))
      updateCoverageSignals(this.world)
    }
  }

  start() {
    void this.audioDirector.tryAutoplayMenu().then((started) => {
      if (started) {
        this.world.audioPrimed = true
      }
    })
    this.previousTime = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.inputAdapter?.destroy()
    this.audioDirector.stopAll()
  }

  private setupWorld() {
    setupWorldUnits(
      this.world,
      (unitId, weaponId, ammo) =>
        equipPrimary(unitId, this.world, weaponId, ammo, () => updatePlayerWeaponSignals(this.world)),
    )
  }

  private playerCoverageId() {
    return this.currentMode === "ffa" ? this.world.player.id : this.world.player.team
  }

  private resolveScoreOwnerId(ownerId: string) {
    if (ownerId === BURNED_FACTION_ID || this.currentMode === "ffa") {
      return ownerId
    }

    const owner = this.world.units.find((unit) => unit.id === ownerId)
    return owner?.team ?? ownerId
  }

  private applyMatchMode() {
    const mode = selectedGameModeSignal.value
    const requestedPlayers = mode === "ffa"
      ? clamp(Math.round(ffaPlayerCountSignal.value), 2, 8)
      : mode === "tdm"
      ? clamp(Math.round(tdmTeamSizeSignal.value), 2, 6) * 2
      : mode === "duo"
      ? clamp(Math.round(duoTeamCountSignal.value), 2, 6) * 2
      : clamp(Math.round(squadTeamCountSignal.value), 2, 3) * 4
    const botCount = clamp(requestedPlayers - 1, 1, this.botPool.length)
    const totalPlayers = botCount + 1
    const activeBots = this.botPool.slice(0, botCount)

    this.currentMode = mode
    if (mode === "ffa") {
      ffaPlayerCountSignal.value = totalPlayers
    }

    if (mode === "tdm") {
      tdmTeamSizeSignal.value = Math.floor(totalPlayers / 2)
    }

    if (mode === "duo") {
      duoTeamCountSignal.value = Math.max(2, Math.floor(totalPlayers / 2))
    }

    if (mode === "squad") {
      squadTeamCountSignal.value = Math.max(2, Math.floor(totalPlayers / 4))
    }

    this.world.bots = activeBots
    this.world.units = [this.world.player, ...activeBots]

    let factions: FactionDescriptor[] = []
    if (mode === "ffa") {
      this.world.player.team = this.world.player.id
      factions = [{ id: this.world.player.id, label: t`You`, color: "#f2ffe8" }]
      for (let index = 0; index < activeBots.length; index += 1) {
        const bot = activeBots[index]
        bot.team = bot.id
        factions.push({
          id: bot.id,
          label: t`Bot ${index + 1}`,
          color: botPalette(bot.id).tone,
        })
      }
    } else if (mode === "tdm") {
      const redSlots = Math.floor(totalPlayers / 2)
      const redBotCount = Math.max(0, redSlots - 1)
      this.world.player.team = "red"
      for (let index = 0; index < activeBots.length; index += 1) {
        activeBots[index].team = index < redBotCount ? "red" : "blue"
      }

      factions = [
        { id: "red", label: t`Red (You)`, color: TEAM_COLOR_RAMP[0] },
        { id: "blue", label: t`Blue`, color: TEAM_COLOR_RAMP[1] },
      ]
    } else {
      const teamSize = mode === "duo" ? 2 : 4
      const teamCount = Math.max(2, Math.ceil(totalPlayers / teamSize))
      const teamIds = Array.from({ length: teamCount }, (_, index) => `team-${index + 1}`)
      const units = [this.world.player, ...activeBots]

      for (let index = 0; index < units.length; index += 1) {
        const teamIndex = Math.min(teamIds.length - 1, Math.floor(index / teamSize))
        units[index].team = teamIds[teamIndex]
      }

      factions = teamIds.map((teamId, index) => ({
        id: teamId,
        label: mode === "duo"
          ? index === 0 ? t`Duo 1 (You)` : t`Duo ${index + 1}`
          : index === 0
          ? t`Squad 1 (You)`
          : t`Squad ${index + 1}`,
        color: TEAM_COLOR_RAMP[index % TEAM_COLOR_RAMP.length],
      }))
    }

    this.world.factions = factions
    this.world.factionFlowerCounts = createFactionFlowerCounts(factions)
  }

  private canSpawnFlamethrower() {
    return this.world.timeRemaining <= MATCH_DURATION_SECONDS * 0.5
  }

  private randomHighTierPrimary() {
    if (HIGH_TIER_PRIMARY_IDS.length <= 0) {
      return "battle-rifle" as PrimaryWeaponId
    }

    const index = Math.floor(Math.random() * HIGH_TIER_PRIMARY_IDS.length)
    return HIGH_TIER_PRIMARY_IDS[index] ?? HIGH_TIER_PRIMARY_IDS[0]
  }

  private highTierLootBoxChance() {
    const elapsedRatio = clamp((MATCH_DURATION_SECONDS - this.world.timeRemaining) / MATCH_DURATION_SECONDS, 0, 1)
    return lerp(HIGH_TIER_BOX_DROP_CHANCE_START, HIGH_TIER_BOX_DROP_CHANCE_END, elapsedRatio)
  }

  private spawnGuaranteedCenterHighTierLoot() {
    spawnPickupAt(this.world, { x: 0, y: 0 }, {
      force: true,
      randomLootablePrimary: () => "assault",
      randomHighTierPrimary: () => this.randomHighTierPrimary(),
      highTierChance: 1,
    })
  }

  private localizePrimaryWeapon(weaponId: PrimaryWeaponId) {
    if (weaponId === "pistol") {
      return t`Pistol`
    }
    if (weaponId === "assault") {
      return t`Assault Rifle`
    }
    if (weaponId === "shotgun") {
      return t`Shotgun`
    }
    if (weaponId === "flamethrower") {
      return t`Flamethrower`
    }
    if (weaponId === "auto-shotgun") {
      return t`Auto Shotgun`
    }
    if (weaponId === "battle-rifle") {
      return t`Battle Rifle`
    }
    if (weaponId === "grenade-launcher") {
      return t`Grenade Launcher`
    }

    return t`Rocket Launcher`
  }

  private randomLootablePrimaryForMatch() {
    if (this.canSpawnFlamethrower()) {
      return randomLootablePrimary()
    }

    return Math.random() > 0.5 ? "assault" : "shotgun"
  }

  private spawnLootPickupAt(
    x: number,
    y: number,
    force = false,
    allowHighTier = false,
    forceHighTier = false,
  ) {
    const highTierChance = forceHighTier ? 1 : allowHighTier ? this.highTierLootBoxChance() : 0

    spawnPickupAt(this.world, { x, y }, {
      force,
      randomLootablePrimary: () => {
        const id = this.randomLootablePrimaryForMatch()
        return id === "pistol" ? "assault" : id
      },
      randomHighTierPrimary: () => this.randomHighTierPrimary(),
      highTierChance,
    })
  }

  private setupInput() {
    this.inputAdapter = setupInputAdapter(this.canvas, this.world, {
      onPrimeAudio: () => this.primeAudio(),
      onBeginMatch: () => this.beginMatch(),
      onReturnToMenu: () => this.returnToMenu(),
      onTogglePause: () => this.togglePause(),
      onPrimaryDown: () => this.firePrimary(this.world.player.id),
      onPrimarySwap: (direction) => this.swapPrimary(this.world.player.id, direction),
      onSecondaryDown: () => this.throwSecondary(this.world.player.id),
      onCrosshair: (x, y, visible) => {
        crosshairSignal.value = { x, y, visible }
      },
    })
  }

  private primeAudio() {
    if (this.world.audioPrimed) {
      return
    }

    this.world.audioPrimed = true
    this.audioDirector.prime()
    this.sfx.prime()
    this.audioDirector.startMenu()
  }

  private beginMatch() {
    this.applyMatchMode()
    this.world.started = true
    this.world.running = true
    this.world.paused = false
    this.world.finished = false
    this.world.timeRemaining = MATCH_DURATION_SECONDS
    this.world.arenaRadius = ARENA_START_RADIUS
    this.world.pickupTimer = LOOT_PICKUP_INTERVAL_SECONDS
    this.world.factionFlowerCounts = createFactionFlowerCounts(this.world.factions)
    this.world.playerBulletsFired = 0
    this.world.playerBulletsHit = 0
    this.world.playerKills = 0
    this.world.playerDamageDealt = 0
    this.world.playerFlowerTotal = 0
    this.world.impactFeelLevel = clamp(debugImpactFeelLevelSignal.value, 1, 2)
    this.world.terrainMap = createBarrenGardenMap(112)
    this.world.flowerDensityGrid = new Uint16Array(this.world.terrainMap.size * this.world.terrainMap.size)
    this.world.flowerCellHead = new Int32Array(this.world.terrainMap.size * this.world.terrainMap.size)
    this.world.flowerCellHead.fill(-1)
    this.world.flowerDirtyCount = 0

    const player = this.world.player
    player.maxHp = UNIT_BASE_HP
    player.hp = UNIT_BASE_HP
    player.radius = PLAYER_RADIUS
    player.damageMultiplier = 1
    player.fireRateMultiplier = 1
    player.bulletSizeMultiplier = 1
    player.speed = PLAYER_BASE_SPEED
    player.grenadeTimer = 1
    player.primarySlots.length = 0
    player.primarySlotIndex = 0
    player.primarySlotSequence = 0
    this.equipPrimary(player.id, "pistol", Number.POSITIVE_INFINITY)

    for (const bot of this.world.bots) {
      bot.maxHp = UNIT_BASE_HP
      bot.hp = UNIT_BASE_HP
      bot.radius = BOT_RADIUS
      bot.damageMultiplier = 1
      bot.fireRateMultiplier = 1
      bot.bulletSizeMultiplier = 1
      bot.speed = BOT_BASE_SPEED
      bot.grenadeTimer = 1
      bot.primarySlots.length = 0
      bot.primarySlotIndex = 0
      bot.primarySlotSequence = 0
      this.equipPrimary(bot.id, "pistol", Number.POSITIVE_INFINITY)
      bot.secondaryMode = Math.random() > 0.58 ? "molotov" : "grenade"
    }

    for (const projectile of this.world.projectiles) {
      projectile.active = false
      projectile.trailCooldown = 0
      projectile.trailDirX = 1
      projectile.trailDirY = 0
      projectile.trailReady = false
    }
    for (const throwable of this.world.throwables) {
      throwable.active = false
      throwable.trailCooldown = 0
      throwable.trailDirX = 1
      throwable.trailDirY = 0
      throwable.trailReady = false
    }
    for (let flowerIndex = 0; flowerIndex < this.world.flowers.length; flowerIndex += 1) {
      const flower = this.world.flowers[flowerIndex]
      flower.slotIndex = flowerIndex
      flower.active = false
      flower.renderDirty = false
      flower.team = "white"
      flower.ownerId = ""
      flower.bloomCell = -1
      flower.bloomWeight = 1
      flower.prevInCell = -1
      flower.nextInCell = -1
      flower.bloomDelay = 0
      flower.pop = 0
      flower.size = 0
      flower.targetSize = 0
    }
    for (const popup of this.world.damagePopups) popup.active = false
    for (const pickup of this.world.pickups) {
      pickup.active = false
      pickup.highTier = false
    }
    for (const zone of this.world.molotovZones) zone.active = false
    for (const obstacle of this.world.obstacles) {
      obstacle.active = false
      obstacle.lootDropped = false
    }
    for (const debris of this.world.obstacleDebris) debris.active = false
    for (const petal of this.world.killPetals) petal.active = false
    for (const casing of this.world.shellCasings) casing.active = false
    for (const trail of this.world.flightTrails) trail.active = false
    this.world.flightTrailCursor = 0
    for (const explosion of this.world.explosions) explosion.active = false

    spawnObstacles(this.world)
    spawnAllUnits(this.world)
    spawnMapLoot(this.world, {
      spawnPickupAt: (x, y) => this.spawnLootPickupAt(x, y),
    })
    this.spawnGuaranteedCenterHighTierLoot()

    this.world.cameraShake = 0
    this.world.cameraOffset.set(0, 0)
    this.world.cameraKick.set(0, 0)
    this.world.hitStop = 0

    updateCoverageSignals(this.world)
    syncHudSignals(this.world)
    menuVisibleSignal.value = false
    pausedSignal.value = false
    clearMatchResultSignal()
    statusMessageSignal.value = ""
    this.audioDirector.startGameplay()
  }

  private finishMatch() {
    this.world.running = false
    this.world.paused = false
    this.world.finished = true
    this.audioDirector.startMenu()

    const factionStandings = this.world.factions
      .map((faction) => ({
        id: faction.id,
        label: faction.label,
        color: faction.color,
        flowers: this.world.factionFlowerCounts[faction.id] ?? 0,
      }))
      .sort((left, right) => right.flowers - left.flowers)

    const winner = factionStandings[0]

    const burntCount = this.world.factionFlowerCounts[BURNED_FACTION_ID] ?? 0
    const total = factionStandings.reduce((sum, faction) => sum + faction.flowers, 0) + burntCount

    const standings = [...factionStandings]
    if (burntCount > 0) {
      standings.push({
        id: BURNED_FACTION_ID,
        label: BURNED_FACTION_LABEL,
        color: BURNED_FACTION_COLOR,
        flowers: burntCount,
      })
    }

    const standingsWithPercent = standings
      .sort((left, right) => right.flowers - left.flowers)
      .map((faction) => ({
        ...faction,
        percent: total > 0 ? (100 * faction.flowers) / total : 100 / Math.max(1, standings.length),
      }))

    if (winner) {
      const message = winner.id === this.playerCoverageId()
        ? t`Time up. Your trail dominates the arena`
        : t`Time up. ${winner.label} overwhelms the field`
      statusMessageSignal.value = message

      const winnerPercent = standingsWithPercent.find((entry) => entry.id === winner.id)?.percent ?? 0
      const runnerUpFlowers = factionStandings[1]?.flowers ?? 0
      const playerRank = Math.max(
        1,
        factionStandings.findIndex((faction) => faction.id === this.playerCoverageId()) + 1,
      )
      const factionCount = factionStandings.length
      const shotsFired = this.world.playerBulletsFired
      const shotsHit = this.world.playerBulletsHit
      const hitRate = shotsFired > 0 ? Math.min(100, (shotsHit / shotsFired) * 100) : 0
      const stats = [
        { label: t`Total Flowers`, value: total.toLocaleString() },
        { label: t`Winner Share`, value: `${winnerPercent.toFixed(1)}%` },
        { label: t`Your Place`, value: `${playerRank}/${factionCount}` },
        {
          label: t`Lead Margin`,
          value: t`${Math.max(0, winner.flowers - runnerUpFlowers)} flowers`,
        },
        { label: t`Bullets Fired`, value: shotsFired.toLocaleString() },
        { label: t`Bullets Hit`, value: shotsHit.toLocaleString() },
        { label: t`Hit Rate`, value: `${hitRate.toFixed(1)}%` },
        { label: t`Player Kills`, value: this.world.playerKills.toString() },
        { label: t`Damage`, value: Math.round(this.world.playerDamageDealt).toLocaleString() },
      ]

      setMatchResultSignal(
        { label: winner.label, color: winner.color },
        standingsWithPercent.map((entry) => ({
          color: entry.color,
          percent: entry.percent,
        })),
        stats,
        standingsWithPercent,
      )
    }

    pausedSignal.value = false
  }

  private returnToMenu() {
    this.world.running = false
    this.world.paused = false
    this.world.finished = false
    this.world.started = false
    this.world.factionFlowerCounts = createFactionFlowerCounts(this.world.factions)
    updateCoverageSignals(this.world)
    menuVisibleSignal.value = true
    pausedSignal.value = false
    clearMatchResultSignal()
    statusMessageSignal.value = t`Click once to wake audio, then begin fighting`
    this.audioDirector.startMenu()
  }

  private togglePause() {
    if (!this.world.running || this.world.finished) {
      return
    }

    this.world.paused = !this.world.paused
    pausedSignal.value = this.world.paused
  }

  private updateExplosions(dt: number) {
    for (const explosion of this.world.explosions) {
      if (!explosion.active) {
        continue
      }

      explosion.life -= dt
      if (explosion.life <= 0) {
        explosion.active = false
      }
    }
  }

  private obstacleDebrisPalette(material: number) {
    if (material === OBSTACLE_MATERIAL_BOX) {
      return ["#df6f3f", "#f6e5a8", "#6f2d2b"]
    }
    if (material === OBSTACLE_MATERIAL_WALL) {
      return ["#ab6850", "#874b39", "#6e3528"]
    }
    if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
      return ["#9ca293", "#757b70", "#5f655d"]
    }
    if (material === OBSTACLE_MATERIAL_ROCK) {
      return ["#8f948b", "#676a64", "#5d605a"]
    }
    return ["#b9beb5", "#8f948b", "#696f67"]
  }

  private spawnObstacleDebris(x: number, y: number, material: number) {
    const palette = this.obstacleDebrisPalette(material)
    const pieces = material === OBSTACLE_MATERIAL_BOX ? 12 : 8

    for (let index = 0; index < pieces; index += 1) {
      const slot = this.world.obstacleDebris.find((debris) => !debris.active) ?? this.world.obstacleDebris[0]
      const angle = Math.random() * Math.PI * 2
      const speed = randomRange(2.5, 7.8)
      slot.active = true
      slot.position.set(x + randomRange(-0.22, 0.22), y + randomRange(-0.22, 0.22))
      slot.velocity.set(Math.cos(angle) * speed, Math.sin(angle) * speed - randomRange(0.2, 1.4))
      slot.rotation = Math.random() * Math.PI * 2
      slot.angularVelocity = randomRange(-7.2, 7.2)
      slot.size = randomRange(0.08, 0.2)
      slot.maxLife = randomRange(0.24, 0.52)
      slot.life = slot.maxLife
      slot.color = palette[Math.floor(Math.random() * palette.length)]
    }
  }

  private updateObstacleDebris(dt: number) {
    const drag = clamp(1 - dt * 5.6, 0, 1)
    for (const debris of this.world.obstacleDebris) {
      if (!debris.active) {
        continue
      }

      debris.life -= dt
      if (debris.life <= 0) {
        debris.active = false
        continue
      }

      debris.velocity.x *= drag
      debris.velocity.y = debris.velocity.y * drag + dt * 12.5
      debris.position.x += debris.velocity.x * dt
      debris.position.y += debris.velocity.y * dt
      debris.rotation += debris.angularVelocity * dt
    }
  }

  private allocKillPetal() {
    return this.world.killPetals.find((petal) => !petal.active) ?? this.world.killPetals[0]
  }

  private spawnKillPetalBurst(x: number, y: number) {
    const count = 22
    for (let index = 0; index < count; index += 1) {
      const petal = this.allocKillPetal()
      const angle = Math.random() * Math.PI * 2
      const speed = randomRange(6.4, 21.6)
      petal.active = true
      petal.position.set(
        x + randomRange(-0.18, 0.18),
        y + randomRange(-0.18, 0.18),
      )
      petal.velocity.set(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
      )
      petal.rotation = randomRange(0, Math.PI * 2)
      petal.angularVelocity = randomRange(-12.5, 12.5)
      petal.size = randomRange(0.06, 0.14)
      petal.maxLife = 0.25
      petal.life = petal.maxLife
      petal.color = KILL_PETAL_COLORS[Math.floor(Math.random() * KILL_PETAL_COLORS.length)]
    }
  }

  private updateKillPetals(dt: number) {
    const drag = clamp(1 - dt * 2.8, 0, 1)
    for (const petal of this.world.killPetals) {
      if (!petal.active) {
        continue
      }

      petal.life -= dt
      if (petal.life <= 0) {
        petal.active = false
        continue
      }

      petal.velocity.x *= drag
      petal.velocity.y *= drag
      petal.position.x += petal.velocity.x * dt
      petal.position.y += petal.velocity.y * dt
      petal.rotation += petal.angularVelocity * dt
    }
  }

  private spawnShellCasing(unit: Unit) {
    if (
      unit.primaryWeapon === "flamethrower" ||
      unit.primaryWeapon === "grenade-launcher" ||
      unit.primaryWeapon === "rocket-launcher"
    ) {
      return
    }

    const slot = this.world.shellCasings.find((casing) => !casing.active) ?? this.world.shellCasings[0]
    const aimAngle = Math.atan2(unit.aim.y, unit.aim.x)
    const side = Math.random() > 0.5 ? 1 : -1
    const angle = aimAngle + side * Math.PI * 0.5 + randomRange(-0.4, 0.4)
    const baseSpeed = unit.primaryWeapon === "shotgun" ? 7.6 : unit.primaryWeapon === "assault" ? 6.4 : 5.2
    slot.active = true
    slot.position.set(
      unit.position.x - unit.aim.x * 0.12 + randomRange(-0.07, 0.07),
      unit.position.y - unit.aim.y * 0.12 + randomRange(-0.07, 0.07),
    )
    slot.velocity.set(Math.cos(angle) * baseSpeed, Math.sin(angle) * baseSpeed)
    slot.rotation = randomRange(0, Math.PI * 2)
    slot.angularVelocity = randomRange(-12, 12)
    slot.size = randomRange(0.048, 0.084)
    slot.maxLife = randomRange(0.55, 1.1)
    slot.life = slot.maxLife
    slot.bounceCount = 0
  }

  private updateShellCasings(dt: number) {
    const drag = clamp(1 - dt * 4.8, 0, 1)
    for (const casing of this.world.shellCasings) {
      if (!casing.active) {
        continue
      }

      casing.life -= dt
      if (casing.life <= 0) {
        casing.active = false
        continue
      }

      casing.velocity.x *= drag
      casing.velocity.y *= drag
      casing.position.x += casing.velocity.x * dt
      casing.position.y += casing.velocity.y * dt
      casing.rotation += casing.angularVelocity * dt
      casing.angularVelocity *= drag

      const distance = Math.hypot(casing.position.x, casing.position.y) || 1
      const maxDistance = this.world.arenaRadius - casing.size * 0.5
      if (distance > maxDistance && casing.bounceCount < 3) {
        const normalX = casing.position.x / distance
        const normalY = casing.position.y / distance
        casing.position.x = normalX * maxDistance
        casing.position.y = normalY * maxDistance
        const reflected = casing.velocity.x * normalX + casing.velocity.y * normalY
        casing.velocity.x -= normalX * reflected * 1.8
        casing.velocity.y -= normalY * reflected * 1.8
        casing.velocity.x *= 0.52
        casing.velocity.y *= 0.52
        casing.bounceCount += 1
      }
    }
  }

  private emitFlightTrailSegment(
    x: number,
    y: number,
    directionX: number,
    directionY: number,
    length: number,
    width: number,
    color: string,
    alpha: number,
    life: number,
  ) {
    const magnitude = Math.hypot(directionX, directionY)
    if (magnitude <= 0.00001 || life <= 0.001 || alpha <= 0.001) {
      return
    }

    const slot = this.world.flightTrails[this.world.flightTrailCursor]
    this.world.flightTrailCursor = (this.world.flightTrailCursor + 1) % this.world.flightTrails.length
    slot.active = true
    slot.position.set(x, y)
    slot.direction.set(directionX / magnitude, directionY / magnitude)
    slot.length = Math.max(0.02, length)
    slot.width = Math.max(0.01, width)
    slot.color = color
    slot.alpha = clamp(alpha, 0, 1)
    slot.maxLife = life
    slot.life = life
  }

  private emitProjectileTrail(projectile: WorldState["projectiles"][number]) {
    if (!projectile.active) {
      return
    }

    const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
    if (!projectile.trailReady) {
      projectile.trailX = projectile.position.x
      projectile.trailY = projectile.position.y
      const length = speed || 1
      projectile.trailDirX = projectile.velocity.x / length
      projectile.trailDirY = projectile.velocity.y / length
      projectile.trailReady = true
      return
    }

    const deltaX = projectile.position.x - projectile.trailX
    const deltaY = projectile.position.y - projectile.trailY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance <= 0.001) {
      return
    }

    if (speed <= 0.08) {
      projectile.trailX = projectile.position.x
      projectile.trailY = projectile.position.y
      return
    }

    const spacing = projectile.kind === "flame"
      ? 0.1
      : projectile.kind === "rocket"
      ? 0.09
      : 0.08
    const sampleCount = Math.max(1, Math.ceil(distance / spacing))
    const speedFactor = clamp(speed / (projectile.kind === "flame" ? 24 : projectile.kind === "rocket" ? 18 : 44), 0, 2)
    let previousX = projectile.trailX
    let previousY = projectile.trailY
    let smoothDirX = projectile.trailDirX
    let smoothDirY = projectile.trailDirY
    const smoothing = projectile.kind === "flame" ? 0.34 : 0.28

    for (let index = 1; index <= sampleCount; index += 1) {
      const t = index / sampleCount
      const sampleX = projectile.trailX + deltaX * t
      const sampleY = projectile.trailY + deltaY * t

      const stepX = sampleX - previousX
      const stepY = sampleY - previousY
      const stepLength = Math.hypot(stepX, stepY)
      if (stepLength > 0.0001) {
        const targetDirX = stepX / stepLength
        const targetDirY = stepY / stepLength
        smoothDirX += (targetDirX - smoothDirX) * smoothing
        smoothDirY += (targetDirY - smoothDirY) * smoothing
        const smoothLength = Math.hypot(smoothDirX, smoothDirY) || 1
        smoothDirX /= smoothLength
        smoothDirY /= smoothLength
      }

      if (projectile.kind === "flame") {
        this.emitFlightTrailSegment(
          sampleX,
          sampleY,
          smoothDirX,
          smoothDirY,
          0.2 + speedFactor * 0.18,
          (0.085 + speedFactor * 0.024) * BULLET_TRAIL_WIDTH_SCALE,
          "#ffd8af",
          0.4,
          0.11 + speedFactor * 0.05,
        )
      } else if (projectile.kind === "rocket") {
        this.emitFlightTrailSegment(
          sampleX,
          sampleY,
          smoothDirX,
          smoothDirY,
          0.42 + speedFactor * 0.3,
          (0.08 + speedFactor * 0.03) * BULLET_TRAIL_WIDTH_SCALE,
          "#f5f8ff",
          0.78,
          0.18 + speedFactor * 0.08,
        )
        this.emitFlightTrailSegment(
          sampleX - smoothDirX * 0.15,
          sampleY - smoothDirY * 0.15,
          smoothDirX,
          smoothDirY,
          0.3 + speedFactor * 0.22,
          (0.06 + speedFactor * 0.02) * BULLET_TRAIL_WIDTH_SCALE,
          "#ffba8f",
          0.62,
          0.14 + speedFactor * 0.07,
        )
      } else {
        this.emitFlightTrailSegment(
          sampleX,
          sampleY,
          smoothDirX,
          smoothDirY,
          0.34 + speedFactor * 0.22,
          (0.028 + speedFactor * 0.01) * BULLET_TRAIL_WIDTH_SCALE,
          BULLET_TRAIL_COLOR,
          0.9,
          0.14 + speedFactor * 0.08,
        )
      }

      previousX = sampleX
      previousY = sampleY
    }

    projectile.trailX = projectile.position.x
    projectile.trailY = projectile.position.y
    projectile.trailDirX = smoothDirX
    projectile.trailDirY = smoothDirY
  }

  private emitThrowableTrail(throwable: WorldState["throwables"][number]) {
    if (!throwable.active) {
      return
    }

    const speed = Math.hypot(throwable.velocity.x, throwable.velocity.y)
    if (!throwable.trailReady) {
      throwable.trailX = throwable.position.x
      throwable.trailY = throwable.position.y
      const length = speed || 1
      throwable.trailDirX = throwable.velocity.x / length
      throwable.trailDirY = throwable.velocity.y / length
      throwable.trailReady = true
      return
    }

    const deltaX = throwable.position.x - throwable.trailX
    const deltaY = throwable.position.y - throwable.trailY
    const distance = Math.hypot(deltaX, deltaY)
    if (distance <= 0.001) {
      return
    }

    if (speed <= 0.18) {
      throwable.trailX = throwable.position.x
      throwable.trailY = throwable.position.y
      return
    }

    const spacing = throwable.mode === "grenade" ? 0.09 : 0.12
    const sampleCount = Math.max(1, Math.ceil(distance / spacing))
    const speedFactor = clamp(speed / 20, 0, 1.5)
    let previousX = throwable.trailX
    let previousY = throwable.trailY
    let smoothDirX = throwable.trailDirX
    let smoothDirY = throwable.trailDirY
    const smoothing = throwable.mode === "grenade" ? 0.3 : 0.36

    for (let index = 1; index <= sampleCount; index += 1) {
      const t = index / sampleCount
      const sampleX = throwable.trailX + deltaX * t
      const sampleY = throwable.trailY + deltaY * t

      const stepX = sampleX - previousX
      const stepY = sampleY - previousY
      const stepLength = Math.hypot(stepX, stepY)
      if (stepLength > 0.0001) {
        const targetDirX = stepX / stepLength
        const targetDirY = stepY / stepLength
        smoothDirX += (targetDirX - smoothDirX) * smoothing
        smoothDirY += (targetDirY - smoothDirY) * smoothing
        const smoothLength = Math.hypot(smoothDirX, smoothDirY) || 1
        smoothDirX /= smoothLength
        smoothDirY /= smoothLength
      }

      if (throwable.mode === "grenade") {
        this.emitFlightTrailSegment(
          sampleX,
          sampleY,
          smoothDirX,
          smoothDirY,
          0.22 + speedFactor * 0.2,
          (0.058 + speedFactor * 0.024) * SECONDARY_TRAIL_WIDTH_SCALE,
          "#f7faee",
          0.54,
          0.16 + speedFactor * 0.07,
        )
      } else {
        this.emitFlightTrailSegment(
          sampleX,
          sampleY,
          smoothDirX,
          smoothDirY,
          0.18 + speedFactor * 0.15,
          (0.066 + speedFactor * 0.018) * SECONDARY_TRAIL_WIDTH_SCALE,
          "#ffd2a2",
          0.42,
          0.13 + speedFactor * 0.05,
        )
      }

      previousX = sampleX
      previousY = sampleY
    }

    throwable.trailX = throwable.position.x
    throwable.trailY = throwable.position.y
    throwable.trailDirX = smoothDirX
    throwable.trailDirY = smoothDirY
  }

  private emitProjectileTrailEnd(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    kind: "ballistic" | "flame" | "grenade" | "rocket",
  ) {
    const speed = Math.hypot(velocityX, velocityY)
    if (speed <= 0.04) {
      return
    }

    const directionX = velocityX / speed
    const directionY = velocityY / speed
    const count = kind === "flame" ? 1 : kind === "rocket" ? 3 : 2
    for (let index = 0; index < count; index += 1) {
      const back = index * (kind === "flame" ? 0.14 : kind === "rocket" ? 0.18 : 0.22)
      if (kind === "flame") {
        this.emitFlightTrailSegment(
          x - directionX * back,
          y - directionY * back,
          directionX,
          directionY,
          0.2,
          0.1 * BULLET_TRAIL_WIDTH_SCALE,
          "#ffd4a8",
          0.32,
          0.09,
        )
        continue
      }

      if (kind === "rocket") {
        this.emitFlightTrailSegment(
          x - directionX * back,
          y - directionY * back,
          directionX,
          directionY,
          0.62 - index * 0.1,
          0.068 * BULLET_TRAIL_WIDTH_SCALE,
          "#f4f7ff",
          0.68 - index * 0.14,
          0.14 + index * 0.04,
        )
        continue
      }

      this.emitFlightTrailSegment(
        x - directionX * back,
        y - directionY * back,
        directionX,
        directionY,
        0.42 - index * 0.12,
        0.038 * BULLET_TRAIL_WIDTH_SCALE,
        BULLET_TRAIL_COLOR,
        0.76 - index * 0.22,
        0.1 + index * 0.03,
      )
    }
  }

  private emitThrowableTrailEnd(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    mode: "grenade" | "molotov",
  ) {
    const speed = Math.hypot(velocityX, velocityY)
    if (speed <= 0.05) {
      return
    }

    const directionX = velocityX / speed
    const directionY = velocityY / speed
    if (mode === "grenade") {
      this.emitFlightTrailSegment(
        x,
        y,
        directionX,
        directionY,
        0.7,
        0.09 * SECONDARY_TRAIL_WIDTH_SCALE,
        "#f5f8ea",
        0.5,
        0.16,
      )
      return
    }

    this.emitFlightTrailSegment(
      x,
      y,
      directionX,
      directionY,
      0.46,
      0.1 * SECONDARY_TRAIL_WIDTH_SCALE,
      "#ffd2a2",
      0.4,
      0.12,
    )
  }

  private updateFlightTrailEmitters() {
    for (const projectile of this.world.projectiles) {
      this.emitProjectileTrail(projectile)
    }

    for (const throwable of this.world.throwables) {
      this.emitThrowableTrail(throwable)
    }
  }

  private updateFlightTrails(dt: number) {
    for (const trail of this.world.flightTrails) {
      if (!trail.active) {
        continue
      }

      trail.life -= dt
      if (trail.life <= 0) {
        trail.active = false
      }
    }
  }

  private spawnExplosion(x: number, y: number, radius: number) {
    const slot = this.world.explosions.find((explosion) => !explosion.active) ?? this.world.explosions[0]
    slot.active = true
    slot.position.set(x, y)
    slot.radius = radius
    slot.life = 0.24
  }

  private applyRadialExplosionDamage(
    x: number,
    y: number,
    radius: number,
    damage: number,
    sourceId: string,
    sourceTeam: Team,
    useFalloff = false,
  ) {
    const radiusSq = radius * radius
    for (const unit of this.world.units) {
      if (unit.team === sourceTeam && unit.id !== sourceId) {
        continue
      }

      const dsq = (unit.position.x - x) ** 2 + (unit.position.y - y) ** 2
      if (dsq > radiusSq) {
        continue
      }

      const distance = Math.sqrt(dsq)
      const falloff = 1 - clamp(distance / radius, 0, 1)
      const resolvedDamage = useFalloff
        ? Math.max(1, damage * (0.35 + falloff * 0.65))
        : damage

      this.applyDamage(
        unit.id,
        resolvedDamage,
        sourceId,
        sourceTeam,
        unit.position.x,
        unit.position.y,
        unit.position.x - x,
        unit.position.y - y,
        "projectile",
      )
    }
  }

  private damageObstaclesAtExplosion(x: number, y: number, radius: number) {
    damageObstaclesByExplosion(this.world, x, y, radius, {
      onSfxHit: () => this.sfx.hit(),
      onSfxBreak: () => this.sfx.obstacleBreak(),
      onObstacleDestroyed: (dropX, dropY, material) => this.spawnObstacleDebris(dropX, dropY, material),
      onBoxDestroyed: (dropX, dropY, highTier) => this.spawnLootPickupAt(dropX, dropY, true, highTier, highTier),
    })
  }

  private explodeProjectilePayload(projectile: WorldState["projectiles"][number]) {
    if (projectile.kind === "grenade") {
      const explosionRadius = 3.8
      this.spawnExplosion(projectile.position.x, projectile.position.y, explosionRadius)
      this.applyRadialExplosionDamage(
        projectile.position.x,
        projectile.position.y,
        explosionRadius,
        projectile.damage,
        projectile.ownerId,
        projectile.ownerTeam,
        true,
      )
      this.damageObstaclesAtExplosion(projectile.position.x, projectile.position.y, explosionRadius)
      this.world.cameraShake = Math.min(1.6, this.world.cameraShake + 0.24)
      this.world.hitStop = Math.max(this.world.hitStop, 0.01)
      this.sfx.explosion()
      return
    }

    if (projectile.kind !== "rocket") {
      return
    }

    for (let explosionIndex = 0; explosionIndex < 3; explosionIndex += 1) {
      const angle = randomRange(0, Math.PI * 2)
      const offset = explosionIndex === 0 ? 0 : randomRange(0.5, 1.1)
      const explosionX = projectile.position.x + Math.cos(angle) * offset
      const explosionY = projectile.position.y + Math.sin(angle) * offset
      const explosionRadius = explosionIndex === 0 ? 2.9 : 2.4
      this.spawnExplosion(explosionX, explosionY, explosionRadius)
      this.applyRadialExplosionDamage(
        explosionX,
        explosionY,
        explosionRadius,
        20,
        projectile.ownerId,
        projectile.ownerTeam,
      )
      this.damageObstaclesAtExplosion(explosionX, explosionY, explosionRadius)
    }

    this.world.cameraShake = Math.min(2.4, this.world.cameraShake + 0.42)
    this.world.hitStop = Math.max(this.world.hitStop, 0.016)
    this.sfx.explosion()
  }

  private applyDebugOverrides() {
    this.world.impactFeelLevel = clamp(debugImpactFeelLevelSignal.value, 1, 2)

    if (debugInfiniteReloadSignal.value) {
      const player = this.world.player

      player.reloadCooldown = 0
      player.reloadCooldownMax = 0

      for (const slot of player.primarySlots) {
        if (!Number.isFinite(slot.magazineSize) || !Number.isFinite(slot.primaryAmmo)) {
          slot.primaryAmmo = Number.POSITIVE_INFINITY
          slot.reserveAmmo = Number.POSITIVE_INFINITY
          continue
        }

        slot.primaryAmmo = slot.magazineSize
        slot.reserveAmmo = Number.POSITIVE_INFINITY
      }

      const activeSlot = player.primarySlots[player.primarySlotIndex]
      if (activeSlot) {
        player.primaryWeapon = activeSlot.weaponId
        player.primaryAmmo = activeSlot.primaryAmmo
        player.reserveAmmo = activeSlot.reserveAmmo
        player.magazineSize = activeSlot.magazineSize
      }
    }

    if (!this.world.running || this.world.finished) {
      debugSkipToMatchEndSignal.value = false
      return
    }

    if (debugSkipToMatchEndSignal.value) {
      this.world.timeRemaining = 0
      debugSkipToMatchEndSignal.value = false
    }
  }

  private allocProjectile() {
    const slot = this.world.projectiles[this.world.projectileCursor]
    this.world.projectileCursor = (this.world.projectileCursor + 1) % this.world.projectiles.length
    slot.trailCooldown = 0
    slot.trailDirX = 1
    slot.trailDirY = 0
    slot.trailReady = false
    slot.ricochets = 0
    return slot
  }

  private allocThrowable() {
    const slot = this.world.throwables[this.world.throwableCursor]
    this.world.throwableCursor = (this.world.throwableCursor + 1) % this.world.throwables.length
    slot.trailCooldown = 0
    slot.trailDirX = 1
    slot.trailDirY = 0
    slot.trailReady = false
    return slot
  }

  private allocFlower() {
    if (this.world.flowers.length > 0) {
      const index = this.world.flowerCursor % this.world.flowers.length
      const slot = this.world.flowers[index]
      if (slot.slotIndex !== index) {
        slot.slotIndex = index
      }
      this.world.flowerCursor = (index + 1) % this.world.flowers.length
      if (!slot.active) {
        return slot
      }
    }

    const spawned = new Flower()
    spawned.slotIndex = this.world.flowers.length
    this.world.flowers.push(spawned)
    if (this.world.flowers.length > 0) {
      this.world.flowerCursor = this.world.flowerCursor % this.world.flowers.length
    } else {
      this.world.flowerCursor = 0
    }
    return spawned
  }

  private allocPopup() {
    const slot = this.world.damagePopups[this.world.popupCursor]
    this.world.popupCursor = (this.world.popupCursor + 1) % this.world.damagePopups.length
    return slot
  }

  private allocMolotovZone() {
    const slot = this.world.molotovZones[this.world.molotovCursor]
    this.world.molotovCursor = (this.world.molotovCursor + 1) % this.world.molotovZones.length
    return slot
  }

  private getUnit(id: string) {
    return this.world.units.find((unit) => unit.id === id)
  }

  private equipPrimary(unitId: string, weaponId: PrimaryWeaponId, ammo: number) {
    return equipPrimary(unitId, this.world, weaponId, ammo, () => updatePlayerWeaponSignals(this.world))
  }

  private startReload(unitId: string) {
    const unit = this.getUnit(unitId)
    const wasReloading = (unit?.reloadCooldownMax ?? 0) > 0
    startReload(unitId, this.world, () => updatePlayerWeaponSignals(this.world))
    if (unit?.isPlayer && !wasReloading && unit.reloadCooldownMax > 0) {
      this.sfx.reloadBegin()
    }
  }

  private finishReload(unitId: string) {
    const unit = this.getUnit(unitId)
    const wasReloading = (unit?.reloadCooldownMax ?? 0) > 0
    const ammoBefore = unit?.primaryAmmo ?? 0
    finishReload(unitId, this.world, () => updatePlayerWeaponSignals(this.world))
    if (unit?.isPlayer && wasReloading && unit.reloadCooldownMax <= 0 && unit.primaryAmmo > ammoBefore) {
      this.sfx.reloadEnd()
    }
  }

  private firePrimary(unitId: string) {
    firePrimary(this.world, unitId, {
      allocProjectile: () => this.allocProjectile(),
      startReload: (id) => this.startReload(id),
      onShellEjected: (shooter) => this.spawnShellCasing(shooter),
      onPlayerShoot: () => {
        this.sfx.shoot()
        updatePlayerWeaponSignals(this.world)
      },
      onPlayerBulletsFired: (count: number) => {
        this.world.playerBulletsFired += count
      },
      onOtherShoot: () => this.sfx.shoot(),
    })
  }

  private swapPrimary(unitId: string, direction: number) {
    cyclePrimaryWeapon(unitId, this.world, direction, () => updatePlayerWeaponSignals(this.world))
  }

  private throwSecondary(unitId: string) {
    throwSecondary(this.world, unitId, {
      allocThrowable: () => this.allocThrowable(),
      onPlayerThrow: (mode) => {
        this.sfx.shoot()
        secondaryModeSignal.value = mode
      },
      onOtherThrow: () => this.sfx.shoot(),
    })
  }

  private respawnUnit(unitId: string) {
    respawnUnit(this.world, unitId, {
      equipPrimary: (id, weaponId, ammo) => this.equipPrimary(id, weaponId, ammo),
      randomLootablePrimary: () => this.randomLootablePrimaryForMatch(),
    })
  }

  private applyDamage(
    targetId: string,
    amount: number,
    sourceId: string,
    sourceTeam: Team,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number,
    damageSource: "projectile" | "throwable" | "molotov" | "arena" | "other" = "other",
  ) {
    applyDamage(this.world, targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, {
      allocPopup: () => this.allocPopup(),
      spawnFlowers: (ownerId, x, y, dirX, dirY, amountValue, sizeScale, isBurnt, options) => {
        const scoreOwnerId = this.resolveScoreOwnerId(ownerId)
        spawnFlowers(this.world, ownerId, scoreOwnerId, x, y, dirX, dirY, amountValue, sizeScale, {
          allocFlower: () => this.allocFlower(),
          playerId: this.playerCoverageId(),
          botPalette: (id) => botPalette(id),
          factionColor: (id) => this.world.factions.find((faction) => faction.id === id)?.color ?? null,
          onCoverageUpdated: () => updateCoverageSignals(this.world),
        }, isBurnt, options)
      },
      respawnUnit: (id) => this.respawnUnit(id),
      onKillPetalBurst: (x, y) => this.spawnKillPetalBurst(x, y),
      onUnitKilled: (target, isSuicide) => {
        if (isSuicide) {
          return
        }

        this.spawnLootPickupAt(target.position.x, target.position.y, true)
      },
      onSfxHit: (targetIsPlayer) => this.sfx.characterDamage(targetIsPlayer),
      onSfxDeath: () => this.sfx.die(),
      onSfxPlayerDeath: () => this.sfx.playerDeath(),
      onSfxPlayerKill: () => this.sfx.playerKill(),
      onPlayerHit: (targetId, damage) => {
        this.world.playerBulletsHit += 1
        this.world.playerDamageDealt += damage
      },
      onPlayerKill: () => {
        this.world.playerKills += 1
      },
      onPlayerHpChanged: () => updatePlayerHpSignal(this.world),
    }, damageSource)
  }

  private loop = (time: number) => {
    const realDt = Math.max(0, (time - this.previousTime) / 1000)
    const frameDt = Math.min(0.033, realDt)
    const speedScale = clamp(debugGameSpeedSignal.value, 0.4, 1.5)
    const gameplayDt = frameDt * speedScale
    this.previousTime = time

    const instantFps = realDt > 0 ? 1 / realDt : 0
    this.smoothedFps = this.smoothedFps <= 0 ? instantFps : lerp(this.smoothedFps, instantFps, 0.18)
    setFpsSignal(this.smoothedFps)

    this.update(frameDt, gameplayDt)
    renderScene({ context: this.context, world: this.world, dt: this.world.paused ? 0 : frameDt })

    this.raf = requestAnimationFrame(this.loop)
  }

  private update(frameDt: number, gameplayDt: number) {
    this.syncPlayerOptions()

    const effectDt = frameDt * EFFECT_SPEED

    if (this.world.paused) {
      updateCrosshairWorld(this.world)
      syncHudSignals(this.world)
      return
    }

    this.world.camera.x = lerp(this.world.camera.x, this.world.player.position.x, clamp(gameplayDt * 10, 0, 1))
    this.world.camera.y = lerp(this.world.camera.y, this.world.player.position.y, clamp(gameplayDt * 10, 0, 1))
    updateCombatFeel(this.world, gameplayDt)
    updateObstacleFlash(this.world, gameplayDt)

    this.applyDebugOverrides()

    const simDt = this.world.hitStop > 0 ? gameplayDt * 0.12 : gameplayDt
    this.world.hitStop = Math.max(0, this.world.hitStop - gameplayDt)

    if (!this.world.running) {
      updateFlowers(this.world, effectDt)
      updateDamagePopups(this.world, effectDt)
      this.updateObstacleDebris(effectDt)
      this.updateKillPetals(effectDt)
      this.updateShellCasings(effectDt)
      this.updateFlightTrails(effectDt)
      this.updateExplosions(effectDt)
      updateCrosshairWorld(this.world)
      return
    }

    this.world.timeRemaining -= gameplayDt
    if (this.world.timeRemaining <= 0) {
      this.world.timeRemaining = 0
      this.finishMatch()
    }

    const shrinkProgress = 1 - this.world.timeRemaining / MATCH_DURATION_SECONDS
    this.world.arenaRadius = lerp(ARENA_START_RADIUS, ARENA_END_RADIUS, clamp(shrinkProgress, 0, 1))

    updatePlayer(this.world, gameplayDt, {
      firePrimary: () => this.firePrimary(this.world.player.id),
      startReload: () => this.startReload(this.world.player.id),
      throwSecondary: () => this.throwSecondary(this.world.player.id),
      collectNearbyPickup: () => {
        collectNearbyPickup(this.world, this.world.player, {
          equipPrimary: (unit, weaponId, ammo) => this.equipPrimary(unit.id, weaponId, ammo),
          onPlayerPickup: (weaponId) => {
            this.sfx.itemAcquire()
            const localizedWeapon = this.localizePrimaryWeapon(weaponId)
            statusMessageSignal.value = t`Picked up ${localizedWeapon}`
          },
        })
      },
      updateCrosshairWorld: () => updateCrosshairWorld(this.world),
    })

    if (this.world.player.reloadCooldown <= 0) {
      this.finishReload(this.world.player.id)
    }

    updateAI(this.world, gameplayDt, {
      firePrimary: (botId) => this.firePrimary(botId),
      throwSecondary: (botId) => this.throwSecondary(botId),
      finishReload: (botId) => this.finishReload(botId),
      collectNearbyPickup: (botId) => {
        const bot = this.getUnit(botId)
        if (!bot) {
          return
        }
        collectNearbyPickup(this.world, bot, {
          equipPrimary: (unit, weaponId, ammo) => this.equipPrimary(unit.id, weaponId, ammo),
          onPlayerPickup: () => {},
        })
      },
      nowMs: () => performance.now(),
    })

    resolveUnitCollisions(this.world)
    constrainUnitsToArena(this.world, simDt, {
      onArenaBoundaryDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, this.world.player.team, hitX, hitY, impactX, impactY, "arena")
      },
    })

    updateProjectiles(this.world, simDt, {
      hitObstacle: (projectileIndex) => {
        const projectile = this.world.projectiles[projectileIndex]
        return hitObstacle(this.world, projectile, {
          onSfxHit: () => this.sfx.hit(),
          onSfxBreak: () => this.sfx.obstacleBreak(),
          onObstacleDestroyed: (x, y, material) => this.spawnObstacleDebris(x, y, material),
          onBoxDestroyed: (x, y, highTier) => this.spawnLootPickupAt(x, y, true, highTier, highTier),
        })
      },
      spawnFlamePatch: (x, y, ownerId, ownerTeam) => {
        spawnFlamePatch(this.world, x, y, ownerId, ownerTeam, () => this.allocMolotovZone())
      },
      explodeProjectile: (projectile) => {
        this.explodeProjectilePayload(projectile)
      },
      onTrailEnd: (x, y, velocityX, velocityY, kind) => {
        this.emitProjectileTrailEnd(x, y, velocityX, velocityY, kind)
      },
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "projectile")
      },
    })

    updateThrowables(this.world, simDt, {
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
      },
      explodeGrenade: (throwableIndex) => {
        explodeGrenade(this.world, throwableIndex, {
          applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
            this.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "throwable")
          },
          damageObstaclesByExplosion: (x, y, radius) => {
            damageObstaclesByExplosion(this.world, x, y, radius, {
              onSfxHit: () => this.sfx.hit(),
              onSfxBreak: () => this.sfx.obstacleBreak(),
              onObstacleDestroyed: (dropX, dropY, material) => this.spawnObstacleDebris(dropX, dropY, material),
              onBoxDestroyed: (dropX, dropY, highTier) => this.spawnLootPickupAt(dropX, dropY, true, highTier, highTier),
            })
          },
          spawnExplosion: (x, y, radius) => this.spawnExplosion(x, y, radius),
        })
      },
      igniteMolotov: (throwableIndex) => {
        const throwable = this.world.throwables[throwableIndex]
        if (!throwable) {
          return
        }
        igniteMolotov(this.world, throwable, () => this.allocMolotovZone())
      },
      onTrailEnd: (x, y, velocityX, velocityY, mode) => {
        this.emitThrowableTrailEnd(x, y, velocityX, velocityY, mode)
      },
      onExplosion: () => this.sfx.explosion(),
    })

    updateMolotovZones(this.world, simDt, {
      applyDamage: (targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, sourceTeam, hitX, hitY, impactX, impactY, "molotov")
      },
    })

    updateFlowers(this.world, effectDt)
    updateDamagePopups(this.world, effectDt)
    this.updateObstacleDebris(effectDt)
    this.updateKillPetals(effectDt)
    this.updateShellCasings(effectDt)
    this.updateFlightTrailEmitters()
    this.updateFlightTrails(effectDt)

    updatePickups(this.world, simDt, {
      randomLootablePrimary: () => {
        const id = this.randomLootablePrimaryForMatch()
        return id === "pistol" ? "assault" : id
      },
      randomHighTierPrimary: () => this.randomHighTierPrimary(),
      highTierChance: this.highTierLootBoxChance(),
    })

    this.updateExplosions(effectDt)
    syncHudSignals(this.world)
  }
}
