import { AudioDirector, SfxSynth } from "./audio.ts"
import {
  clearPerkOptions,
  resetHudSignals,
  setCrosshairSignal,
  setPerkOptions,
  setSecondaryWeaponSignal,
  setStatusMessage,
  syncHudSignals,
  updateCoverageSignals,
  updatePlayerHpSignal,
  updatePlayerWeaponSignals
} from "./adapters/hud-sync.ts"
import { setupInputAdapter, type InputAdapter } from "./adapters/input.ts"
import { renderScene } from "./render/scene.ts"
import { ARENA_END_RADIUS, ARENA_START_RADIUS, clamp, lerp } from "./utils.ts"
import { PRIMARY_WEAPONS } from "./weapons.ts"
import { BOT_BASE_SPEED, PERK_FLOWER_STEP, PLAYER_BASE_SPEED, VIEW_HEIGHT, VIEW_WIDTH } from "./world/constants.ts"
import { createWorldState, type WorldState } from "./world/state.ts"
import { createBarrenGardenMap } from "./world/wfc-map.ts"
import {
  applyDamage,
  checkPerkProgress,
  consumePerkChoice,
  equipPrimary,
  firePrimary,
  finishReload,
  randomLootablePrimary,
  startReload
} from "./systems/combat.ts"
import { constrainUnitsToArena, damageHouseByExplosion, hitObstacle, resolveUnitCollisions } from "./systems/collisions.ts"
import { spawnFlowers, updateDamagePopups, updateFlowers } from "./systems/flowers.ts"
import { updateMolotovZones, igniteMolotov } from "./systems/molotov.ts"
import { collectNearbyPickup, spawnPickupAt, updatePickups } from "./systems/pickups.ts"
import { updatePlayer, updateCombatFeel, updateCrosshairWorld } from "./systems/player.ts"
import { updateProjectiles } from "./systems/projectiles.ts"
import { breakObstacle, respawnUnit, setupWorldUnits, spawnAllUnits, spawnObstacles } from "./systems/respawn.ts"
import { explodeGrenade, throwSecondary, updateThrowables } from "./systems/throwables.ts"
import { updateAI } from "./systems/ai.ts"
import type { Obstacle, Unit } from "./entities.ts"

import menuTrackUrl from "../../hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 02 linear & gestalt.ogg"
import gameplayTrackUrl from "../../hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 01 MY DIVINE PERVERSIONS.ogg"

export class FlowerArenaGame {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private world: WorldState
  private inputAdapter: InputAdapter | null = null
  private raf = 0
  private previousTime = 0
  private audioDirector = new AudioDirector(menuTrackUrl, gameplayTrackUrl)
  private sfx = new SfxSynth()

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

