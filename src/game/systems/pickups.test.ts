/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { collectNearbyPickup, destroyPickupsByExplosion, spawnPickupAt, updatePickups } from "./pickups.ts"
import { createWorldState } from "../world/state.ts"
import { obstacleGridIndex } from "../world/obstacle-grid.ts"

Deno.test("updatePickups stops moving pickup when obstacle collision occurs", () => {
  const world = createWorldState()
  const pickup = world.pickups[0]

  const half = Math.floor(world.obstacleGrid.size * 0.5)
  const centerIndex = obstacleGridIndex(world.obstacleGrid.size, half, half)
  world.obstacleGrid.solid[centerIndex] = 1

  pickup.active = true
  pickup.position.set(-1, 0)
  pickup.velocity.set(10, 0)
  pickup.radius = 0.8
  pickup.throwDamageArmed = false
  world.pickupTimer = 100

  updatePickups(world, 0.1, {
    randomLootablePrimary: () => "assault",
    applyDamage: () => {},
  })

  assertEquals(pickup.position.x, -1)
  assertEquals(pickup.position.y, 0)
  assertEquals(pickup.velocity.x, 0)
  assertEquals(pickup.velocity.y, 0)
})

Deno.test("updatePickups destroys moving pickup when it touches arena border", () => {
  const world = createWorldState()
  const pickup = world.pickups[0]

  pickup.active = true
  pickup.kind = "perk"
  pickup.perkId = "laser_sight"
  pickup.radius = 0.8
  pickup.position.set(world.arenaRadius - pickup.radius - 0.05, 0)
  pickup.velocity.set(4, 0)
  pickup.throwOwnerId = "unit-a"
  pickup.throwOwnerTeam = "blue"
  pickup.throwDamageArmed = true
  pickup.spawnOrder = 9
  world.pickupTimer = 100

  updatePickups(world, 0.05, {
    randomLootablePrimary: () => "assault",
    applyDamage: () => {},
  })

  assertEquals(pickup.active, false)
  assertEquals(pickup.kind, "weapon")
  assertEquals(pickup.perkId, null)
  assertEquals(pickup.throwOwnerId, "")
  assertEquals(pickup.throwOwnerTeam, "white")
  assertEquals(pickup.throwDamageArmed, false)
  assertEquals(pickup.spawnOrder, 0)
})

Deno.test("updatePickups destroys pickup when shrinking arena reaches it", () => {
  const world = createWorldState()
  const pickup = world.pickups[0]

  pickup.active = true
  pickup.position.set(5, 0)
  pickup.velocity.set(0, 0)
  pickup.radius = 0.8
  pickup.throwOwnerId = "unit-a"
  pickup.throwOwnerTeam = "blue"
  pickup.throwDamageArmed = true
  world.arenaRadius = 5.5
  world.pickupTimer = 100

  updatePickups(world, 0.016, {
    randomLootablePrimary: () => "assault",
    applyDamage: () => {},
  })

  assertEquals(pickup.active, false)
  assertEquals(pickup.throwOwnerId, "")
  assertEquals(pickup.throwOwnerTeam, "white")
  assertEquals(pickup.throwDamageArmed, false)
})

Deno.test("collectNearbyPickup automatically swaps nearby weapon", () => {
  const world = createWorldState()
  const pickup = world.pickups[0]
  pickup.active = true
  pickup.kind = "weapon"
  pickup.weapon = "shotgun"
  pickup.radius = 0.8
  pickup.position.copy(world.player.position)

  let equipCalls = 0
  collectNearbyPickup(world, world.player, {
    equipPrimary: () => {
      equipCalls += 1
      return null
    },
    applyPerk: () => ({ applied: false, stacks: 0 }),
    perkStacks: () => 0,
    onPlayerPickup: () => {},
    onPlayerPerkPickup: () => {},
  })

  assertEquals(equipCalls, 1)
  assertEquals(pickup.active, false)
})

Deno.test("collectNearbyPickup automatically collects nearby perk", () => {
  const world = createWorldState()
  const pickup = world.pickups[0]
  pickup.active = true
  pickup.kind = "perk"
  pickup.perkId = "laser_sight"
  pickup.radius = 0.8
  pickup.position.copy(world.player.position)

  let applyCalls = 0
  collectNearbyPickup(world, world.player, {
    equipPrimary: () => null,
    applyPerk: () => {
      applyCalls += 1
      return { applied: true, stacks: 1 }
    },
    perkStacks: () => 1,
    onPlayerPickup: () => {},
    onPlayerPerkPickup: () => {},
  })

  assertEquals(applyCalls, 1)
  assertEquals(pickup.active, false)
  assertEquals(pickup.kind, "weapon")
  assertEquals(pickup.perkId, null)
})

