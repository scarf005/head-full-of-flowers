/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { BOT_BASE_SPEED, BOT_RADIUS, PLAYER_BASE_SPEED, PLAYER_RADIUS, UNIT_BASE_HP } from "../world/constants.ts"
import { createWorldState } from "../world/state.ts"
import {
  resetBotForMatch,
  resetCameraForMatchStart,
  resetPlayerForMatch,
  resetTransientEntitiesForMatch,
} from "./match-reset.ts"

Deno.test("resetPlayerForMatch restores baseline player combat stats", () => {
  const world = createWorldState()
  const player = world.player

  player.maxHp = 5
  player.hp = 1
  player.radius = 99
  player.speed = 42
  player.damageMultiplier = 2
  player.matchKills = 10
  player.primarySlots.push({
    weaponId: "assault",
    primaryAmmo: 7,
    reserveAmmo: 11,
    magazineSize: 30,
    acquiredAt: 12,
  })

  resetPlayerForMatch(player)

  assertEquals(player.maxHp, UNIT_BASE_HP)
  assertEquals(player.hp, UNIT_BASE_HP)
  assertEquals(player.radius, PLAYER_RADIUS)
  assertEquals(player.speed, PLAYER_BASE_SPEED)
  assertEquals(player.damageMultiplier, 1)
  assertEquals(player.matchKills, 0)
  assertEquals(player.primarySlots.length, 0)
  assertEquals(player.primarySlotIndex, 0)
  assertEquals(player.primarySlotSequence, 0)
})

Deno.test("resetBotForMatch restores bot baseline and applies injected secondary mode", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  bot.maxHp = 4
  bot.hp = 2
  bot.radius = 77
  bot.speed = 19
  bot.secondaryMode = "grenade"
  bot.perkStacks = { heavy_pellets: 3 }

  resetBotForMatch(bot, () => "molotov")

  assertEquals(bot.maxHp, UNIT_BASE_HP)
  assertEquals(bot.hp, UNIT_BASE_HP)
  assertEquals(bot.radius, BOT_RADIUS)
  assertEquals(bot.speed, BOT_BASE_SPEED)
  assertEquals(bot.secondaryMode, "molotov")
  assertEquals(bot.perkStacks, {})
})

Deno.test("resetTransientEntitiesForMatch and resetCameraForMatchStart clear transient world state", () => {
  const world = createWorldState()

  world.projectiles[0].active = true
  world.projectiles[0].trailCooldown = 3
  world.projectiles[0].trailDirX = 0
  world.projectiles[0].trailDirY = 1
  world.projectiles[0].trailReady = true
  world.projectiles[0].ballisticRicochetRemaining = 5
  world.projectiles[0].contactFuse = true
  world.projectiles[0].explosiveRadiusMultiplier = 2
  world.projectiles[0].proximityRadiusBonus = 3
  world.projectiles[0].acceleration = 4

  world.throwables[0].active = true
  world.throwables[0].trailCooldown = 2
  world.throwables[0].contactFuse = true
  world.throwables[0].explosiveRadiusMultiplier = 3

  world.flowers[0].active = true
  world.flowers[0].team = "red"
  world.flowers[0].ownerId = "bot-1"
  world.flowers[0].sourceOwnerId = "bot-1"

  world.pickups[0].active = true
  world.pickups[0].highTier = true
  world.pickups[0].spawnOrder = 99
  world.pickups[0].velocity.set(3, 4)
  world.pickups[0].throwOwnerId = "bot-1"
  world.pickups[0].throwOwnerTeam = "red"
  world.pickups[0].throwDamageArmed = true
  world.pickups[0].kind = "perk"
  world.pickups[0].perkId = "heavy_pellets"

  world.molotovZones[0].active = true
  world.obstacles[0].active = true
  world.obstacles[0].lootDropped = true
  world.obstacleDebris[0].active = true
  world.ragdolls[0].active = true
  world.killPetals[0].active = true
  world.shellCasings[0].active = true
  world.flightTrails[0].active = true
  world.explosions[0].active = true
  world.flightTrailCursor = 18

  world.cameraShake = 1
  world.cameraOffset.set(2, 3)
  world.cameraKick.set(4, 5)
  world.hitStop = 0.2

  resetTransientEntitiesForMatch(world)
  resetCameraForMatchStart(world)

  assertEquals(world.projectiles[0].active, false)
  assertEquals(world.projectiles[0].trailCooldown, 0)
  assertEquals(world.projectiles[0].trailDirX, 1)
  assertEquals(world.projectiles[0].trailDirY, 0)
  assertEquals(world.projectiles[0].trailReady, false)
  assertEquals(world.projectiles[0].ballisticRicochetRemaining, 0)
  assertEquals(world.projectiles[0].contactFuse, false)
  assertEquals(world.projectiles[0].explosiveRadiusMultiplier, 1)
  assertEquals(world.projectiles[0].proximityRadiusBonus, 0)
  assertEquals(world.projectiles[0].acceleration, 0)

  assertEquals(world.throwables[0].active, false)
  assertEquals(world.throwables[0].trailCooldown, 0)
  assertEquals(world.throwables[0].trailDirX, 1)
  assertEquals(world.throwables[0].trailDirY, 0)
  assertEquals(world.throwables[0].trailReady, false)
  assertEquals(world.throwables[0].contactFuse, false)
  assertEquals(world.throwables[0].explosiveRadiusMultiplier, 1)

  assertEquals(world.flowers[0].active, false)
  assertEquals(world.flowers[0].team, "white")
  assertEquals(world.flowers[0].ownerId, "")
  assertEquals(world.flowers[0].sourceOwnerId, "")

  assertEquals(world.pickups[0].active, false)
  assertEquals(world.pickups[0].highTier, false)
  assertEquals(world.pickups[0].spawnOrder, 0)
  assertEquals(world.pickups[0].velocity.x, 0)
  assertEquals(world.pickups[0].velocity.y, 0)
  assertEquals(world.pickups[0].throwOwnerId, "")
  assertEquals(world.pickups[0].throwOwnerTeam, "white")
  assertEquals(world.pickups[0].throwDamageArmed, false)
  assertEquals(world.pickups[0].kind, "weapon")
  assertEquals(world.pickups[0].perkId, null)

  assertEquals(world.molotovZones[0].active, false)
  assertEquals(world.obstacles[0].active, false)
  assertEquals(world.obstacles[0].lootDropped, false)
  assertEquals(world.obstacleDebris[0].active, false)
  assertEquals(world.ragdolls[0].active, false)
  assertEquals(world.killPetals[0].active, false)
  assertEquals(world.shellCasings[0].active, false)
  assertEquals(world.flightTrails[0].active, false)
  assertEquals(world.explosions[0].active, false)
  assertEquals(world.flightTrailCursor, 0)

  assertEquals(world.cameraShake, 0)
  assertEquals(world.cameraOffset.x, 0)
  assertEquals(world.cameraOffset.y, 0)
  assertEquals(world.cameraKick.x, 0)
  assertEquals(world.cameraKick.y, 0)
  assertEquals(world.hitStop, 0)
})