    this.setupWorld()
    this.setupInput()
    resetHudSignals(this.world, this.canvas)
    renderScene({ context: this.context, world: this.world, dt: 0 })
  }

  start() {
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
      () => randomLootablePrimary(),
      (unitId, weaponId, ammo) => equipPrimary(unitId, this.world, weaponId, ammo, () => updatePlayerWeaponSignals(this.world))
    )
  }

  private setupInput() {
    this.inputAdapter = setupInputAdapter(this.canvas, this.world, {
      onPrimeAudio: () => this.primeAudio(),
      onBeginMatch: () => this.beginMatch(),
      onConsumePerk: (index) => this.consumePerkChoice(index),
      onPrimaryDown: () => this.firePrimary(this.world.player.id),
      onSecondaryDown: () => this.throwSecondary(this.world.player.id),
      onCrosshair: (x, y, visible) => setCrosshairSignal(x, y, visible)
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
    this.world.started = true
    this.world.running = true
    this.world.finished = false
    this.world.timeRemaining = 90
    this.world.arenaRadius = ARENA_START_RADIUS
    this.world.pickupTimer = 1.5
    this.world.whiteFlowers = 0
    this.world.blueFlowers = 0
    this.world.playerFlowerTotal = 0
    this.world.nextPerkFlowerTarget = PERK_FLOWER_STEP
    this.world.terrainMap = createBarrenGardenMap(112)

    const player = this.world.player
    player.maxHp = 10
    player.hp = 10
    player.damageMultiplier = 1
    player.fireRateMultiplier = 1
    player.bulletSizeMultiplier = 1
    player.speed = PLAYER_BASE_SPEED
    player.grenadeTimer = 1
    this.equipPrimary(player.id, "pistol", Number.POSITIVE_INFINITY)

    for (const bot of this.world.bots) {
      bot.maxHp = 10
      bot.hp = 10
      bot.damageMultiplier = 1
      bot.fireRateMultiplier = 1
      bot.bulletSizeMultiplier = 1
      bot.speed = BOT_BASE_SPEED
      bot.grenadeTimer = 1
      const weaponId = randomLootablePrimary()
      this.equipPrimary(bot.id, weaponId, PRIMARY_WEAPONS[weaponId].pickupAmmo)
      bot.secondaryMode = Math.random() > 0.58 ? "molotov" : "grenade"
    }

    spawnAllUnits(this.world)
    this.world.perkChoices = []
    clearPerkOptions()

    for (const projectile of this.world.projectiles) projectile.active = false
    for (const throwable of this.world.throwables) throwable.active = false
    for (const flower of this.world.flowers) flower.active = false
    for (const popup of this.world.damagePopups) popup.active = false
    for (const pickup of this.world.pickups) pickup.active = false
    for (const zone of this.world.molotovZones) zone.active = false
    for (const obstacle of this.world.obstacles) {
      obstacle.active = false
      obstacle.lootDropped = false
    }
    for (const explosion of this.world.explosions) explosion.active = false

    spawnObstacles(this.world)

    this.world.cameraShake = 0
    this.world.cameraOffset.set(0, 0)
    this.world.hitStop = 0

    syncHudSignals(this.world)
    setStatusMessage("Fight for map coverage")
    this.audioDirector.startGameplay()
  }

  private finishMatch() {
    this.world.running = false
    this.world.finished = true
    this.audioDirector.startMenu()

    if (this.world.whiteFlowers >= this.world.blueFlowers) {
      setStatusMessage("Time up. Your trail dominates the arena")
    } else {
      setStatusMessage("Time up. Rival bloom overwhelms the field")
    }

    clearPerkOptions()
    this.world.perkChoices = []
  }

  private consumePerkChoice(index: number) {
    consumePerkChoice(
      this.world,
      index,
      (feedback) => setStatusMessage(feedback),
      () => updatePlayerHpSignal(this.world),
      () => clearPerkOptions()
    )
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

  private spawnExplosion(x: number, y: number, radius: number) {
    const slot = this.world.explosions.find((explosion) => !explosion.active) ?? this.world.explosions[0]
    slot.active = true
    slot.position.set(x, y)
    slot.radius = radius
    slot.life = 0.24
  }

  private allocProjectile() {
    const slot = this.world.projectiles[this.world.projectileCursor]
    this.world.projectileCursor = (this.world.projectileCursor + 1) % this.world.projectiles.length
    return slot
  }

  private allocThrowable() {
    const slot = this.world.throwables[this.world.throwableCursor]
    this.world.throwableCursor = (this.world.throwableCursor + 1) % this.world.throwables.length
    return slot
  }

  private allocFlower() {
    const slot = this.world.flowers[this.world.flowerCursor]
    this.world.flowerCursor = (this.world.flowerCursor + 1) % this.world.flowers.length
    return slot
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

  private equipPrimary(unitId: string, weaponId: "pistol" | "assault" | "shotgun" | "flamethrower", ammo: number) {
    equipPrimary(unitId, this.world, weaponId, ammo, () => updatePlayerWeaponSignals(this.world))
  }

  private startReload(unitId: string) {
    startReload(unitId, this.world, () => updatePlayerWeaponSignals(this.world))
  }

  private finishReload(unitId: string) {
    finishReload(unitId, this.world, () => updatePlayerWeaponSignals(this.world))
  }

  private firePrimary(unitId: string) {
    firePrimary(this.world, unitId, {
      allocProjectile: () => this.allocProjectile(),
      startReload: (id) => this.startReload(id),
      equipPrimary: (id, weaponId, ammo) => this.equipPrimary(id, weaponId, ammo),
      onPlayerShoot: () => {
        this.sfx.shoot()
        updatePlayerWeaponSignals(this.world)
      },
      onOtherShoot: () => this.sfx.shoot()
    })
  }

  private throwSecondary(unitId: string) {
    throwSecondary(this.world, unitId, {
      allocThrowable: () => this.allocThrowable(),
      onPlayerThrow: (mode) => {
        this.sfx.shoot()
        setSecondaryWeaponSignal(mode)
      },
      onOtherThrow: () => this.sfx.shoot()
    })
  }

  private breakObstacle(obstacle: Obstacle) {
    breakObstacle(obstacle, {
      spawnExplosion: (x, y, radius) => this.spawnExplosion(x, y, radius),
      spawnPickupAt: (position) => {
        spawnPickupAt(this.world, position, {
          randomLootablePrimary: () => {
            const id = randomLootablePrimary()
            return id === "pistol" ? "assault" : id
          }
        })
      }
    })
  }

  private respawnUnit(unitId: string) {
    respawnUnit(this.world, unitId, {
      equipPrimary: (id, weaponId, ammo) => this.equipPrimary(id, weaponId, ammo),
      randomLootablePrimary: () => randomLootablePrimary()
    })
  }

  private applyDamage(
    targetId: string,
    amount: number,
    sourceId: string,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number
  ) {
    applyDamage(this.world, targetId, amount, sourceId, hitX, hitY, impactX, impactY, {
      allocPopup: () => this.allocPopup(),
      spawnFlowers: (ownerId, x, y, dirX, dirY, amountValue) => {
        spawnFlowers(this.world, ownerId, x, y, dirX, dirY, amountValue, {
          allocFlower: () => this.allocFlower(),
          playerId: this.world.player.id,
          botPalette: (id) => {
            const palettes = [
              { tone: "#7aa6ff", edge: "#3d67bf" },
              { tone: "#ff9c8e", edge: "#c95a5f" },
              { tone: "#89d7b7", edge: "#2f9b7c" },
              { tone: "#f7c276", edge: "#b88335" },
              { tone: "#c7a8ff", edge: "#7d59b7" },
              { tone: "#f3a7d8", edge: "#b36093" },
              { tone: "#9fd4ff", edge: "#4f7fa8" }
            ]
            const index = Number(id.replace("bot-", ""))
            return palettes[index % palettes.length]
          },
          onPerkProgress: () => {
            checkPerkProgress(this.world, (options) => {
              setPerkOptions(options)
              setStatusMessage("Perk ready. Press 1, 2, or 3")
            })
          },
          onCoverageUpdated: () => updateCoverageSignals(this.world)
        })
      },
      respawnUnit: (id) => this.respawnUnit(id),
      onSfxHit: () => this.sfx.hit(),
      onPlayerHpChanged: () => updatePlayerHpSignal(this.world)
    })
  }

  private loop = (time: number) => {
    const dt = Math.min(0.033, (time - this.previousTime) / 1000)
    this.previousTime = time

    this.update(dt)
    renderScene({ context: this.context, world: this.world, dt })

    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    this.world.camera.x = lerp(this.world.camera.x, this.world.player.position.x, clamp(dt * 10, 0, 1))
    this.world.camera.y = lerp(this.world.camera.y, this.world.player.position.y, clamp(dt * 10, 0, 1))
    updateCombatFeel(this.world, dt)

    const simDt = this.world.hitStop > 0 ? dt * 0.12 : dt
    this.world.hitStop = Math.max(0, this.world.hitStop - dt)

    if (!this.world.running) {
      updateFlowers(this.world, simDt)
      updateDamagePopups(this.world, simDt)
      this.updateExplosions(simDt)
      updateCrosshairWorld(this.world)
      return
    }

    this.world.timeRemaining -= dt
    if (this.world.timeRemaining <= 0) {
      this.world.timeRemaining = 0
      this.finishMatch()
    }

    const shrinkProgress = 1 - this.world.timeRemaining / 90
    this.world.arenaRadius = lerp(ARENA_START_RADIUS, ARENA_END_RADIUS, clamp(shrinkProgress, 0, 1))

    updatePlayer(this.world, dt, {
      firePrimary: () => this.firePrimary(this.world.player.id),
      startReload: () => this.startReload(this.world.player.id),
      throwSecondary: () => this.throwSecondary(this.world.player.id),
      collectNearbyPickup: () => {
        collectNearbyPickup(this.world, this.world.player, {
          equipPrimary: (unit, weaponId, ammo) => this.equipPrimary(unit.id, weaponId, ammo),
          onPlayerPickup: (label) => setStatusMessage(`Picked up ${label}`)
        })
      },
      updateCrosshairWorld: () => updateCrosshairWorld(this.world)
    })

    if (this.world.player.reloadCooldown <= 0) {
      this.finishReload(this.world.player.id)
    }

    updateAI(this.world, dt, {
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
          onPlayerPickup: () => {}
        })
      },
      nowMs: () => performance.now()
    })

    resolveUnitCollisions(this.world)
    constrainUnitsToArena(this.world)

    updateProjectiles(this.world, simDt, {
      hitObstacle: (projectileIndex) => {
        const projectile = this.world.projectiles[projectileIndex]
        return hitObstacle(this.world, projectile, {
          spawnExplosion: (x, y, radius) => this.spawnExplosion(x, y, radius),
          breakObstacle: (obstacle) => this.breakObstacle(obstacle)
        })
      },
      applyDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, hitX, hitY, impactX, impactY)
      }
    })

    updateThrowables(this.world, simDt, {
      breakObstacle: (obstacle) => this.breakObstacle(obstacle),
      explodeGrenade: (throwableIndex) => {
        explodeGrenade(this.world, throwableIndex, {
          applyDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
            this.applyDamage(targetId, amount, sourceId, hitX, hitY, impactX, impactY)
          },
          damageHouseByExplosion: (obstacle, x, y, radius) => {
            damageHouseByExplosion(obstacle, x, y, radius, {
              spawnExplosion: (sx, sy, rr) => this.spawnExplosion(sx, sy, rr),
              breakObstacle: (ob) => this.breakObstacle(ob)
            })
          },
          breakObstacle: (obstacle) => this.breakObstacle(obstacle),
          spawnExplosion: (x, y, radius) => this.spawnExplosion(x, y, radius)
        })
      },
      igniteMolotov: (throwableIndex) => {
        const throwable = this.world.throwables[throwableIndex]
        if (!throwable) {
          return
        }
        igniteMolotov(this.world, throwable, () => this.allocMolotovZone())
      },
      onExplosion: () => this.sfx.explosion()
    })

    updateMolotovZones(this.world, simDt, {
      applyDamage: (targetId, amount, sourceId, hitX, hitY, impactX, impactY) => {
        this.applyDamage(targetId, amount, sourceId, hitX, hitY, impactX, impactY)
      }
    })

    updateFlowers(this.world, simDt)
    updateDamagePopups(this.world, simDt)

    updatePickups(this.world, simDt, {
      randomLootablePrimary: () => {
        const id = randomLootablePrimary()
        return id === "pistol" ? "assault" : id
      }
    })

    this.updateExplosions(simDt)
    syncHudSignals(this.world)
  }
}
