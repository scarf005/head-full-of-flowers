import { sample } from "@std/random"

import { AudioDirector, SfxSynth } from "./audio.ts"
import {
  DamagePopup,
  Flower,
  MolotovZone,
  Pickup,
  Projectile,
  Throwable,
  Unit,
  Vec2
} from "./entities.ts"
import { randomPerkChoices, type PerkDefinition } from "./perks.ts"
import {
  blueCoverageSignal,
  crosshairSignal,
  hpSignal,
  perkOptionsSignal,
  primaryAmmoSignal,
  primaryWeaponSignal,
  secondaryWeaponSignal,
  statusMessageSignal,
  timeRemainingSignal,
  whiteCoverageSignal
} from "./signals.ts"
import type { PrimaryWeaponId } from "./types.ts"
import {
  GRENADE_COOLDOWN,
  LOOTABLE_PRIMARY_IDS,
  MOLOTOV_COOLDOWN,
  PRIMARY_WEAPONS
} from "./weapons.ts"
import {
  ARENA_RADIUS,
  clamp,
  distSquared,
  lerp,
  limitToArena,
  randomInt,
  randomPointInArena,
  randomRange
} from "./utils.ts"

import menuTrackUrl from "../../hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 02 linear & gestalt.ogg"
import gameplayTrackUrl from "../../hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt/hellstar.plus - MY DIVINE PERVERSIONS - linear & gestalt - 01 MY DIVINE PERVERSIONS.ogg"

const VIEW_WIDTH = 960
const VIEW_HEIGHT = 540
const FLOWER_POOL_SIZE = 5000
const PROJECTILE_POOL_SIZE = 480
const THROWABLE_POOL_SIZE = 96
const DAMAGE_POPUP_POOL_SIZE = 200
const PICKUP_POOL_SIZE = 12
const MOLOTOV_POOL_SIZE = 36
const BOT_COUNT = 7
const PERK_FLOWER_STEP = 130
const PLAYER_BASE_SPEED = 280
const BOT_BASE_SPEED = 214

interface InputState {
  keys: Set<string>
  leftDown: boolean
  rightDown: boolean
  canvasX: number
  canvasY: number
  worldX: number
  worldY: number
}

export class FlowerArenaGame {
  private canvas: HTMLCanvasElement
  private context: CanvasRenderingContext2D
  private input: InputState = {
    keys: new Set(),
    leftDown: false,
    rightDown: false,
    canvasX: VIEW_WIDTH * 0.5,
    canvasY: VIEW_HEIGHT * 0.5,
    worldX: 0,
    worldY: 0
  }

  private player = new Unit("player", true, "white")
  private bots: Unit[] = []
  private units: Unit[] = []

  private projectiles = Array.from({ length: PROJECTILE_POOL_SIZE }, () => new Projectile())
  private throwables = Array.from({ length: THROWABLE_POOL_SIZE }, () => new Throwable())
  private flowers = Array.from({ length: FLOWER_POOL_SIZE }, () => new Flower())
  private damagePopups = Array.from({ length: DAMAGE_POPUP_POOL_SIZE }, () => new DamagePopup())
  private pickups = Array.from({ length: PICKUP_POOL_SIZE }, () => new Pickup())
  private molotovZones = Array.from({ length: MOLOTOV_POOL_SIZE }, () => new MolotovZone())

  private projectileCursor = 0
  private throwableCursor = 0
  private flowerCursor = 0
  private popupCursor = 0
  private molotovCursor = 0

  private camera = new Vec2()
  private raf = 0
  private previousTime = 0

  private started = false
  private running = false
  private finished = false
  private audioPrimed = false
  private timeRemaining = 90
  private pickupTimer = 2.5
  private whiteFlowers = 0
  private blueFlowers = 0
  private playerFlowerTotal = 0
  private nextPerkFlowerTarget = PERK_FLOWER_STEP
  private perkChoices: PerkDefinition[] = []
  private cameraShake = 0
  private cameraOffset = new Vec2()
  private hitStop = 0

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

