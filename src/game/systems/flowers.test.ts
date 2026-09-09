/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { flowerPetalCount, spawnFlowers, updateFlowers } from "./flowers.ts"
import { createWorldState } from "../world/state.ts"

Deno.test("spawnFlowers updates coverage and dirty queue for player-owned flowers", () => {
  const world = createWorldState()
  let flowerCursor = 0
  let coverageUpdates = 0
  const playerScoreId = world.player.id
  const beforeScore = world.factionFlowerCounts[playerScoreId]

  spawnFlowers(
    world,
    world.player.id,
    playerScoreId,
    0,
    0,
    1,
    0,
    3,
    1,
    {
      allocFlower: () => {
        const flower = world.flowers[flowerCursor]
        flowerCursor = (flowerCursor + 1) % world.flowers.length
        return flower
      },
      playerId: world.player.id,
      botPalette: () => ({ tone: "#7ba7ff", edge: "#3f5ca9" }),
      factionColor: () => null,
      onCoverageUpdated: () => {
        coverageUpdates += 1
      },
    },
  )

  const spawnedPetals = world.flowers.slice(0, 3).reduce((sum, flower) => sum + flower.petalCount, 0)
  assertEquals(world.factionFlowerCounts[playerScoreId], beforeScore + spawnedPetals)
  assertEquals(world.flowerBloomingIndices.size, 3)
  assertEquals(world.playerFlowerTotal, 3)
  assertEquals(world.flowerDirtyIndices.size, 3)
  assertEquals(world.flowerDirtyCount, 3)
  assertEquals(world.flowers[0].sourceOwnerId, world.player.id)
  assertEquals(coverageUpdates, 1)
})

Deno.test("spawnFlowers does not increment playerFlowerTotal for non-player owner", () => {
  const world = createWorldState()
  let flowerCursor = 0
  const owner = world.bots[0]
  const ownerScoreId = owner.id
  const beforePlayerTotal = world.playerFlowerTotal
  const beforeScore = world.factionFlowerCounts[ownerScoreId]

  spawnFlowers(
    world,
    owner.id,
    ownerScoreId,
    0,
    0,
    1,
    0,
    2,
    1,
    {
      allocFlower: () => {
        const flower = world.flowers[flowerCursor]
        flowerCursor = (flowerCursor + 1) % world.flowers.length
        return flower
      },
      playerId: world.player.id,
      botPalette: () => ({ tone: "#7ba7ff", edge: "#3f5ca9" }),
      factionColor: () => "#4a7dbd",
      onCoverageUpdated: () => {},
    },
  )

  assertEquals(world.playerFlowerTotal, beforePlayerTotal)
  const spawnedPetals = world.flowers.slice(0, 2).reduce((sum, flower) => sum + flower.petalCount, 0)
  assertEquals(world.factionFlowerCounts[ownerScoreId], beforeScore + spawnedPetals)
})

Deno.test("flowerPetalCount awards petals in proportion to flower size", () => {
  assertEquals(flowerPetalCount(0.08), 1)
  assertEquals(flowerPetalCount(0.16), 1)
  assertEquals(flowerPetalCount(0.32), 2)
  assertEquals(flowerPetalCount(0.8), 5)
})

Deno.test("spawnFlowers transfers every petal when reusing a flower slot", () => {
  const world = createWorldState()
  const flower = world.flowers[0]
  const deps = {
    allocFlower: () => flower,
    playerId: world.player.id,
    botPalette: () => ({ tone: "#7ba7ff", edge: "#3f5ca9" }),
    factionColor: () => null,
    onCoverageUpdated: () => {},
  }

  spawnFlowers(world, world.player.id, world.player.id, 0, 0, 1, 0, 1, 1.9, deps)
  const largePetalCount = flower.petalCount
  assertEquals(world.factionFlowerCounts[world.player.id], flower.petalCount)

  const botId = world.bots[0].id
  spawnFlowers(world, botId, botId, 0, 0, 1, 0, 1, 0.6, deps)

  assertEquals(world.factionFlowerCounts[world.player.id], 0)
  assertEquals(world.factionFlowerCounts[botId], flower.petalCount)
  assertEquals(largePetalCount > flower.petalCount, true)
})

Deno.test("updateFlowers only tracks blooming flowers until they finish", () => {
  const world = createWorldState()
  let flowerCursor = 0

  spawnFlowers(
    world,
    world.player.id,
    world.player.id,
    0,
    0,
    1,
    0,
    2,
    1,
    {
      allocFlower: () => {
        const flower = world.flowers[flowerCursor]
        flowerCursor = (flowerCursor + 1) % world.flowers.length
        return flower
      },
      playerId: world.player.id,
      botPalette: () => ({ tone: "#7ba7ff", edge: "#3f5ca9" }),
      factionColor: () => null,
      onCoverageUpdated: () => {},
    },
  )

  assertEquals(world.flowerBloomingIndices.size, 2)
  updateFlowers(world, 1)
  assertEquals(world.flowerBloomingIndices.size, 0)
  assertEquals(world.flowers[0].size, world.flowers[0].targetSize)
  assertEquals(world.flowers[1].size, world.flowers[1].targetSize)
})

Deno.test("spawnFlowers keeps source owner distinct from score owner", () => {
  const world = createWorldState()
  let flowerCursor = 0
  const scoreOwnerId = world.bots[0].id

  spawnFlowers(
    world,
    world.player.id,
    scoreOwnerId,
    0,
    0,
    1,
    0,
    1,
    1,
    {
      allocFlower: () => {
        const flower = world.flowers[flowerCursor]
        flowerCursor = (flowerCursor + 1) % world.flowers.length
        return flower
      },
      playerId: world.player.id,
      botPalette: () => ({ tone: "#7ba7ff", edge: "#3f5ca9" }),
      factionColor: () => "#4a7dbd",
      onCoverageUpdated: () => {},
    },
  )

  assertEquals(world.flowers[0].ownerId, scoreOwnerId)
  assertEquals(world.flowers[0].sourceOwnerId, world.player.id)
})
