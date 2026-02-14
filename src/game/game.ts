import { sample } from "@std/random"

import { AudioDirector, SfxSynth } from "./audio.ts"
import {
  DamagePopup,
  Flower,
  MolotovZone,
  Obstacle,
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
  ARENA_END_RADIUS,
  ARENA_START_RADIUS,
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
const WORLD_SCALE = VIEW_WIDTH / 25
const FLOWER_POOL_SIZE = 5000
const PROJECTILE_POOL_SIZE = 480
const THROWABLE_POOL_SIZE = 96
const DAMAGE_POPUP_POOL_SIZE = 200
const PICKUP_POOL_SIZE = 12
const MOLOTOV_POOL_SIZE = 36
const OBSTACLE_POOL_SIZE = 36
const BOT_COUNT = 7
const PERK_FLOWER_STEP = 130
const PLAYER_BASE_SPEED = 9.5
const BOT_BASE_SPEED = 8.4

interface ExplosionFx {
  active: boolean
  position: Vec2
  life: number
  radius: number
}

interface InputState {
  keys: Set<string>
  leftDown: boolean
  rightDown: boolean
  canvasX: number
  canvasY: number
  screenX: number
  screenY: number
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
    screenX: VIEW_WIDTH * 0.5,
    screenY: VIEW_HEIGHT * 0.5,
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
  private obstacles = Array.from({ length: OBSTACLE_POOL_SIZE }, (_, index) => {
    const obstacle = new Obstacle()
    obstacle.id = `obstacle-${index + 1}`
    return obstacle
  })
  private explosions: ExplosionFx[] = Array.from({ length: 24 }, () => ({
    active: false,
    position: new Vec2(),
    life: 0,
    radius: 0
  }))

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
  private arenaRadius = ARENA_START_RADIUS

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
    this.player.reserveAmmo = Number.POSITIVE_INFINITY
    this.player.secondaryMode = "grenade"
    this.player.radius = 0.3
    this.player.speed = PLAYER_BASE_SPEED
    this.player.maxHp = 10
    this.player.hp = 10

    this.bots = []
    for (let index = 0; index < BOT_COUNT; index += 1) {
      const bot = new Unit(`bot-${index + 1}`, false, "blue")
      bot.speed = BOT_BASE_SPEED
      bot.radius = 0.28
      bot.maxHp = 10
      bot.hp = 10
      bot.primaryWeapon = this.randomLootablePrimary()
      bot.primaryAmmo = PRIMARY_WEAPONS[bot.primaryWeapon].magazineSize
      bot.reserveAmmo = PRIMARY_WEAPONS[bot.primaryWeapon].pickupAmmo
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
    statusMessageSignal.value = "Click once to wake audio, then fight from 50m down to 25m"
    crosshairSignal.value = {
      x: this.canvas.clientWidth * 0.5,
      y: this.canvas.clientHeight * 0.5,
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
    const wasPrimed = this.audioPrimed
    if (!this.audioPrimed) {
      this.primeAudio()
    }

    if (!wasPrimed && !this.started && event.key !== "Enter") {
      return
    }

    this.input.keys.add(event.key.toLowerCase())

    if (event.key === "Enter" && (!this.started || this.finished)) {
      this.beginMatch()
      return
    }

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
    const screenX = clamp(event.clientX - rect.left, 0, rect.width)
    const screenY = clamp(event.clientY - rect.top, 0, rect.height)
    const normalizedX = rect.width > 0 ? screenX / rect.width : 0.5
    const normalizedY = rect.height > 0 ? screenY / rect.height : 0.5

    this.input.screenX = screenX
    this.input.screenY = screenY
    this.input.canvasX = normalizedX * VIEW_WIDTH
    this.input.canvasY = normalizedY * VIEW_HEIGHT
    this.input.worldX = this.camera.x + (this.input.canvasX - VIEW_WIDTH * 0.5) / WORLD_SCALE
    this.input.worldY = this.camera.y + (this.input.canvasY - VIEW_HEIGHT * 0.5) / WORLD_SCALE

    crosshairSignal.value = {
      x: this.input.screenX,
      y: this.input.screenY,
      visible: true
    }
  }

  private onPointerDown = (event: PointerEvent) => {
    const wasPrimed = this.audioPrimed
    if (!this.audioPrimed) {
      this.primeAudio()
    }

    if (!wasPrimed && !this.started) {
      statusMessageSignal.value = "Menu theme awake. Click again or press Enter to deploy"
      return
    }

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
      x: this.input.screenX,
      y: this.input.screenY,
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
    this.audioDirector.prime()
    this.sfx.prime()
    this.audioDirector.startMenu()
  }

  private beginMatch() {
    this.started = true
    this.running = true
    this.finished = false
    this.timeRemaining = 90
    this.arenaRadius = ARENA_START_RADIUS
    this.pickupTimer = 1.5
    this.whiteFlowers = 0
    this.blueFlowers = 0
    this.playerFlowerTotal = 0
    this.nextPerkFlowerTarget = PERK_FLOWER_STEP

    this.player.maxHp = 10
    this.player.hp = 10
    this.player.damageMultiplier = 1
    this.player.fireRateMultiplier = 1
    this.player.bulletSizeMultiplier = 1
    this.player.speed = PLAYER_BASE_SPEED
    this.player.grenadeTimer = 1
    this.equipPrimary(this.player, "pistol", Number.POSITIVE_INFINITY)

    for (const bot of this.bots) {
      bot.maxHp = 10
      bot.hp = 10
      bot.damageMultiplier = 1
      bot.fireRateMultiplier = 1
      bot.bulletSizeMultiplier = 1
      bot.speed = BOT_BASE_SPEED
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

    for (const obstacle of this.obstacles) {
      obstacle.active = false
      obstacle.lootDropped = false
    }

    for (const explosion of this.explosions) {
      explosion.active = false
    }

    this.spawnObstacles()

    this.cameraShake = 0
    this.cameraOffset.set(0, 0)
    this.hitStop = 0

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
      const candidate = randomPointInArena(this.arenaRadius)
      let safe = true

      for (const existing of occupied) {
        if (distSquared(candidate.x, candidate.y, existing.x, existing.y) < 3.2 * 3.2) {
          safe = false
          break
        }
      }

      if (safe) {
        return candidate
      }
    }

    return randomPointInArena(this.arenaRadius)
  }

  private spawnObstacles() {
    const obstacleCount = randomInt(7, 11)
    const occupied = this.units.map((unit) => unit.position)
    let cursor = 0

    for (const obstacle of this.obstacles) {
      obstacle.active = false
      obstacle.lootDropped = false
    }

    while (cursor < obstacleCount && cursor < this.obstacles.length) {
      const obstacle = this.obstacles[cursor]
      obstacle.kind = Math.random() > 0.73 ? "house" : "box"
      if (obstacle.kind === "house") {
        const cols = randomInt(3, 6)
        const rows = randomInt(3, 5)
        obstacle.width = cols
        obstacle.height = rows
        obstacle.tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
        obstacle.maxHp = cols * rows
      } else {
        obstacle.width = randomRange(1.1, 1.9)
        obstacle.height = randomRange(1.1, 1.9)
        obstacle.tiles = []
        obstacle.maxHp = 9
      }
      obstacle.hp = obstacle.maxHp

      let candidate = randomPointInArena(this.arenaRadius - 2)
      let attempts = 0
      while (attempts < 30) {
        let safe = true
        for (const point of occupied) {
          if (distSquared(point.x, point.y, candidate.x, candidate.y) < 4.4 * 4.4) {
            safe = false
            break
          }
        }

        if (safe) {
          break
        }

        candidate = randomPointInArena(this.arenaRadius - 2)
        attempts += 1
      }

      obstacle.active = true
      obstacle.position.copy(candidate)
      occupied.push(candidate.clone())
      cursor += 1
    }
  }

  private resolveUnitCollisions() {
    for (let left = 0; left < this.units.length; left += 1) {
      const unitA = this.units[left]
      for (let right = left + 1; right < this.units.length; right += 1) {
        const unitB = this.units[right]
        const dx = unitB.position.x - unitA.position.x
        const dy = unitB.position.y - unitA.position.y
        const distance = Math.hypot(dx, dy) || 0.0001
        const minimum = unitA.radius + unitB.radius
        if (distance >= minimum) {
          continue
        }

        const overlap = (minimum - distance) * 0.5
        const nx = dx / distance
        const ny = dy / distance
        unitA.position.x -= nx * overlap
        unitA.position.y -= ny * overlap
        unitB.position.x += nx * overlap
        unitB.position.y += ny * overlap

        unitA.velocity.x -= nx * overlap * 2
        unitA.velocity.y -= ny * overlap * 2
        unitB.velocity.x += nx * overlap * 2
        unitB.velocity.y += ny * overlap * 2
      }
    }

    for (const unit of this.units) {
      this.resolveObstacleCollision(unit)
    }
  }

  private resolveObstacleCollision(unit: Unit) {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) {
        continue
      }

      if (obstacle.kind === "house") {
        const originX = obstacle.position.x - obstacle.width * 0.5
        const originY = obstacle.position.y - obstacle.height * 0.5
        for (let row = 0; row < obstacle.tiles.length; row += 1) {
          for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
            if (!obstacle.tiles[row][col]) {
              continue
            }

            const tileCenterX = originX + col + 0.5
            const tileCenterY = originY + row + 0.5
            this.resolveUnitVsRect(unit, tileCenterX, tileCenterY, 1, 1)
          }
        }
        continue
      }

      this.resolveUnitVsRect(unit, obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height)
    }
  }

  private resolveUnitVsRect(unit: Unit, centerX: number, centerY: number, width: number, height: number) {
    const halfWidth = width * 0.5
    const halfHeight = height * 0.5
    const nearestX = clamp(unit.position.x, centerX - halfWidth, centerX + halfWidth)
    const nearestY = clamp(unit.position.y, centerY - halfHeight, centerY + halfHeight)
    const dx = unit.position.x - nearestX
    const dy = unit.position.y - nearestY
    const dsq = dx * dx + dy * dy
    if (dsq >= unit.radius * unit.radius) {
      return
    }

    const distance = Math.sqrt(dsq) || 0.0001
    const push = unit.radius - distance
    const nx = dx / distance
    const ny = dy / distance
    unit.position.x += nx * push
    unit.position.y += ny * push
    unit.velocity.x += nx * push * 2
    unit.velocity.y += ny * push * 2
  }

  private hitObstacle(projectile: Projectile) {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) {
        continue
      }

      if (obstacle.kind === "house") {
        const originX = obstacle.position.x - obstacle.width * 0.5
        const originY = obstacle.position.y - obstacle.height * 0.5
        const tileX = Math.floor(projectile.position.x - originX)
        const tileY = Math.floor(projectile.position.y - originY)
        if (
          tileX < 0 ||
          tileY < 0 ||
          tileY >= obstacle.tiles.length ||
          tileX >= obstacle.tiles[tileY].length ||
          !obstacle.tiles[tileY][tileX]
        ) {
          continue
        }

        obstacle.tiles[tileY][tileX] = false
        obstacle.hp -= 1
        this.spawnExplosion(originX + tileX + 0.5, originY + tileY + 0.5, 0.45)
        if (obstacle.hp <= 0) {
          this.breakObstacle(obstacle)
        }
        return true
      }

      const halfWidth = obstacle.width * 0.5
      const halfHeight = obstacle.height * 0.5
      if (
        projectile.position.x < obstacle.position.x - halfWidth ||
        projectile.position.x > obstacle.position.x + halfWidth ||
        projectile.position.y < obstacle.position.y - halfHeight ||
        projectile.position.y > obstacle.position.y + halfHeight
      ) {
        continue
      }

      obstacle.hp -= projectile.damage
      this.spawnExplosion(projectile.position.x, projectile.position.y, 0.3)
      if (obstacle.hp <= 0) {
        this.breakObstacle(obstacle)
      }
      return true
    }

    return false
  }

  private breakObstacle(obstacle: Obstacle) {
    obstacle.active = false
    this.spawnExplosion(obstacle.position.x, obstacle.position.y, Math.max(obstacle.width, obstacle.height) * 0.8)

    if (!obstacle.lootDropped && Math.random() > 0.48) {
      obstacle.lootDropped = true
      this.spawnPickupAt(obstacle.position)
    }
  }

  private damageHouseByExplosion(obstacle: Obstacle, x: number, y: number, radius: number) {
    if (obstacle.kind !== "house" || !obstacle.active) {
      return
    }

    const originX = obstacle.position.x - obstacle.width * 0.5
    const originY = obstacle.position.y - obstacle.height * 0.5
    for (let row = 0; row < obstacle.tiles.length; row += 1) {
      for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
        if (!obstacle.tiles[row][col]) {
          continue
        }

        const tileCenterX = originX + col + 0.5
        const tileCenterY = originY + row + 0.5
        if (distSquared(tileCenterX, tileCenterY, x, y) > radius * radius) {
          continue
        }

        obstacle.tiles[row][col] = false
        obstacle.hp -= 1
      }
    }

    if (obstacle.hp <= 0) {
      this.breakObstacle(obstacle)
    }
  }

  private constrainUnitsToArena() {
    for (const unit of this.units) {
      limitToArena(unit.position, unit.radius, this.arenaRadius)
    }

    for (const obstacle of this.obstacles) {
      if (!obstacle.active) {
        continue
      }

      const margin = Math.max(obstacle.width, obstacle.height) * 0.35
      if (obstacle.position.length() > this.arenaRadius - margin) {
        obstacle.active = false
      }
    }
  }

  private updateExplosions(dt: number) {
    for (const explosion of this.explosions) {
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
    const slot = this.explosions.find((explosion) => !explosion.active) ?? this.explosions[0]
    slot.active = true
    slot.position.set(x, y)
    slot.radius = radius
    slot.life = 0.24
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
    this.updateCombatFeel(dt)

    const simDt = this.hitStop > 0 ? dt * 0.12 : dt
    this.hitStop = Math.max(0, this.hitStop - dt)

    if (!this.running) {
      this.updateFlowers(simDt)
      this.updateDamagePopups(simDt)
      this.updateExplosions(simDt)
      this.updateCrosshairWorld()
      return
    }

    this.timeRemaining -= dt
    if (this.timeRemaining <= 0) {
      this.timeRemaining = 0
      this.finishMatch()
    }

    const shrinkProgress = 1 - this.timeRemaining / 90
    this.arenaRadius = lerp(ARENA_START_RADIUS, ARENA_END_RADIUS, clamp(shrinkProgress, 0, 1))

    this.updateCrosshairWorld()
    this.updatePlayer(simDt)
    this.updateBots(simDt)
    this.resolveUnitCollisions()
    this.constrainUnitsToArena()
    this.updateProjectiles(simDt)
    this.updateThrowables(simDt)
    this.updateMolotovZones(simDt)
    this.updateFlowers(simDt)
    this.updateDamagePopups(simDt)
    this.updatePickups(simDt)
    this.updateExplosions(simDt)
    this.syncHudSignals()
  }

  private finishMatch() {
    this.running = false
    this.finished = true
    this.audioDirector.startMenu()

    if (this.whiteFlowers >= this.blueFlowers) {
      statusMessageSignal.value = "Time up. Your trail dominates the arena"
    } else {
      statusMessageSignal.value = "Time up. Rival bloom overwhelms the field"
    }

    perkOptionsSignal.value = []
    this.perkChoices = []
  }

  private updateCrosshairWorld() {
    this.input.worldX = this.camera.x + (this.input.canvasX - VIEW_WIDTH * 0.5) / WORLD_SCALE
    this.input.worldY = this.camera.y + (this.input.canvasY - VIEW_HEIGHT * 0.5) / WORLD_SCALE
  }

  private updateCombatFeel(dt: number) {
    for (const unit of this.units) {
      unit.hitFlash = Math.max(0, unit.hitFlash - dt * 6.5)
      unit.recoil = Math.max(0, unit.recoil - dt * 8.5)
    }

    this.cameraShake = Math.max(0, this.cameraShake - dt * 5)
    const shakePower = this.cameraShake * this.cameraShake
    this.cameraOffset.x = randomRange(-1, 1) * shakePower * 0.24
    this.cameraOffset.y = randomRange(-1, 1) * shakePower * 0.18
  }

  private updatePlayer(dt: number) {
    this.player.shootCooldown = Math.max(0, this.player.shootCooldown - dt)
    this.player.secondaryCooldown = Math.max(0, this.player.secondaryCooldown - dt)
    this.player.reloadCooldown = Math.max(0, this.player.reloadCooldown - dt)
    if (this.player.reloadCooldown <= 0) {
      this.finishReload(this.player)
    }

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

    const moveLength = Math.hypot(moveX, moveY)
    const targetSpeed = this.player.speed
    const targetVelocityX = moveLength > 0 ? (moveX / moveLength) * targetSpeed : 0
    const targetVelocityY = moveLength > 0 ? (moveY / moveLength) * targetSpeed : 0
    const accel = moveLength > 0 ? 24 : 18
    this.player.velocity.x = lerp(this.player.velocity.x, targetVelocityX, clamp(dt * accel, 0, 1))
    this.player.velocity.y = lerp(this.player.velocity.y, targetVelocityY, clamp(dt * accel, 0, 1))

    this.player.position.x += this.player.velocity.x * dt
    this.player.position.y += this.player.velocity.y * dt
    limitToArena(this.player.position, this.player.radius, this.arenaRadius)

    const aimX = this.input.worldX - this.player.position.x
    const aimY = this.input.worldY - this.player.position.y
    const aimLength = Math.hypot(aimX, aimY) || 1
    this.player.aim.x = aimX / aimLength
    this.player.aim.y = aimY / aimLength

    if (this.input.leftDown) {
      this.firePrimary(this.player)
    }

    if (this.input.keys.has("r")) {
      this.startReload(this.player)
    }

    if (this.input.rightDown) {
      this.throwSecondary(this.player)
    }

    this.collectNearbyPickup(this.player)
  }

  private findNearestTarget(origin: Unit, maxDistance = Number.POSITIVE_INFINITY) {
    let target: Unit | null = null
    let bestDistance = maxDistance
    let deltaX = 0
    let deltaY = 0

    for (const candidate of this.units) {
      if (candidate.id === origin.id) {
        continue
      }

      const dx = candidate.position.x - origin.position.x
      const dy = candidate.position.y - origin.position.y
      const distance = Math.hypot(dx, dy)
      if (distance >= bestDistance) {
        continue
      }

      target = candidate
      bestDistance = distance
      deltaX = dx
      deltaY = dy
    }

    return {
      target,
      distance: bestDistance,
      deltaX,
      deltaY
    }
  }

  private updateBots(dt: number) {
    for (const bot of this.bots) {
      bot.shootCooldown = Math.max(0, bot.shootCooldown - dt)
      bot.secondaryCooldown = Math.max(0, bot.secondaryCooldown - dt)
      bot.reloadCooldown = Math.max(0, bot.reloadCooldown - dt)
      if (bot.reloadCooldown <= 0) {
        this.finishReload(bot)
      }
      bot.aiDecisionTimer -= dt
      let desiredVelocityX = bot.velocity.x
      let desiredVelocityY = bot.velocity.y

      const nearestTarget = this.findNearestTarget(bot, 36)
      const hasTarget = nearestTarget.target !== null
      const distanceToTarget = nearestTarget.distance
      const toTargetX = nearestTarget.deltaX
      const toTargetY = nearestTarget.deltaY

      if (bot.hp <= bot.maxHp * 0.32) {
        bot.aiState = "flee"
      } else if (hasTarget && distanceToTarget < 24) {
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
        desiredVelocityX = bot.aiMove.x * bot.speed * 0.7
        desiredVelocityY = bot.aiMove.y * bot.speed * 0.7
      }

      if (bot.aiState === "aggro") {
        if (!hasTarget) {
          bot.aiState = "wander"
          continue
        }

        const distanceSafe = distanceToTarget || 1
        const towardX = toTargetX / distanceSafe
        const towardY = toTargetY / distanceSafe
        const strafe = Math.sin(performance.now() * 0.001 + Number(bot.id.replace("bot-", "")))
        desiredVelocityX = (towardX + -towardY * strafe * 0.45) * bot.speed
        desiredVelocityY = (towardY + towardX * strafe * 0.45) * bot.speed

        bot.aim.x = towardX
        bot.aim.y = towardY

        if (distanceToTarget < 32) {
          this.firePrimary(bot)
        }

        if (distanceToTarget < 12 && Math.random() < 0.014) {
          this.throwSecondary(bot)
        }
      }

      if (bot.aiState === "flee") {
        if (!hasTarget) {
          bot.aiState = "wander"
          continue
        }

        const distanceSafe = distanceToTarget || 1
        const fromX = -toTargetX / distanceSafe
        const fromY = -toTargetY / distanceSafe
        desiredVelocityX = fromX * bot.speed * 1.15
        desiredVelocityY = fromY * bot.speed * 1.15
        bot.aim.x = toTargetX / distanceSafe
        bot.aim.y = toTargetY / distanceSafe

        if (distanceToTarget < 24) {
          this.firePrimary(bot)
        }
      }

      bot.velocity.x = lerp(bot.velocity.x, desiredVelocityX, clamp(dt * 16, 0, 1))
      bot.velocity.y = lerp(bot.velocity.y, desiredVelocityY, clamp(dt * 16, 0, 1))

      bot.position.x += bot.velocity.x * dt
      bot.position.y += bot.velocity.y * dt
      limitToArena(bot.position, bot.radius, this.arenaRadius)

      this.collectNearbyPickup(bot)
    }
  }

  private firePrimary(shooter: Unit) {
    if (shooter.shootCooldown > 0 || shooter.reloadCooldown > 0) {
      return
    }

    if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
      if (Number.isFinite(shooter.reserveAmmo) && shooter.reserveAmmo > 0) {
        this.startReload(shooter)
        return
      }

      this.equipPrimary(shooter, "pistol", Number.POSITIVE_INFINITY)
    }

    const weapon = PRIMARY_WEAPONS[shooter.primaryWeapon]

    shooter.shootCooldown = weapon.cooldown / shooter.fireRateMultiplier
    shooter.recoil = Math.min(1, shooter.recoil + 0.38 + weapon.pellets * 0.05)
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
      projectile.position.x = shooter.position.x + dirX * (shooter.radius + 0.08)
      projectile.position.y = shooter.position.y + dirY * (shooter.radius + 0.08)
      projectile.velocity.x = dirX * weapon.speed * randomRange(1.02, 1.14)
      projectile.velocity.y = dirY * weapon.speed * randomRange(1.02, 1.14)
      projectile.radius = weapon.bulletRadius * shooter.bulletSizeMultiplier
      projectile.damage = weapon.damage * shooter.damageMultiplier
      projectile.maxRange = weapon.range
      projectile.traveled = 0
      projectile.glow = randomRange(0.4, 0.9)
    }

    if (Number.isFinite(shooter.primaryAmmo) && shooter.primaryAmmo <= 0) {
      if (Number.isFinite(shooter.reserveAmmo) && shooter.reserveAmmo > 0) {
        this.startReload(shooter)
      } else {
        this.equipPrimary(shooter, "pistol", Number.POSITIVE_INFINITY)
      }
    }

    if (shooter.isPlayer) {
      this.cameraShake = Math.min(1.1, this.cameraShake + 0.09)
      this.sfx.shoot()
      this.updatePlayerWeaponSignals()
    } else if (Math.random() > 0.82) {
      this.sfx.shoot()
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
    const speed = mode === "grenade" ? 30 : 20
    throwable.active = true
    throwable.ownerId = shooter.id
    throwable.ownerTeam = shooter.team
    throwable.mode = mode
    throwable.position.x = shooter.position.x + shooter.aim.x * (shooter.radius + 0.12)
    throwable.position.y = shooter.position.y + shooter.aim.y * (shooter.radius + 0.12)
    throwable.velocity.x = shooter.aim.x * speed
    throwable.velocity.y = shooter.aim.y * speed
    throwable.life = mode === "grenade" ? 1.05 : 0.78
    throwable.radius = mode === "grenade" ? 0.36 : 0.3

    const cooldown = mode === "grenade" ? GRENADE_COOLDOWN : MOLOTOV_COOLDOWN
    shooter.secondaryCooldown = cooldown * shooter.grenadeTimer
    shooter.recoil = Math.min(1, shooter.recoil + 0.5)

    if (shooter.isPlayer) {
      this.cameraShake = Math.min(1.1, this.cameraShake + 0.14)
      this.sfx.shoot()
      secondaryWeaponSignal.value = mode === "grenade" ? "Grenade" : "Molotov"
    } else if (Math.random() > 0.88) {
      this.sfx.shoot()
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

      if (progress >= 1 || (progress > 0.72 && Math.hypot(projectile.velocity.x, projectile.velocity.y) < 4)) {
        projectile.active = false
        continue
      }

      if (projectile.position.length() > this.arenaRadius + 4) {
        projectile.active = false
        continue
      }

      if (this.hitObstacle(projectile)) {
        projectile.active = false
        continue
      }

      for (const unit of this.units) {
        if (unit.id === projectile.ownerId) {
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
      throwable.velocity.x *= clamp(1 - dt * 0.55, 0, 1)
      throwable.velocity.y *= clamp(1 - dt * 0.55, 0, 1)
      limitToArena(throwable.position, throwable.radius, this.arenaRadius)

      for (const obstacle of this.obstacles) {
        if (!obstacle.active) {
          continue
        }

        if (obstacle.kind === "house") {
          const originX = obstacle.position.x - obstacle.width * 0.5
          const originY = obstacle.position.y - obstacle.height * 0.5
          const tileX = Math.floor(throwable.position.x - originX)
          const tileY = Math.floor(throwable.position.y - originY)
          if (
            tileX >= 0 &&
            tileY >= 0 &&
            tileY < obstacle.tiles.length &&
            tileX < obstacle.tiles[tileY].length &&
            obstacle.tiles[tileY][tileX]
          ) {
            throwable.life = 0
            obstacle.tiles[tileY][tileX] = false
            obstacle.hp -= 1
            if (obstacle.hp <= 0) {
              this.breakObstacle(obstacle)
            }
            break
          }
          continue
        }

        const halfWidth = obstacle.width * 0.5
        const halfHeight = obstacle.height * 0.5
        if (
          throwable.position.x >= obstacle.position.x - halfWidth &&
          throwable.position.x <= obstacle.position.x + halfWidth &&
          throwable.position.y >= obstacle.position.y - halfHeight &&
          throwable.position.y <= obstacle.position.y + halfHeight
        ) {
          throwable.life = 0
          obstacle.hp -= throwable.mode === "grenade" ? 6 : 2
          if (obstacle.hp <= 0) {
            this.breakObstacle(obstacle)
          }
          break
        }
      }

      if (throwable.life > 0) {
        continue
      }

      throwable.active = false
      if (throwable.mode === "grenade") {
        this.explodeGrenade(throwable)
      } else {
        this.igniteMolotov(throwable)
      }
      this.cameraShake = Math.min(1.15, this.cameraShake + 0.16)
      this.hitStop = Math.max(this.hitStop, 0.006)
      this.sfx.explosion()
    }
  }

  private explodeGrenade(throwable: Throwable) {
    const explosionRadius = 3.8
    const explosionRadiusSquared = explosionRadius * explosionRadius
    this.spawnExplosion(throwable.position.x, throwable.position.y, explosionRadius)

    for (const unit of this.units) {
      if (unit.id === throwable.ownerId) {
        continue
      }

      const dsq = distSquared(unit.position.x, unit.position.y, throwable.position.x, throwable.position.y)
      if (dsq > explosionRadiusSquared) {
        continue
      }

      const distance = Math.sqrt(dsq)
      const falloff = 1 - clamp(distance / explosionRadius, 0, 1)
      const damage = 3 + 5 * falloff
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

    for (const obstacle of this.obstacles) {
      if (!obstacle.active) {
        continue
      }

      if (obstacle.kind === "house") {
        this.damageHouseByExplosion(obstacle, throwable.position.x, throwable.position.y, explosionRadius)
        continue
      }

      const dx = obstacle.position.x - throwable.position.x
      const dy = obstacle.position.y - throwable.position.y
      if (dx * dx + dy * dy > explosionRadiusSquared) {
        continue
      }

      obstacle.hp -= 6
      if (obstacle.hp <= 0) {
        this.breakObstacle(obstacle)
      }
    }

  }

  private igniteMolotov(throwable: Throwable) {
    const zone = this.allocMolotovZone()
    zone.active = true
    zone.ownerId = throwable.ownerId
    zone.ownerTeam = throwable.ownerTeam
    zone.position.copy(throwable.position)
    zone.radius = 2.9
    zone.life = 2.2
    zone.tick = 0
  }

  private updateMolotovZones(dt: number) {
    for (const zone of this.molotovZones) {
      if (!zone.active) {
        continue
      }

      zone.life -= dt
      zone.tick -= dt
      if (zone.tick <= 0) {
        zone.tick = 0.22
        const radiusSquared = zone.radius * zone.radius
        for (const unit of this.units) {
          if (unit.id === zone.ownerId) {
            continue
          }

          const dsq = distSquared(unit.position.x, unit.position.y, zone.position.x, zone.position.y)
          if (dsq > radiusSquared) {
            continue
          }

          this.applyDamage(
            unit,
            1,
            zone.ownerId,
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
      popup.velocity.y -= dt * 3.2
      popup.velocity.x *= clamp(1 - dt * 1.7, 0, 1)

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
    this.spawnPickupAt(randomPointInArena(this.arenaRadius))
  }

  private spawnPickupAt(position: Vec2) {
    const slot = this.pickups.find((pickup) => !pickup.active)
    if (!slot) {
      return
    }

    slot.active = true
    slot.position.copy(position)
    slot.weapon = this.randomLootablePrimary()
    slot.radius = 0.8
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

  private startReload(unit: Unit) {
    if (unit.reloadCooldown > 0) {
      return
    }

    const weapon = PRIMARY_WEAPONS[unit.primaryWeapon]
    if (!Number.isFinite(unit.primaryAmmo) || !Number.isFinite(unit.reserveAmmo)) {
      return
    }

    if (unit.primaryAmmo >= unit.magazineSize || unit.reserveAmmo <= 0) {
      return
    }

    unit.reloadCooldown = weapon.reload
    if (unit.isPlayer) {
      primaryAmmoSignal.value = "Reloading..."
    }
  }

  private finishReload(unit: Unit) {
    if (unit.reloadCooldown > 0) {
      return
    }

    if (!Number.isFinite(unit.primaryAmmo) || !Number.isFinite(unit.reserveAmmo)) {
      return
    }

    const room = Math.max(0, unit.magazineSize - unit.primaryAmmo)
    if (room <= 0 || unit.reserveAmmo <= 0) {
      return
    }

    const moved = Math.min(room, unit.reserveAmmo)
    unit.primaryAmmo += moved
    unit.reserveAmmo -= moved
    if (unit.isPlayer) {
      this.updatePlayerWeaponSignals()
    }
  }

  private equipPrimary(unit: Unit, weaponId: PrimaryWeaponId, ammo: number) {
    const config = PRIMARY_WEAPONS[weaponId]
    unit.primaryWeapon = weaponId
    unit.magazineSize = config.magazineSize
    unit.reloadCooldown = 0

    if (Number.isFinite(ammo) && Number.isFinite(config.magazineSize)) {
      unit.reserveAmmo = Math.max(0, ammo)
      const loaded = Math.min(unit.magazineSize, unit.reserveAmmo)
      unit.primaryAmmo = loaded
      unit.reserveAmmo -= loaded
    } else {
      unit.primaryAmmo = Number.POSITIVE_INFINITY
      unit.reserveAmmo = Number.POSITIVE_INFINITY
    }

    if (unit.isPlayer) {
      this.updatePlayerWeaponSignals()
    }
  }

  private updatePlayerWeaponSignals() {
    const config = PRIMARY_WEAPONS[this.player.primaryWeapon]
    primaryWeaponSignal.value = config.name
    if (this.player.reloadCooldown > 0) {
      primaryAmmoSignal.value = "Reloading..."
      return
    }

    primaryAmmoSignal.value = Number.isFinite(this.player.primaryAmmo)
      ? `${Math.floor(this.player.primaryAmmo)} / ${Math.floor(this.player.reserveAmmo)}`
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
    target.hitFlash = 1
    target.recoil = Math.min(1, target.recoil + 0.45)

    const popup = this.allocPopup()
    popup.active = true
    popup.position.set(target.position.x + randomRange(-0.4, 0.4), target.position.y - randomRange(0.6, 1.1))
    popup.velocity.set(randomRange(-1.3, 1.3), randomRange(2.8, 4.3))
    popup.text = `${Math.round(damage)}`
    popup.color = target.isPlayer ? "#8fc8ff" : "#fff6cc"
    popup.life = 0.62

    const isPlayerShooter = sourceId === this.player.id
    this.spawnFlowers(
      sourceId,
      hitX,
      hitY,
      -impactX,
      -impactY,
      randomInt(10, 20)
    )

    if (isPlayerShooter) {
      this.cameraShake = Math.min(1.2, this.cameraShake + 0.12)
      this.hitStop = Math.max(this.hitStop, 0.012)
    }

    if (target.isPlayer) {
      this.cameraShake = Math.min(1.25, this.cameraShake + 0.18)
      this.hitStop = Math.max(this.hitStop, 0.016)
    }

    const impactLength = Math.hypot(impactX, impactY) || 1
    target.velocity.x += (impactX / impactLength) * 2.7
    target.velocity.y += (impactY / impactLength) * 2.7

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

  private flowerPalette(ownerId: string) {
    if (ownerId === this.player.id) {
      return {
        team: "white" as const,
        color: "#f7ffef",
        accent: "#e5efcf",
        fromPlayer: true
      }
    }

    const palette = this.botPalette(ownerId)
    return {
      team: "blue" as const,
      color: palette.tone,
      accent: palette.edge,
      fromPlayer: false
    }
  }

  private spawnFlowers(
    ownerId: string,
    x: number,
    y: number,
    dirX: number,
    dirY: number,
    amount: number
  ) {
    const palette = this.flowerPalette(ownerId)
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
      const distance = randomRange(0.1, 1.9)
      flower.active = true
      flower.team = palette.team
      flower.ownerId = ownerId
      flower.color = palette.color
      flower.accent = palette.accent
      flower.position.set(
        x + Math.cos(angle) * distance + randomRange(-0.06, 0.06),
        y + Math.sin(angle) * distance + randomRange(-0.06, 0.06)
      )
      limitToArena(flower.position, 0.2, this.arenaRadius)
      flower.size = 0
      flower.targetSize = randomRange(0.16, 0.42)
      flower.pop = 0

      if (palette.team === "white") {
        this.whiteFlowers += 1
      } else {
        this.blueFlowers += 1
      }
    }

    if (palette.fromPlayer) {
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

    const renderCameraX = this.camera.x + this.cameraOffset.x
    const renderCameraY = this.camera.y + this.cameraOffset.y

    this.context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
    this.context.scale(WORLD_SCALE, WORLD_SCALE)
    this.context.translate(-renderCameraX, -renderCameraY)
    this.renderMolotovZones()
    this.renderObstacles()
    this.renderFlowers()
    this.renderPickups(dt)
    this.renderThrowables()
    this.renderProjectiles()
    this.renderUnits()
    this.renderExplosions()
    this.renderDamagePopups()
    this.renderArenaBoundary()
    this.context.restore()

    this.renderAtmosphere()
    this.renderMenuCard()
  }

  private renderArenaGround() {
    this.context.save()
    this.context.translate(VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5)
    this.context.scale(WORLD_SCALE, WORLD_SCALE)
    this.context.translate(-this.camera.x, -this.camera.y)

    this.context.fillStyle = "#a3c784"
    this.context.beginPath()
    this.context.arc(0, 0, this.arenaRadius, 0, Math.PI * 2)
    this.context.fill()

    this.context.save()
    this.context.beginPath()
    this.context.arc(0, 0, this.arenaRadius - 0.12, 0, Math.PI * 2)
    this.context.clip()

    const tile = 1
    const halfViewX = VIEW_WIDTH * 0.5 / WORLD_SCALE
    const halfViewY = VIEW_HEIGHT * 0.5 / WORLD_SCALE
    const minX = Math.floor((this.camera.x - halfViewX) / tile) - 2
    const maxX = Math.floor((this.camera.x + halfViewX) / tile) + 2
    const minY = Math.floor((this.camera.y - halfViewY) / tile) - 2
    const maxY = Math.floor((this.camera.y + halfViewY) / tile) + 2

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const worldX = x * tile
        const worldY = y * tile
        if (worldX * worldX + worldY * worldY > this.arenaRadius * this.arenaRadius) {
          continue
        }

        const grain = this.tileNoise(x, y)
        this.context.fillStyle = grain > 0.5 ? "#98bf78" : "#92ba74"
        this.context.fillRect(worldX, worldY, tile, tile)
        this.context.fillStyle = grain > 0.5 ? "#a7cc86" : "#9dc47f"
        this.context.fillRect(worldX + 0.05, worldY + 0.05, tile - 0.18, tile - 0.18)
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
    this.context.lineWidth = 0.45
    this.context.beginPath()
    this.context.arc(0, 0, this.arenaRadius, 0, Math.PI * 2)
    this.context.stroke()

    this.context.strokeStyle = "#84af63"
    this.context.lineWidth = 0.2
    this.context.beginPath()
    this.context.arc(0, 0, this.arenaRadius - 0.5, 0, Math.PI * 2)
    this.context.stroke()
  }

  private renderFlowers() {
    for (const flower of this.flowers) {
      if (!flower.active) {
        continue
      }

      const size = Math.max(0.05, flower.size)
      const petal = size
      const center = size * 0.5
      this.context.fillStyle = flower.color
      this.context.fillRect(flower.position.x - petal, flower.position.y - center, petal * 2, center * 2)
      this.context.fillRect(flower.position.x - center, flower.position.y - petal, center * 2, petal * 2)
      this.context.fillStyle = flower.accent
      this.context.fillRect(flower.position.x - 0.04, flower.position.y - 0.04, 0.08, 0.08)
    }
  }

  private renderPickups(dt: number) {
    for (const pickup of this.pickups) {
      if (!pickup.active) {
        continue
      }

      const bobOffset = Math.sin(pickup.bob + dt * 4) * 0.14
      const weapon = PRIMARY_WEAPONS[pickup.weapon]
      this.context.fillStyle = "#2f4f2a"
      this.context.fillRect(pickup.position.x - 0.62, pickup.position.y - 0.72 + bobOffset, 1.24, 1.24)
      this.context.fillStyle = "#d9e8be"
      this.context.fillRect(pickup.position.x - 0.5, pickup.position.y - 0.6 + bobOffset, 1, 1)
      this.context.fillStyle = "#19331c"
      this.context.font = "0.45px monospace"
      this.context.textAlign = "center"
      this.context.fillText(weapon.icon, pickup.position.x, pickup.position.y + 0.18 + bobOffset)
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

      const alpha = clamp(zone.life / 2.2, 0, 1)
      this.context.fillStyle = `rgba(244, 120, 46, ${0.24 * alpha})`
      this.context.beginPath()
      this.context.arc(zone.position.x, zone.position.y, zone.radius, 0, Math.PI * 2)
      this.context.fill()
      this.context.strokeStyle = `rgba(255, 176, 84, ${0.5 * alpha})`
      this.context.lineWidth = 0.15
      this.context.beginPath()
      this.context.arc(zone.position.x, zone.position.y, Math.max(0.06, zone.radius - 0.2), 0, Math.PI * 2)
      this.context.stroke()
    }
  }

  private renderObstacles() {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) {
        continue
      }

      const halfWidth = obstacle.width * 0.5
      const halfHeight = obstacle.height * 0.5
      if (obstacle.kind === "house") {
        const originX = obstacle.position.x - halfWidth
        const originY = obstacle.position.y - halfHeight
        for (let row = 0; row < obstacle.tiles.length; row += 1) {
          for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
            if (!obstacle.tiles[row][col]) {
              continue
            }

            const tileX = originX + col
            const tileY = originY + row
            this.context.fillStyle = "#6f7f56"
            this.context.fillRect(tileX, tileY, 1, 1)
            this.context.fillStyle = "#d7e5b6"
            this.context.fillRect(tileX + 0.08, tileY + 0.08, 0.84, 0.84)
          }
        }
      } else {
        this.context.fillStyle = "#5f6d49"
        this.context.fillRect(obstacle.position.x - halfWidth, obstacle.position.y - halfHeight, obstacle.width, obstacle.height)
        this.context.fillStyle = "#c3d7a2"
        this.context.fillRect(obstacle.position.x - halfWidth + 0.08, obstacle.position.y - halfHeight + 0.08, obstacle.width - 0.16, obstacle.height - 0.16)
      }

      const ratio = clamp(obstacle.hp / obstacle.maxHp, 0, 1)
      this.context.fillStyle = "rgba(0, 0, 0, 0.4)"
      this.context.fillRect(obstacle.position.x - halfWidth, obstacle.position.y - halfHeight - 0.35, obstacle.width, 0.18)
      this.context.fillStyle = "#f4fddf"
      this.context.fillRect(obstacle.position.x - halfWidth, obstacle.position.y - halfHeight - 0.35, obstacle.width * ratio, 0.18)
    }
  }

  private renderExplosions() {
    for (const explosion of this.explosions) {
      if (!explosion.active) {
        continue
      }

      const alpha = clamp(explosion.life / 0.24, 0, 1)
      const radius = explosion.radius * (1 + (1 - alpha) * 0.45)
      this.context.fillStyle = `rgba(255, 192, 74, ${0.24 * alpha})`
      this.context.beginPath()
      this.context.arc(explosion.position.x, explosion.position.y, radius, 0, Math.PI * 2)
      this.context.fill()

      this.context.fillStyle = `rgba(255, 132, 56, ${0.72 * alpha})`
      for (let i = 0; i < 10; i += 1) {
        const angle = (Math.PI * 2 * i) / 10 + (1 - alpha) * 0.8
        const spike = radius * randomRange(0.16, 1)
        this.context.fillRect(
          explosion.position.x + Math.cos(angle) * spike - 0.08,
          explosion.position.y + Math.sin(angle) * spike - 0.08,
          0.16,
          0.16
        )
      }
    }
  }

  private renderProjectiles() {
    for (const projectile of this.projectiles) {
      if (!projectile.active) {
        continue
      }

      const speed = Math.hypot(projectile.velocity.x, projectile.velocity.y)
      const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x)
      const stretch = clamp(speed / 25, 1.1, 2.6)
      const length = projectile.radius * 2.6 * stretch
      const width = projectile.radius * 1.4
      const glow = projectile.radius * (2.2 + projectile.glow)

      this.context.fillStyle = "rgba(255, 233, 120, 0.2)"
      this.context.beginPath()
      this.context.arc(projectile.position.x, projectile.position.y, glow, 0, Math.PI * 2)
      this.context.fill()

      this.context.save()
      this.context.translate(projectile.position.x, projectile.position.y)
      this.context.rotate(angle)

      this.context.fillStyle = "rgba(255, 181, 72, 0.35)"
      this.context.beginPath()
      this.context.ellipse(-length * 0.2, 0, length * 0.55, width * 0.86, 0, 0, Math.PI * 2)
      this.context.fill()

      this.context.fillStyle = "#ffc248"
      this.context.beginPath()
      this.context.moveTo(-length * 0.52, 0)
      this.context.quadraticCurveTo(-length * 0.2, -width * 0.65, length * 0.45, 0)
      this.context.quadraticCurveTo(-length * 0.2, width * 0.65, -length * 0.52, 0)
      this.context.fill()

      this.context.fillStyle = "#fff2aa"
      this.context.beginPath()
      this.context.ellipse(length * 0.18, 0, width * 0.4, width * 0.3, 0, 0, Math.PI * 2)
      this.context.fill()

      this.context.restore()
    }
  }

  private botPalette(id: string) {
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
  }

  private renderUnits() {
    for (const unit of this.units) {
      const drawX = unit.position.x - unit.aim.x * unit.recoil * 0.32
      const drawY = unit.position.y - unit.aim.y * unit.recoil * 0.32
      const body = unit.radius * 1.2
      const ear = unit.radius * 0.42

      this.context.fillStyle = "rgba(0, 0, 0, 0.2)"
      this.context.beginPath()
      this.context.ellipse(drawX, drawY + body * 1.2, body * 0.72, body * 0.42, 0, 0, Math.PI * 2)
      this.context.fill()

      const palette = unit.isPlayer ? { tone: "#f6f2df", edge: "#b8b49a" } : this.botPalette(unit.id)
      const tone = palette.tone
      const edge = palette.edge
      const earLeftX = drawX - body * 0.7
      const earRightX = drawX + body * 0.7
      const earY = drawY - body * 0.95

      this.context.fillStyle = edge
      this.context.fillRect(earLeftX - ear * 0.5, earY - ear, ear, ear * 1.2)
      this.context.fillRect(earRightX - ear * 0.5, earY - ear, ear, ear * 1.2)
      this.context.fillStyle = tone
      this.context.fillRect(earLeftX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)
      this.context.fillRect(earRightX - ear * 0.25, earY - ear * 0.55, ear * 0.5, ear * 0.55)

      this.context.fillStyle = edge
      this.context.fillRect(drawX - body * 0.85, drawY - body, body * 1.7, body * 2)
      this.context.fillStyle = tone
      this.context.fillRect(drawX - body * 0.68, drawY - body * 0.82, body * 1.36, body * 1.64)

      const gunLength = unit.radius * 1.25 + unit.recoil * 0.24
      const gunX = drawX + unit.aim.x * gunLength
      const gunY = drawY + unit.aim.y * gunLength
      this.context.strokeStyle = unit.isPlayer ? "#f0e6ad" : "#a2d0ff"
      this.context.lineWidth = 0.24
      this.context.beginPath()
      this.context.moveTo(drawX, drawY)
      this.context.lineTo(gunX, gunY)
      this.context.stroke()

      if (unit.hitFlash > 0) {
        const flicker = 0.42 + Math.sin((1 - unit.hitFlash) * 42) * 0.38
        this.context.globalAlpha = clamp(unit.hitFlash * flicker, 0, 1)
        this.context.fillStyle = unit.isPlayer ? "#ff8a8a" : "#ff5454"
        this.context.fillRect(drawX - body * 0.75, drawY - body * 0.85, body * 1.5, body * 1.7)
        this.context.fillRect(earLeftX - body * 0.18, earY - body * 0.25, body * 1.36, body * 0.32)
        this.context.globalAlpha = 1
      }

      const hpRatio = clamp(unit.hp / unit.maxHp, 0, 1)
      this.context.fillStyle = "rgba(0, 0, 0, 0.4)"
      this.context.fillRect(drawX - body, drawY - body * 1.28, body * 2, body * 0.24)
      this.context.fillStyle = unit.isPlayer ? "#e8ffdb" : "#8fc0ff"
      this.context.fillRect(drawX - body, drawY - body * 1.28, body * 2 * hpRatio, body * 0.24)
    }
  }

  private renderDamagePopups() {
    this.context.textAlign = "center"
    this.context.font = "0.9px monospace"
    for (const popup of this.damagePopups) {
      if (!popup.active) {
        continue
      }

      const alpha = clamp(popup.life / 0.62, 0, 1)
      const scale = 1 + (1 - alpha) * 0.14
      this.context.fillStyle = `rgba(0, 0, 0, ${0.5 * alpha})`
      this.context.fillText(popup.text, popup.position.x + 0.05, popup.position.y + 0.05)

      this.context.save()
      this.context.globalAlpha = alpha
      this.context.fillStyle = popup.color
      this.context.translate(popup.position.x, popup.position.y)
      this.context.scale(scale, scale)
      this.context.fillText(popup.text, 0, 0)
      this.context.restore()
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
    const startHint = this.audioPrimed
      ? "Click or press Enter to start 50m shrinking arena"
      : "Click once to unlock music, then deploy"
    this.context.fillText(startHint, VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 16)
    if (this.finished) {
      this.context.fillText("Match over. Click for rematch", VIEW_WIDTH * 0.5, VIEW_HEIGHT * 0.5 + 38)
    }
  }
}