Deno.test("spawnPickupAt does not grow pickup pool when force spawning into full pool", () => {
  const world = createWorldState()
  const lengthBefore = world.pickups.length

  for (let index = 0; index < world.pickups.length; index += 1) {
    const pickup = world.pickups[index]
    pickup.active = true
    pickup.kind = "perk"
    pickup.perkId = "rapid_reload"
    pickup.weapon = "assault"
    pickup.highTier = false
    pickup.spawnOrder = 100 + index
  }

  const oldestLowTier = world.pickups[4]
  oldestLowTier.kind = "weapon"
  oldestLowTier.perkId = null
  oldestLowTier.highTier = false
  oldestLowTier.spawnOrder = 1

  spawnPickupAt(world, { x: 4, y: -2 }, {
    force: true,
    randomLootablePrimary: () => "shotgun",
  })

  assertEquals(world.pickups.length, lengthBefore)
  assertEquals(oldestLowTier.active, true)
  assertEquals(oldestLowTier.kind, "weapon")
  assertEquals(oldestLowTier.weapon, "shotgun")
  assertEquals(oldestLowTier.position.x, 4)
  assertEquals(oldestLowTier.position.y, -2)
})

Deno.test("spawnPickupAt skips spawn when pool is full and force is false", () => {
  const world = createWorldState()

  for (const pickup of world.pickups) {
    pickup.active = true
    pickup.kind = "weapon"
    pickup.weapon = "assault"
    pickup.perkId = null
    pickup.highTier = false
  }

  spawnPickupAt(world, { x: 2, y: 3 }, {
    randomLootablePrimary: () => "shotgun",
  })

  for (const pickup of world.pickups) {
    assertEquals(pickup.weapon, "assault")
  }
})

Deno.test("destroyPickupsByExplosion destroys both weapon and perk pickups in radius", () => {
  const world = createWorldState()
  const weaponPickup = world.pickups[0]
  const perkPickup = world.pickups[1]
  const untouchedPickup = world.pickups[2]

  weaponPickup.active = true
  weaponPickup.kind = "weapon"
  weaponPickup.weapon = "shotgun"
  weaponPickup.position.set(1, 1)
  weaponPickup.throwOwnerId = "unit-a"
  weaponPickup.throwOwnerTeam = "blue"
  weaponPickup.throwDamageArmed = true
  weaponPickup.spawnOrder = 3

  perkPickup.active = true
  perkPickup.kind = "perk"
  perkPickup.perkId = "laser_sight"
  perkPickup.position.set(1.2, 1.1)
  perkPickup.throwOwnerId = "unit-b"
  perkPickup.throwOwnerTeam = "blue"
  perkPickup.throwDamageArmed = true
  perkPickup.spawnOrder = 7

  untouchedPickup.active = true
  untouchedPickup.kind = "perk"
  untouchedPickup.perkId = "rapid_reload"
  untouchedPickup.position.set(6, 6)

  const destroyed = destroyPickupsByExplosion(world, 1, 1, 1.2)

  assertEquals(destroyed, 2)
  assertEquals(weaponPickup.active, false)
  assertEquals(weaponPickup.kind, "weapon")
  assertEquals(weaponPickup.perkId, null)
  assertEquals(weaponPickup.throwOwnerId, "")
  assertEquals(weaponPickup.throwOwnerTeam, "white")
  assertEquals(weaponPickup.throwDamageArmed, false)
  assertEquals(weaponPickup.spawnOrder, 0)

  assertEquals(perkPickup.active, false)
  assertEquals(perkPickup.kind, "weapon")
  assertEquals(perkPickup.perkId, null)
  assertEquals(perkPickup.throwOwnerId, "")
  assertEquals(perkPickup.throwOwnerTeam, "white")
  assertEquals(perkPickup.throwDamageArmed, false)
  assertEquals(perkPickup.spawnOrder, 0)

  assertEquals(untouchedPickup.active, true)
  assertEquals(untouchedPickup.kind, "perk")
  assertEquals(untouchedPickup.perkId, "rapid_reload")
})
