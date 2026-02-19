/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { Vec2 } from "../entities.ts"
import { BOT_RADIUS, PLAYER_RADIUS } from "../world/constants.ts"
import { obstacleGridIndex, worldToObstacleGrid } from "../world/obstacle-grid.ts"
import { createWorldState } from "../world/state.ts"
import { findSafeSpawn, respawnUnit } from "./respawn.ts"

const distanceSquared = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

Deno.test("findSafeSpawn chooses far side from occupied cluster near arena edge", () => {
  const world = createWorldState()
  world.obstacleGrid.solid.fill(0)
  world.player.radius = PLAYER_RADIUS

  const occupied = [
    new Vec2(12, 0),
    new Vec2(13, 1),
    new Vec2(11, -1),
  ]

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    const spawn = findSafeSpawn(world, occupied, world.player.radius)
    assert(spawn.x < -40)
    assert(Math.abs(spawn.y) < 6)
    assert(spawn.length() > world.arenaRadius - 3)
  } finally {
    Math.random = originalRandom
  }
})

Deno.test("findSafeSpawn prefers outer radius when occupied is empty", () => {
  const world = createWorldState()
  world.obstacleGrid.solid.fill(0)
  world.player.radius = PLAYER_RADIUS

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    const spawn = findSafeSpawn(world, [], world.player.radius)
    const expectedRadius = Math.max(1, world.arenaRadius - world.player.radius - 2)
    assert(Math.abs(spawn.length() - expectedRadius) < 0.001)
  } finally {
    Math.random = originalRandom
  }
})

Deno.test("findSafeSpawn skips blocked outer-edge candidate", () => {
  const world = createWorldState()
  world.obstacleGrid.solid.fill(0)
  world.player.radius = PLAYER_RADIUS

  const expectedRadius = Math.max(1, world.arenaRadius - world.player.radius - 2)
  const blockedCell = worldToObstacleGrid(world.obstacleGrid.size, expectedRadius, 0)
  const blockedIndex = obstacleGridIndex(world.obstacleGrid.size, blockedCell.x, blockedCell.y)
  world.obstacleGrid.solid[blockedIndex] = 1

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    const spawn = findSafeSpawn(world, [], world.player.radius)
    assert(Math.abs(spawn.y) > 0.1)
  } finally {
    Math.random = originalRandom
  }
})

Deno.test("respawnUnit places target far from other units near arena edge", () => {
  const world = createWorldState()
  world.obstacleGrid.solid.fill(0)

  const target = world.bots[0]
  const teammate = world.bots[1]

  world.player.radius = PLAYER_RADIUS
  target.radius = BOT_RADIUS
  teammate.radius = BOT_RADIUS

  world.player.position.set(12, 0)
  target.position.set(0, 0)
  teammate.position.set(11, 2)

  world.bots = [target, teammate]
  world.units = [world.player, target, teammate]

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    respawnUnit(world, target.id, {
      equipPrimary: () => {},
      randomLootablePrimary: () => "assault",
    })
  } finally {
    Math.random = originalRandom
  }

  assert(target.position.x < -40)
  assert(target.position.length() > world.arenaRadius - 3)

  const nearestDistanceSquared = Math.min(
    distanceSquared(target.position.x, target.position.y, world.player.position.x, world.player.position.y),
    distanceSquared(target.position.x, target.position.y, teammate.position.x, teammate.position.y),
  )
  assert(nearestDistanceSquared > 2200)
})

Deno.test("respawnUnit clears held fire input for player respawn", () => {
  const world = createWorldState()
  world.obstacleGrid.solid.fill(0)
  world.input.leftDown = true
  world.input.rightDown = true

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    respawnUnit(world, world.player.id, {
      equipPrimary: () => {},
      randomLootablePrimary: () => "assault",
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(world.input.leftDown, false)
  assertEquals(world.input.rightDown, false)
})
