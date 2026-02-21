import type { Unit } from "../entities.ts"
import type { SecondaryMode } from "../types.ts"
import { BOT_BASE_SPEED, BOT_RADIUS, PLAYER_BASE_SPEED, PLAYER_RADIUS, UNIT_BASE_HP } from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

const resetUnitCombatState = (unit: Unit, radius: number, speed: number) => {
  unit.maxHp = UNIT_BASE_HP
  unit.hp = UNIT_BASE_HP
  unit.radius = radius
  unit.damageMultiplier = 1
  unit.fireRateMultiplier = 1
  unit.bulletSizeMultiplier = 1
  unit.speed = speed
  unit.grenadeTimer = 1
  unit.reloadSpeedMultiplier = 1
  unit.nextReloadTimeMultiplier = 1
  unit.damageTakenMultiplier = 1
  unit.damageReductionFlat = 0
  unit.explosiveRadiusMultiplier = 1
  unit.projectileRangeMultiplier = 1
  unit.projectileDamageBonus = 0
  unit.projectileProximityBonus = 0
  unit.aimAssistRadians = 0
  unit.shotgunRicochet = false
  unit.proximityGrenades = false
  unit.laserSight = false
  unit.perkStacks = {}
  unit.matchKills = 0
  unit.primarySlots.length = 0
  unit.primarySlotIndex = 0
  unit.primarySlotSequence = 0
}

export const randomBotSecondaryMode = (): SecondaryMode => Math.random() > 0.58 ? "molotov" : "grenade"

export const resetPlayerForMatch = (player: Unit) => {
  resetUnitCombatState(player, PLAYER_RADIUS, PLAYER_BASE_SPEED)
}

export const resetBotForMatch = (bot: Unit, pickSecondaryMode: () => SecondaryMode) => {
  resetUnitCombatState(bot, BOT_RADIUS, BOT_BASE_SPEED)
  bot.secondaryMode = pickSecondaryMode()
}

export const resetTransientEntitiesForMatch = (world: WorldState) => {
  for (const projectile of world.projectiles) {
    projectile.active = false
    projectile.trailCooldown = 0
    projectile.trailDirX = 1
    projectile.trailDirY = 0
    projectile.trailReady = false
    projectile.ballisticRicochetRemaining = 0
    projectile.contactFuse = false
    projectile.explosiveRadiusMultiplier = 1
    projectile.proximityRadiusBonus = 0
    projectile.acceleration = 0
  }

  for (const throwable of world.throwables) {
    throwable.active = false
    throwable.trailCooldown = 0
    throwable.trailDirX = 1
    throwable.trailDirY = 0
    throwable.trailReady = false
    throwable.contactFuse = false
    throwable.explosiveRadiusMultiplier = 1
  }

  for (let flowerIndex = 0; flowerIndex < world.flowers.length; flowerIndex += 1) {
    const flower = world.flowers[flowerIndex]
    flower.slotIndex = flowerIndex
    flower.active = false
    flower.renderDirty = false
    flower.team = "white"
    flower.ownerId = ""
    flower.sourceOwnerId = ""
    flower.bloomCell = -1
    flower.bloomWeight = 1
    flower.prevInCell = -1
    flower.nextInCell = -1
    flower.bloomDelay = 0
    flower.pop = 0
    flower.size = 0
    flower.targetSize = 0
  }

  for (const popup of world.damagePopups) popup.active = false

  for (const pickup of world.pickups) {
    pickup.active = false
    pickup.highTier = false
    pickup.spawnOrder = 0
    pickup.velocity.set(0, 0)
    pickup.throwOwnerId = ""
    pickup.throwOwnerTeam = "white"
    pickup.throwDamageArmed = false
    pickup.kind = "weapon"
    pickup.perkId = null
  }

  for (const zone of world.molotovZones) zone.active = false

  for (const obstacle of world.obstacles) {
    obstacle.active = false
    obstacle.lootDropped = false
  }

  for (const debris of world.obstacleDebris) debris.active = false
  for (const ragdoll of world.ragdolls) ragdoll.active = false
  for (const petal of world.killPetals) petal.active = false
  for (const casing of world.shellCasings) casing.active = false
  for (const trail of world.flightTrails) trail.active = false
  for (const explosion of world.explosions) explosion.active = false

  world.flightTrailCursor = 0
}

export const resetCameraForMatchStart = (
  world: Pick<WorldState, "cameraShake" | "cameraOffset" | "cameraKick" | "hitStop">,
) => {
  world.cameraShake = 0
  world.cameraOffset.set(0, 0)
  world.cameraKick.set(0, 0)
  world.hitStop = 0
}
