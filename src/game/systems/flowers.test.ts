/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { spawnFlowers } from "./flowers.ts"
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

  assertEquals(world.factionFlowerCounts[playerScoreId], beforeScore + 3)
  assertEquals(world.playerFlowerTotal, 3)
  assertEquals(world.flowerDirtyIndices.size, 3)
  assertEquals(world.flowerDirtyCount, 3)
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
  assertEquals(world.factionFlowerCounts[ownerScoreId], beforeScore + 2)
})