    this.setupWorld()
    this.setupEvents()
    this.resetSignals()
    this.renderFrame(0)
  }

  start() {
    this.previousTime = performance.now()
    this.raf = requestAnimationFrame(this.loop)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    window.removeEventListener("keydown", this.onKeyDown)
    window.removeEventListener("keyup", this.onKeyUp)
    this.canvas.removeEventListener("pointermove", this.onPointerMove)
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.canvas.removeEventListener("pointerup", this.onPointerUp)
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave)
    this.canvas.removeEventListener("contextmenu", this.onContextMenu)
    this.audioDirector.stopAll()
  }

  private setupWorld() {
    this.player.primaryWeapon = "pistol"
    this.player.primaryAmmo = Number.POSITIVE_INFINITY
    this.player.secondaryMode = "grenade"
    this.player.radius = 14
    this.player.speed = 190

    this.bots = []
    for (let index = 0; index < BOT_COUNT; index += 1) {
      const bot = new Unit(`bot-${index + 1}`, false, "blue")
      bot.speed = 162
      bot.radius = 13
      bot.primaryWeapon = this.randomLootablePrimary()
      bot.primaryAmmo = PRIMARY_WEAPONS[bot.primaryWeapon].pickupAmmo
      this.bots.push(bot)
    }

    this.units = [this.player, ...this.bots]
    this.spawnAllUnits()
  }

  private resetSignals() {
    timeRemainingSignal.value = 90
    whiteCoverageSignal.value = 50
    blueCoverageSignal.value = 50
    primaryWeaponSignal.value = PRIMARY_WEAPONS[this.player.primaryWeapon].name
    primaryAmmoSignal.value = "∞"
    secondaryWeaponSignal.value = "Grenade"
    hpSignal.value = { hp: this.player.hp, maxHp: this.player.maxHp }
    perkOptionsSignal.value = []
    statusMessageSignal.value = "Click to begin the 90 second bloom match"
    crosshairSignal.value = {
      x: this.input.canvasX,
      y: this.input.canvasY,
      visible: false
    }
  }

  private setupEvents() {
    window.addEventListener("keydown", this.onKeyDown)
    window.addEventListener("keyup", this.onKeyUp)
    this.canvas.addEventListener("pointermove", this.onPointerMove)
    this.canvas.addEventListener("pointerdown", this.onPointerDown)
    this.canvas.addEventListener("pointerup", this.onPointerUp)
    this.canvas.addEventListener("pointerleave", this.onPointerLeave)
    this.canvas.addEventListener("contextmenu", this.onContextMenu)
  }

  private onKeyDown = (event: KeyboardEvent) => {
    this.primeAudio()
    this.input.keys.add(event.key.toLowerCase())

    if (event.key === "1" || event.key === "2" || event.key === "3") {
      const perkIndex = Number(event.key) - 1
      this.consumePerkChoice(perkIndex)
    }
  }

  private onKeyUp = (event: KeyboardEvent) => {
    this.input.keys.delete(event.key.toLowerCase())
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) * (VIEW_WIDTH / rect.width)
    const y = (event.clientY - rect.top) * (VIEW_HEIGHT / rect.height)

    this.input.canvasX = clamp(x, 0, VIEW_WIDTH)
    this.input.canvasY = clamp(y, 0, VIEW_HEIGHT)
    this.input.worldX = this.camera.x + this.input.canvasX - VIEW_WIDTH * 0.5
    this.input.worldY = this.camera.y + this.input.canvasY - VIEW_HEIGHT * 0.5

    crosshairSignal.value = {
      x: this.input.canvasX,
      y: this.input.canvasY,
      visible: true
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    this.primeAudio()

    if (!this.started || this.finished) {
      this.beginMatch()
    }

    if (event.button === 0) {
      this.input.leftDown = true
    }

    if (event.button === 2) {
      this.input.rightDown = true
    }
  }

  private onPointerUp = (event: PointerEvent) => {
    if (event.button === 0) {
      this.input.leftDown = false
    }

    if (event.button === 2) {
      this.input.rightDown = false
    }
  }

  private onPointerLeave = () => {
    this.input.leftDown = false
    this.input.rightDown = false
    crosshairSignal.value = {
      x: this.input.canvasX,
      y: this.input.canvasY,
      visible: false
    }
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault()
  }

  private primeAudio() {
    if (this.audioPrimed) {
      return
    }

    this.audioPrimed = true
    this.audioDirector.startMenu()
  }

  private beginMatch() {
    this.started = true
    this.running = true
    this.finished = false
    this.timeRemaining = 90
    this.pickupTimer = 1.5
    this.whiteFlowers = 0
    this.blueFlowers = 0
    this.playerFlowerTotal = 0
    this.nextPerkFlowerTarget = PERK_FLOWER_STEP

    this.player.maxHp = 100
    this.player.hp = 100
    this.player.damageMultiplier = 1
    this.player.fireRateMultiplier = 1
    this.player.bulletSizeMultiplier = 1
    this.player.speed = 190
    this.player.grenadeTimer = 1
    this.equipPrimary(this.player, "pistol", Number.POSITIVE_INFINITY)

    for (const bot of this.bots) {
      bot.maxHp = 100
      bot.hp = 100
      bot.damageMultiplier = 1
      bot.fireRateMultiplier = 1
      bot.bulletSizeMultiplier = 1
      bot.speed = 162
      bot.grenadeTimer = 1
      const weaponId = this.randomLootablePrimary()
      this.equipPrimary(bot, weaponId, PRIMARY_WEAPONS[weaponId].pickupAmmo)
      bot.secondaryMode = Math.random() > 0.58 ? "molotov" : "grenade"
    }

    this.spawnAllUnits()
    this.perkChoices = []
    perkOptionsSignal.value = []

    for (const projectile of this.projectiles) {
      projectile.active = false
    }

    for (const throwable of this.throwables) {
      throwable.active = false
    }

    for (const flower of this.flowers) {
      flower.active = false
    }

    for (const popup of this.damagePopups) {
      popup.active = false
    }

    for (const pickup of this.pickups) {
      pickup.active = false
    }

    for (const zone of this.molotovZones) {
      zone.active = false
    }

    this.syncHudSignals()
    statusMessageSignal.value = "Fight for map coverage"
    this.audioDirector.startGameplay()
  }

  private spawnAllUnits() {
    const occupied: Vec2[] = []
    for (const unit of this.units) {
      const spawn = this.findSafeSpawn(occupied)
      occupied.push(spawn.clone())
      unit.respawn(spawn)
    }

    this.camera.copy(this.player.position)
  }

  private findSafeSpawn(occupied: Vec2[]) {
    for (let attempt = 0; attempt < 42; attempt += 1) {
      const candidate = randomPointInArena()
      let safe = true

      for (const existing of occupied) {
        if (distSquared(candidate.x, candidate.y, existing.x, existing.y) < 180 * 180) {
          safe = false
          break
        }
      }

      if (safe) {
        return candidate
      }
    }

    return randomPointInArena()
  }

  private loop = (time: number) => {
    const dt = Math.min(0.033, (time - this.previousTime) / 1000)
    this.previousTime = time

    this.update(dt)
    this.renderFrame(dt)

    this.raf = requestAnimationFrame(this.loop)
  }

  private update(dt: number) {
    this.camera.x = lerp(this.camera.x, this.player.position.x, clamp(dt * 10, 0, 1))
    this.camera.y = lerp(this.camera.y, this.player.position.y, clamp(dt * 10, 0, 1))

    if (!this.running) {
      this.updateFlowers(dt)
      this.updateDamagePopups(dt)
      this.updateCrosshairWorld()
      return
    }

    this.timeRemaining -= dt
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0
      this.finishMatch()
    }

    this.updateCrosshairWorld()
    this.updatePlayer(dt)
    this.updateBots(dt)
    this.updateProjectiles(dt)
    this.updateThrowables(dt)
    this.updateMolotovZones(dt)
    this.updateFlowers(dt)
    this.updateDamagePopups(dt)
    this.updatePickups(dt)
    this.syncHudSignals()
  }

  private finishMatch() {
    this.running = false
    this.finished = true
    this.audioDirector.startMenu()

    if (this.whiteFlowers >= this.blueFlowers) {
      statusMessageSignal.value = "Time up. White flowers dominate the arena"
    } else {
      statusMessageSignal.value = "Time up. Blue flowers seize the field"
    }

    perkOptionsSignal.value = []
    this.perkChoices = []
  }

  private updateCrosshairWorld() {
    this.input.worldX = this.camera.x + this.input.canvasX - VIEW_WIDTH * 0.5
    this.input.worldY = this.camera.y + this.input.canvasY - VIEW_HEIGHT * 0.5
  }

  private updatePlayer(dt: number) {
    this.player.shootCooldown = Math.max(0, this.player.shootCooldown - dt)
    this.player.secondaryCooldown = Math.max(0, this.player.secondaryCooldown - dt)

    let moveX = 0
    let moveY = 0

    if (this.input.keys.has("w")) {
      moveY -= 1
    }
    if (this.input.keys.has("s")) {
      moveY += 1
    }
    if (this.input.keys.has("a")) {
      moveX -= 1
    }
    if (this.input.keys.has("d")) {
      moveX += 1
    }

    const moveLength = Math.hypot(moveX, moveY) || 1
    this.player.velocity.x = (moveX / moveLength) * this.player.speed
    this.player.velocity.y = (moveY / moveLength) * this.player.speed

    this.player.position.x += this.player.velocity.x * dt
    this.player.position.y += this.player.velocity.y * dt
    limitToArena(this.player.position, this.player.radius)

    const aimX = this.input.worldX - this.player.position.x
    const aimY = this.input.worldY - this.player.position.y
    const aimLength = Math.hypot(aimX, aimY) || 1
    this.player.aim.x = aimX / aimLength
    this.player.aim.y = aimY / aimLength

    if (this.input.leftDown) {
      this.firePrimary(this.player)
    }

    if (this.input.rightDown) {
      this.throwSecondary(this.player)
    }

    this.collectNearbyPickup(this.player)
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      bot.shootCooldown = Math.max(0, bot.shootCooldown - dt)
      bot.secondaryCooldown = Math.max(0, bot.secondaryCooldown - dt)
      bot.aiDecisionTimer -= dt

      const toPlayerX = this.player.position.x - bot.position.x
      const toPlayerY = this.player.position.y - bot.position.y
      const distanceToPlayer = Math.hypot(toPlayerX, toPlayerY)

      if (bot.hp <= bot.maxHp * 0.32) {
        bot.aiState = "flee"
      } else if (distanceToPlayer < 430) {
        bot.aiState = "aggro"
      } else {
        bot.aiState = "wander"
      }

      if (bot.aiDecisionTimer <= 0) {
        bot.aiDecisionTimer = randomRange(0.4, 1.4)
        const angle = randomRange(0, Math.PI * 2)
        bot.aiMove.x = Math.cos(angle)
        bot.aiMove.y = Math.sin(angle)
      }

      if (bot.aiState === "wander") {
        bot.velocity.x = bot.aiMove.x * bot.speed * 0.65
        bot.velocity.y = bot.aiMove.y * bot.speed * 0.65
      }

      if (bot.aiState === "aggro") {
        const distanceSafe = distanceToPlayer || 1
        const towardX = toPlayerX / distanceSafe
        const towardY = toPlayerY / distanceSafe
        const strafe = Math.sin(performance.now() * 0.001 + Number(bot.id.replace("bot-", "")))
        bot.velocity.x = (towardX + -towardY * strafe * 0.45) * bot.speed
        bot.velocity.y = (towardY + towardX * strafe * 0.45) * bot.speed

        bot.aim.x = towardX
        bot.aim.y = towardY

        if (distanceToPlayer < 680) {
          this.firePrimary(bot)
        }

        if (distanceToPlayer < 300 && Math.random() < 0.014) {
          this.throwSecondary(bot)
        }
      }

      if (bot.aiState === "flee") {
        const distanceSafe = distanceToPlayer || 1
        const fromX = -toPlayerX / distanceSafe
        const fromY = -toPlayerY / distanceSafe
        bot.velocity.x = fromX * bot.speed * 1.1
        bot.velocity.y = fromY * bot.speed * 1.1
        bot.aim.x = toPlayerX / distanceSafe
        bot.aim.y = toPlayerY / distanceSafe

        if (distanceToPlayer < 520) {
          this.firePrimary(bot)
        }
      }

      bot.position.x += bot.velocity.x * dt
      bot.position.y += bot.velocity.y * dt
      limitToArena(bot.position, bot.radius)

      this.collectNearbyPickup(bot)
    }
  }

  private firePrimary(shooter: Unit) {
    if (shooter.shootCooldown > 0) {
      return
    }

    if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
      this.equipPrimary(shooter, "pistol", Number.POSITIVE_INFINITY)
    }

    const weapon = PRIMARY_WEAPONS[shooter.primaryWeapon]

    shooter.shootCooldown = weapon.cooldown / shooter.fireRateMultiplier
    if (Number.isFinite(shooter.primaryAmmo)) {
      shooter.primaryAmmo = Math.max(0, shooter.primaryAmmo - 1)
    }

    const baseAngle = Math.atan2(shooter.aim.y, shooter.aim.x)
    const pelletCount = weapon.pellets
    for (let pellet = 0; pellet < pelletCount; pellet += 1) {
      const projectile = this.allocProjectile()
      const spread = randomRange(-weapon.spread, weapon.spread)
      const angle = baseAngle + spread
      const dirX = Math.cos(angle)
      const dirY = Math.sin(angle)

      projectile.active = true
      projectile.ownerId = shooter.id
      projectile.ownerTeam = shooter.team
      projectile.position.x = shooter.position.x + dirX * (shooter.radius + 8)
      projectile.position.y = shooter.position.y + dirY * (shooter.radius + 8)
      projectile.velocity.x = dirX * weapon.speed * randomRange(0.93, 1.06)
      projectile.velocity.y = dirY * weapon.speed * randomRange(0.93, 1.06)
      projectile.radius = weapon.bulletRadius * shooter.bulletSizeMultiplier
      projectile.damage = weapon.damage * shooter.damageMultiplier
      projectile.maxRange = weapon.range
      projectile.traveled = 0
      projectile.glow = randomRange(0.4, 0.9)
    }

    if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
      this.equipPrimary(shooter, "pistol", Number.POSITIVE_INFINITY)
    }

    if (shooter.isPlayer) {
      this.sfx.shoot()
      this.updatePlayerWeaponSignals()
    }
  }

  private throwSecondary(shooter: Unit) {
    if (shooter.secondaryCooldown > 0) {
      return
    }

    let mode = shooter.secondaryMode
    if (!shooter.isPlayer && Math.random() > 0.62) {
      mode = "molotov"
    }

    const throwable = this.allocThrowable()
    const speed = mode === "grenade" ? 470 : 420
    throwable.active = true
    throwable.ownerId = shooter.id
    throwable.ownerTeam = shooter.team
    throwable.mode = mode
    throwable.position.x = shooter.position.x + shooter.aim.x * (shooter.radius + 4)
    throwable.position.y = shooter.position.y + shooter.aim.y * (shooter.radius + 4)
    throwable.velocity.x = shooter.aim.x * speed
    throwable.velocity.y = shooter.aim.y * speed
    throwable.life = mode === "grenade" ? 0.95 : 0.68
    throwable.radius = mode === "grenade" ? 8 : 7

    const cooldown = mode === "grenade" ? GRENADE_COOLDOWN : MOLOTOV_COOLDOWN
    shooter.secondaryCooldown = cooldown * shooter.grenadeTimer

    if (shooter.isPlayer) {
      this.sfx.shoot()
      secondaryWeaponSignal.value = mode === "grenade" ? "Grenade" : "Molotov"
    }
  }

  private updateProjectiles(dt: number) {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue
      }

      const stepX = projectile.velocity.x * dt
      const stepY = projectile.velocity.y * dt
      projectile.position.x += stepX
      projectile.position.y += stepY
      projectile.traveled += Math.hypot(stepX, stepY)

      const progress = projectile.traveled / projectile.maxRange
      if (progress > 0.62) {
        const drag = clamp(1 - dt * (5 + progress * 10), 0, 1)
        projectile.velocity.x *= drag
        projectile.velocity.y *= drag
      }

      if (progress >= 1 || (progress > 0.72 && Math.hypot(projectile.velocity.x, projectile.velocity.y) < 120)) {
        projectile.active = false
        continue
      }

      if (projectile.position.length() > ARENA_RADIUS + 32) {
        projectile.active = false
        continue
      }

      for (const unit of this.units) {
        if (unit.team === projectile.ownerTeam || unit.id === projectile.ownerId) {
          continue
        }

        const hitDistance = unit.radius + projectile.radius
        if (distSquared(unit.position.x, unit.position.y, projectile.position.x, projectile.position.y) <= hitDistance * hitDistance) {
          this.applyDamage(
            unit,
            projectile.damage,
            projectile.ownerId,
            projectile.position.x,
            projectile.position.y,
            projectile.velocity.x,
            projectile.velocity.y
          )
          projectile.active = false
          break
        }
      }
    }
  }

  private updateThrowables(dt: number) {
    for (const throwable of this.throwables) {
      if (!throwable.active) {
        continue
      }

      throwable.life -= dt
      throwable.position.x += throwable.velocity.x * dt
      throwable.position.y += throwable.velocity.y * dt
      throwable.velocity.x *= clamp(1 - dt * 1.8, 0, 1)
      throwable.velocity.y *= clamp(1 - dt * 1.8, 0, 1)
      limitToArena(throwable.position, throwable.radius)

      if (throwable.life > 0) {
        continue
      }

      throwable.active = false
      if (throwable.mode === "grenade") {
        this.explodeGrenade(throwable)
      } else {
        this.igniteMolotov(throwable)
      }
      this.sfx.explosion()
    }
  }

  private explodeGrenade(throwable: Throwable) {
    const explosionRadius = 95
    const explosionRadiusSquared = explosionRadius * explosionRadius

    for (const unit of this.units) {
      if (unit.team === throwable.ownerTeam) {
        continue
      }

      const dsq = distSquared(unit.position.x, unit.position.y, throwable.position.x, throwable.position.y)
      if (dsq > explosionRadiusSquared) {
        continue
      }

      const distance = Math.sqrt(dsq)
      const falloff = 1 - clamp(distance / explosionRadius, 0, 1)
      const damage = 14 + 24 * falloff
      this.applyDamage(
        unit,
        damage,
        throwable.ownerId,
        unit.position.x,
        unit.position.y,
        unit.position.x - throwable.position.x,
        unit.position.y - throwable.position.y
      )
    }

    const isPlayerOwner = throwable.ownerId === this.player.id
    this.spawnFlowers(
      isPlayerOwner ? "white" : "blue",
      throwable.position.x,
      throwable.position.y,
      randomRange(-1, 1),
      randomRange(-1, 1),
      randomInt(14, 20),
      isPlayerOwner
    )
  }

  private igniteMolotov(throwable: Throwable) {
    const zone = this.allocMolotovZone()
    zone.active = true
    zone.ownerTeam = throwable.ownerTeam
    zone.position.copy(throwable.position)
    zone.radius = 54
    zone.life = 2.6
    zone.tick = 0

    const isPlayerOwner = throwable.ownerId === this.player.id
    this.spawnFlowers(
      isPlayerOwner ? "white" : "blue",
      throwable.position.x,
      throwable.position.y,
      randomRange(-1, 1),
      randomRange(-1, 1),
      randomInt(8, 14),
      isPlayerOwner
    )
  }

  private updateMolotovZones(dt: number) {
    for (const zone of this.molotovZones) {
      if (!zone.active) {
        continue
      }

      zone.life -= dt
      zone.tick -= dt
      if (zone.tick <= 0) {
        zone.tick = 0.18
        const radiusSquared = zone.radius * zone.radius
        for (const unit of this.units) {
          if (unit.team === zone.ownerTeam) {
            continue
          }

          const dsq = distSquared(unit.position.x, unit.position.y, zone.position.x, zone.position.y)
          if (dsq > radiusSquared) {
            continue
          }

          this.applyDamage(
            unit,
            4,
            zone.ownerTeam === "white" ? this.player.id : "zone",
            unit.position.x,
            unit.position.y,
            unit.position.x - zone.position.x,
            unit.position.y - zone.position.y
          )
        }
      }

      if (zone.life <= 0) {
        zone.active = false
      }
    }
  }

  private updateFlowers(dt: number) {
    for (const flower of this.flowers) {
      if (!flower.active) {
        continue
      }

      flower.pop = Math.min(1, flower.pop + dt * 18)
      flower.size = lerp(flower.size, flower.targetSize, flower.pop)
    }
  }

  private updateDamagePopups(dt: number) {
    for (const popup of this.damagePopups) {
      if (!popup.active) {
        continue
      }

      popup.life -= dt
      popup.position.x += popup.velocity.x * dt
      popup.position.y += popup.velocity.y * dt
      popup.velocity.y -= dt * 28
      popup.velocity.x *= clamp(1 - dt * 2.5, 0, 1)

      if (popup.life <= 0) {
        popup.active = false
      }
    }
  }

  private updatePickups(dt: number) {
    this.pickupTimer -= dt

    let activeCount = 0
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }
      activeCount += 1
      pickup.bob += dt * 2.3
    }

    if (activeCount < 3 && this.pickupTimer <= 0) {
      this.spawnPickup()
      this.pickupTimer = randomRange(4.8, 7.3)
    }
  }

  private spawnPickup() {
    const slot = this.pickups.find((pickup) => !pickup.active)
    if (!slot) {
      return
    }

    slot.active = true
    slot.position.copy(randomPointInArena())
    slot.weapon = this.randomLootablePrimary()
    slot.radius = 16
    slot.bob = randomRange(0, Math.PI * 2)
  }

  private collectNearbyPickup(unit: Unit) {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }

      const limit = unit.radius + pickup.radius
      const dsq = distSquared(unit.position.x, unit.position.y, pickup.position.x, pickup.position.y)
      if (dsq > limit * limit) {
        continue
      }

      pickup.active = false
      const config = PRIMARY_WEAPONS[pickup.weapon]
      this.equipPrimary(unit, pickup.weapon, config.pickupAmmo)

      if (unit.isPlayer) {
        statusMessageSignal.value = `Picked up ${config.name}`
      }
    }
  }

  private equipPrimary(unit: Unit, weaponId: PrimaryWeaponId, ammo: number) {
    unit.primaryWeapon = weaponId
    unit.primaryAmmo = ammo
    if (unit.isPlayer) {
      this.updatePlayerWeaponSignals()
    }
  }

  private updatePlayerWeaponSignals() {
    const config = PRIMARY_WEAPONS[this.player.primaryWeapon]
    primaryWeaponSignal.value = config.name
    primaryAmmoSignal.value = Number.isFinite(this.player.primaryAmmo)
      ? `${Math.floor(this.player.primaryAmmo)}`
      : "∞"
  }

  private applyDamage(
    target: Unit,
    amount: number,
    sourceId: string,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number
  ) {
    const damage = Math.max(1, amount)
    target.hp = Math.max(0, target.hp - damage)

    const popup = this.allocPopup()
    popup.active = true
    popup.position.set(target.position.x + randomRange(-8, 8), target.position.y - randomRange(10, 16))
    popup.velocity.set(randomRange(-15, 15), randomRange(28, 48))
    popup.text = `${Math.round(damage)}`
    popup.color = target.isPlayer ? "#7ec4ff" : "#ffffff"
    popup.life = 0.55

    const isPlayerShooter = sourceId === this.player.id
    this.spawnFlowers(
      isPlayerShooter ? "white" : "blue",
      hitX,
      hitY,
      -impactX,
      -impactY,
      randomInt(10, 20),
      isPlayerShooter
    )
    this.sfx.hit()

    if (target.hp <= 0) {
      this.respawnUnit(target)
    }

    if (target.isPlayer) {
      hpSignal.value = {
        hp: Math.round(target.hp),
        maxHp: Math.round(target.maxHp)
      }
    }
  }

  private respawnUnit(unit: Unit) {
    const occupied = this.units.filter((current) => current.id !== unit.id).map((current) => current.position)
    unit.respawn(this.findSafeSpawn(occupied))

    if (!unit.isPlayer) {
      const maybeLoot = Math.random() > 0.54
      if (maybeLoot) {
        const weapon = this.randomLootablePrimary()
        this.equipPrimary(unit, weapon, PRIMARY_WEAPONS[weapon].pickupAmmo)
      } else {
        this.equipPrimary(unit, "pistol", Number.POSITIVE_INFINITY)
      }
    }
  }

  private randomLootablePrimary(): PrimaryWeaponId {
    return (sample(LOOTABLE_PRIMARY_IDS) as PrimaryWeaponId | undefined) ?? "assault"
  }

  private spawnFlowers(
    team: "white" | "blue",
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    amount: number,
    fromPlayer: boolean
  ) {
    const baseAngle = Math.atan2(dirY, dirX)

    for (let index = 0; index < amount; index += 1) {
      const flower = this.allocFlower()
      if (flower.active) {
        if (flower.team === "white") {
          this.whiteFlowers = Math.max(0, this.whiteFlowers - 1)
        } else {
          this.blueFlowers = Math.max(0, this.blueFlowers - 1)
        }
      }

      const angle = baseAngle + randomRange(-0.95, 0.95)
      const distance = randomRange(4, 30)
      flower.active = true
      flower.team = team
      flower.position.set(
        x + Math.cos(angle) * distance + randomRange(-2, 2),
        y + Math.sin(angle) * distance + randomRange(-2, 2)
      )
      limitToArena(flower.position, 3)
      flower.size = 0
      flower.targetSize = randomRange(3, 7)
      flower.pop = 0

      if (team === "white") {
        this.whiteFlowers += 1
      } else {
        this.blueFlowers += 1
      }
    }

    if (fromPlayer) {
      this.playerFlowerTotal += amount
      this.checkPerkProgress()
    }

    this.updateCoverageSignals()
  }

  private checkPerkProgress() {
    if (perkOptionsSignal.value.length > 0) {
      return
    }

    if (this.playerFlowerTotal < this.nextPerkFlowerTarget) {
      return
    }

    this.nextPerkFlowerTarget += PERK_FLOWER_STEP
    this.perkChoices = randomPerkChoices(3)
    perkOptionsSignal.value = this.perkChoices.map((perk) => ({
      id: perk.id,
      name: perk.name,
      description: perk.description
    }))
    statusMessageSignal.value = "Perk ready. Press 1, 2, or 3"
  }

  private consumePerkChoice(index: number) {
    if (index < 0 || index > 2) {
      return
    }

    if (this.perkChoices.length === 0) {
      return
    }

    const choice = this.perkChoices[index]
    if (!choice) {
      return
    }

    const feedback = choice.apply(this.player)
    this.perkChoices = []
    perkOptionsSignal.value = []
    statusMessageSignal.value = feedback
    hpSignal.value = {
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp)
    }
  }

  private updateCoverageSignals() {
    const total = this.whiteFlowers + this.blueFlowers
    if (total <= 0) {
      whiteCoverageSignal.value = 50
      blueCoverageSignal.value = 50
      return
    }

    const white = (this.whiteFlowers / total) * 100
    whiteCoverageSignal.value = white
    blueCoverageSignal.value = 100 - white
  }

  private syncHudSignals() {
    timeRemainingSignal.value = this.timeRemaining
    hpSignal.value = {
      hp: Math.round(this.player.hp),
      maxHp: Math.round(this.player.maxHp)
    }
    this.updatePlayerWeaponSignals()
  }

  private allocProjectile() {
    const slot = this.projectiles[this.projectileCursor]
    this.projectileCursor = (this.projectileCursor + 1) % this.projectiles.length
    return slot
  }

  private allocThrowable() {
    const slot = this.throwables[this.throwableCursor]
    this.throwableCursor = (this.throwableCursor + 1) % this.throwables.length
    return slot
  }

  private allocFlower() {
    const slot = this.flowers[this.flowerCursor]
    this.flowerCursor = (this.flowerCursor + 1) % this.flowers.length
    return slot
  }

  private allocPopup() {
    const slot = this.damagePopups[this.popupCursor]
    this.popupCursor = (this.popupCursor + 1) % this.damagePopups.length
    return slot
  }

  private allocMolotovZone() {
    const slot = this.molotovZones[this.molotovCursor]
    this.molotovCursor = (this.molotovCursor + 1) % this.molotovZones.length
    return slot
  }

  private renderFrame(dt: number) {
    this.context.save()
    this.context.imageSmoothingEnabled = false

    this.context.fillStyle = "#c6ddb7"
    this.context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)

    this.renderArenaGround()

    this.context.translate(VIEW_WIDTH * 0.5 - this.camera.x, VIEW_HEIGHT * 0.5 - this.camera.y)
    this.renderMolotovZones()
    this.renderFlowers()
    this.renderPickups(dt)
    this.renderThrowables()
    this.renderProjectiles()
    this.renderUnits()
    this.renderDamagePopups()
    this.renderArenaBoundary()
    this.context.restore()

    this.renderAtmosphere()
    this.renderMenuCard()
  }

  private renderArenaGround() {
    this.context.save()
    this.context.translate(VIEW_WIDTH * 0.5 - this.camera.x, VIEW_HEIGHT * 0.5 - this.camera.y)

    this.context.fillStyle = "#a3c784"
    this.context.beginPath()
    this.context.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2)
    this.context.fill()

    this.context.save()
    this.context.beginPath()
    this.context.arc(0, 0, ARENA_RADIUS - 2, 0, Math.PI * 2)
    this.context.clip()

    const tile = 24
    const minX = Math.floor((this.camera.x - VIEW_WIDTH * 0.5) / tile) - 2
    const maxX = Math.floor((this.camera.x + VIEW_WIDTH * 0.5) / tile) + 2
    const minY = Math.floor((this.camera.y - VIEW_HEIGHT * 0.5) / tile) - 2
    const maxY = Math.floor((this.camera.y + VIEW_HEIGHT * 0.5) / tile) + 2

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const worldX = x * tile
        const worldY = y * tile
        if (worldX * worldX + worldY * worldY > ARENA_RADIUS * ARENA_RADIUS) {
          continue
        }

        const grain = this.tileNoise(x, y)
        this.context.fillStyle = grain > 0.5 ? "#98bf78" : "#92ba74"
        this.context.fillRect(worldX, worldY, tile, tile)
        this.context.fillStyle = grain > 0.5 ? "#a7cc86" : "#9dc47f"
        this.context.fillRect(worldX + 1, worldY + 1, tile - 6, tile - 6)
      }
    }

    this.context.restore()
    this.context.restore()
  }

  private tileNoise(x: number, y: number) {
    const value = Math.sin(x * 92.11 + y * 37.41) * 43758.5453
    return value - Math.floor(value)
  }

  private renderArenaBoundary() {
    this.context.strokeStyle = "#cfe6bc"
    this.context.lineWidth = 7
    this.context.beginPath()
    this.context.arc(0, 0, ARENA_RADIUS, 0, Math.PI * 2)
    this.context.stroke()

    this.context.strokeStyle = "#84af63"
    this.context.lineWidth = 3
    this.context.beginPath()
    this.context.arc(0, 0, ARENA_RADIUS - 7, 0, Math.PI * 2)
    this.context.stroke()
  }

  private renderFlowers() {
    for (const flower of this.flowers) {
      if (!flower.active) {
        continue
      }

      const size = Math.max(1, flower.size)
      const petal = Math.max(1, Math.floor(size))
      const center = Math.max(1, Math.floor(size * 0.5))
      this.context.fillStyle = flower.team === "white" ? "#f7ffef" : "#5aa8ff"
      this.context.fillRect(flower.position.x - petal, flower.position.y - center, petal * 2, center * 2)
      this.context.fillRect(flower.position.x - center, flower.position.y - petal, center * 2, petal * 2)
      this.context.fillStyle = flower.team === "white" ? "#e5efcf" : "#336fd8"
      this.context.fillRect(flower.position.x - 1, flower.position.y - 1, 2, 2)
    }
  }

  private renderPickups(dt: number) {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }

      const bobOffset = Math.sin(pickup.bob + dt * 4) * 2
      const weapon = PRIMARY_WEAPONS[pickup.weapon]
      this.context.fillStyle = "#2f4f2a"
      this.context.fillRect(pickup.position.x - 11, pickup.position.y - 12 + bobOffset, 22, 22)
      this.context.fillStyle = "#d9e8be"
      this.context.fillRect(pickup.position.x - 9, pickup.position.y - 10 + bobOffset, 18, 18)
      this.context.fillStyle = "#19331c"
      this.context.font = "10px monospace"
      this.context.textAlign = "center"
      this.context.fillText(weapon.icon, pickup.position.x, pickup.position.y + 4 + bobOffset)
    }
  }

  private renderThrowables() {
    for (const throwable of this.throwables) {
      if (!throwable.active) {
        continue
      }

      this.context.fillStyle = throwable.mode === "grenade" ? "#dce551" : "#f88a3a"
      this.context.beginPath()
      this.context.arc(throwable.position.x, throwable.position.y, throwable.radius, 0, Math.PI * 2)
      this.context.fill()
    }
  }

  private renderMolotovZones() {
    for (const zone of this.molotovZones) {
      if (!zone.active) {
        continue
      }

      const alpha = clamp(zone.life / 2.6, 0, 1)
      this.context.fillStyle = `rgba(244, 120, 46, ${0.24 * alpha})`
      this.context.beginPath()
      this.context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2)
      this.context.fill()
      this.context.strokeStyle = `rgba(255, 176, 84, ${0.5 * alpha})`
      this.context.lineWidth = 2
      this.context.beginPath()
      this.context.arc(zone.position.x, zone.position.y, zone.radius - 3, 0, Math.PI * 2)
      this.context.stroke()
    }
  }

  private renderProjectiles() {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue
      }

      const glow = projectile.radius * (1.8 + projectile.glow)
      this.context.fillStyle = "rgba(255, 233, 120, 0.2)"
      this.context.beginPath()
      this.context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
      this.context.fill()

      this.context.fillStyle = "#ffeb77"
      this.context.beginPath()
      this.context.arc(projectile.position.x, projectile.position.y, projectile.radius, 0, Math.PI * 2)
      this.context.fill()
    }
  }

  private renderUnits() {
    for (const unit of this.units) {
      this.context.fillStyle = "rgba(0, 0, 0, 0.2)"
      this.context.beginPath()
      this.context.ellipse(unit.position.x, unit.position.y + 12, 12, 7, 0, 0, Math.PI * 2)
      this.context.fill()

      const tone = unit.isPlayer ? "#f6f2df" : "#7aa6ff"
      const edge = unit.isPlayer ? "#b8b49a" : "#3d67bf"
      const earLeftX = unit.position.x - 9
      const earRightX = unit.position.x + 9
      const earY = unit.position.y - 13

      this.context.fillStyle = edge
      this.context.fillRect(earLeftX - 3, earY - 6, 5, 7)
      this.context.fillRect(earRightX - 1, earY - 6, 5, 7)
      this.context.fillStyle = tone
      this.context.fillRect(earLeftX - 2, earY - 4, 3, 4)
      this.context.fillRect(earRightX, earY - 4, 3, 4)

      this.context.fillStyle = edge
      this.context.fillRect(unit.position.x - 11, unit.position.y - 10, 22, 20)
      this.context.fillStyle = tone
      this.context.fillRect(unit.position.x - 9, unit.position.y - 8, 18, 16)

      const gunLength = 13
      const gunX = unit.position.x + unit.aim.x * gunLength
      const gunY = unit.position.y + unit.aim.y * gunLength
      this.context.strokeStyle = unit.isPlayer ? "#f0e6ad" : "#a2d0ff"
      this.context.lineWidth = 4
      this.context.beginPath()
      this.context.moveTo(unit.position.x, unit.position.y)
      this.context.lineTo(gunX, gunY)
      this.context.stroke()

      const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
      this.context.fillStyle = "rgba(0, 0, 0, 0.4)"
      this.context.fillRect(unit.position.x - 12, unit.position.y - 19, 24, 4)
      this.context.fillStyle = unit.isPlayer ? "#e8ffdb" : "#8fc0ff"
      this.context.fillRect(unit.position.x - 12, unit.position.y - 19, 24 * hpRatio, 4)
    }
  }

  private renderDamagePopups() {
    this.context.textAlign = "center"
    this.context.font = "13px monospace"
    for (const popup of this.damagePopups) {
      if (!popup.active) {
        continue
      }

      const alpha = clamp(popup.life / 0.55, 0, 1)
      this.context.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`
      this.context.fillText(popup.text, popup.position.x + 1, popup.position.y + 1)
      this.context.fillStyle = popup.color.replace("rgb", "rgba")
      this.context.globalAlpha = alpha
      this.context.fillStyle = popup.color
      this.context.fillText(popup.text, popup.position.x, popup.position.y)
      this.context.globalAlpha = 1
    }
  }

  private renderAtmosphere() {
    const gradient = this.context.createRadialGradient(
      VIEW_WIDTH * 0.5,
      VIEW_HEIGHT * 0.5,
      60,
      VIEW_WIDTH * 0.5,
      VIEW_HEIGHT * 0.5,
      VIEW_WIDTH * 0.75
    )
    gradient.addColorStop(0, "rgba(210, 236, 196, 0)")
    gradient.addColorStop(1, "rgba(133, 168, 120, 0.28)")
    this.context.fillStyle = gradient
    this.context.fillRect(0, 0, VIEW_WIDTH, VIEW_HEIGHT)
  }

  private renderMenuCard() {
    if (this.started && !this.finished) {
      return
    }

    this.context.fillStyle = "rgba(20, 36, 22, 0.56)"
    this.context.fillRect(VIEW_WIDTH * 0.5 - 220, VIEW_HEIGHT * 0.5 - 60, 440, 120)
    this.context.strokeStyle = "#d6eaba"
    this.context.lineWidth = 2
    this.context.strokeRect(VIEW_WIDTH * 0.5 - 220, VIEW_HEIGHT * 0.5 - 60, 440, 120)

    this.context.textAlign = "center"
    this.context.fillStyle = "#edf7da"
    this.context.font = "bold 24px monospace"
    this.context.fillText("BadaBada", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 - 14)
    this.context.font = "14px monospace"
    this.context.fillText("Click to start 90s arena", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 16)
    if (this.finished) {
      this.context.fillText("Click again for rematch", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 38)
    }
  }
}
