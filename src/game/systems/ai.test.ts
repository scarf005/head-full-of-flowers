/// <reference lib="deno.ns" />

import { assert, assertEquals } from "jsr:@std/assert"

import { updateAI } from "./ai.ts"
import { createWorldState } from "../world/state.ts"
import {
  OBSTACLE_MATERIAL_BOX,
  OBSTACLE_MATERIAL_WAREHOUSE,
  obstacleGridIndex,
  worldToObstacleGrid,
} from "../world/obstacle-grid.ts"

Deno.test("updateAI calls nowMs once per frame update", () => {
  const world = createWorldState()
  const firstBot = world.bots[0]
  const secondBot = world.bots[1]

  firstBot.position.set(-4, 0)
  secondBot.position.set(4, 0)
  world.player.position.set(0, 8)

  world.bots = [firstBot, secondBot]
  world.units = [world.player, ...world.bots]

  let nowMsCallCount = 0
  updateAI(world, 1 / 60, {
    firePrimary: () => {},
    continueBurst: () => {},
    throwSecondary: () => {},
    finishReload: () => {},
    collectNearbyPickup: () => {},
    nowMs: () => {
      nowMsCallCount += 1
      return 1200
    },
  })

  assertEquals(nowMsCallCount, 1)
})

Deno.test("updateAI enters aggro and can fire when aligned", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  world.obstacleGrid.solid.fill(0)
  world.obstacleGrid.material.fill(0)
  world.obstacleGrid.hp.fill(0)
  bot.position.set(0, 0)
  bot.aim.set(1, 0)
  bot.aiDecisionTimer = 0.8
  world.player.position.set(10, 0)

  world.bots = [bot]
  world.units = [world.player, bot]

  const firedBy: string[] = []
  const originalRandom = Math.random
  Math.random = () => 0.999

  try {
    updateAI(world, 1 / 60, {
      firePrimary: (botId) => firedBy.push(botId),
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 0,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(bot.aiState, "aggro")
  assert(firedBy.includes(bot.id))
})

Deno.test("updateAI enters flee when bot hp is low", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  bot.position.set(0, 0)
  bot.hp = bot.maxHp * 0.2
  bot.aiDecisionTimer = 0.8
  world.player.position.set(8, 0)

  world.bots = [bot]
  world.units = [world.player, bot]

  updateAI(world, 1 / 60, {
    firePrimary: () => {},
    continueBurst: () => {},
    throwSecondary: () => {},
    finishReload: () => {},
    collectNearbyPickup: () => {},
    nowMs: () => 250,
  })

  assertEquals(bot.aiState, "flee")
})

Deno.test("updateAI easy mode uses longer decision timer resets than hard mode", () => {
  const easyWorld = createWorldState()
  const hardWorld = createWorldState()

  const easyBot = easyWorld.bots[0]
  const hardBot = hardWorld.bots[0]

  easyWorld.aiDifficulty = "easy"
  easyBot.aiDecisionTimer = 0
  hardBot.aiDecisionTimer = 0

  easyWorld.bots = [easyBot]
  easyWorld.units = [easyWorld.player, easyBot]
  hardWorld.bots = [hardBot]
  hardWorld.units = [hardWorld.player, hardBot]

  const originalRandom = Math.random
  Math.random = () => 0

  try {
    updateAI(easyWorld, 1 / 60, {
      firePrimary: () => {},
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 100,
    })

    updateAI(hardWorld, 1 / 60, {
      firePrimary: () => {},
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 100,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(easyBot.aiDecisionTimer, 1.4)
  assertEquals(hardBot.aiDecisionTimer, 0.4)
  assert(easyBot.aiDecisionTimer > hardBot.aiDecisionTimer)
})

Deno.test("updateAI easy mode has delayed aggro reaction before firing", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  world.aiDifficulty = "easy"
  bot.position.set(0, 0)
  bot.aim.set(1, 0)
  bot.aiDecisionTimer = 1.6
  world.player.position.set(10, 0)

  world.bots = [bot]
  world.units = [world.player, bot]

  const firedBy: string[] = []
  const originalRandom = Math.random
  Math.random = () => 0.999

  try {
    updateAI(world, 1 / 60, {
      firePrimary: (botId) => firedBy.push(botId),
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 0,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(bot.aiState, "aggro")
  assertEquals(firedBy.length, 0)
})

Deno.test("updateAI hard mode stops firing and retreats when warehouse wall blocks pistol", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  world.aiDifficulty = "hard"
  world.obstacleGrid.solid.fill(0)
  world.obstacleGrid.material.fill(0)
  world.obstacleGrid.hp.fill(0)
  bot.position.set(world.arenaRadius - bot.radius - 0.1, 0)
  bot.velocity.set(0, 0)
  bot.aim.set(1, 0)
  bot.aiDecisionTimer = 0.8
  world.player.position.set(bot.position.x + 4, 0)

  const blocker = worldToObstacleGrid(world.obstacleGrid.size, bot.position.x + 2, 0)
  const blockerIndex = obstacleGridIndex(world.obstacleGrid.size, blocker.x, blocker.y)
  world.obstacleGrid.solid[blockerIndex] = 1
  world.obstacleGrid.material[blockerIndex] = OBSTACLE_MATERIAL_WAREHOUSE
  world.obstacleGrid.hp[blockerIndex] = 4

  world.bots = [bot]
  world.units = [world.player, bot]

  const firedBy: string[] = []
  const originalRandom = Math.random
  Math.random = () => 0.999

  try {
    updateAI(world, 1 / 60, {
      firePrimary: (botId) => firedBy.push(botId),
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 0,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(firedBy.length, 0)
  assert(bot.velocity.x < 0)
})

Deno.test("updateAI hard mode still fires through destructible obstacle", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  world.aiDifficulty = "hard"
  world.obstacleGrid.solid.fill(0)
  world.obstacleGrid.material.fill(0)
  world.obstacleGrid.hp.fill(0)
  bot.position.set(0, 0)
  bot.velocity.set(0, 0)
  bot.aim.set(1, 0)
  bot.aiDecisionTimer = 0.8
  world.player.position.set(10, 0)

  const blocker = worldToObstacleGrid(world.obstacleGrid.size, 5, 0)
  const blockerIndex = obstacleGridIndex(world.obstacleGrid.size, blocker.x, blocker.y)
  world.obstacleGrid.solid[blockerIndex] = 1
  world.obstacleGrid.material[blockerIndex] = OBSTACLE_MATERIAL_BOX
  world.obstacleGrid.hp[blockerIndex] = 8

  world.bots = [bot]
  world.units = [world.player, bot]

  const firedBy: string[] = []
  const originalRandom = Math.random
  Math.random = () => 0.999

  try {
    updateAI(world, 1 / 60, {
      firePrimary: (botId) => firedBy.push(botId),
      continueBurst: () => {},
      throwSecondary: () => {},
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 0,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(firedBy.includes(bot.id), true)
})

Deno.test("updateAI hard mode throws grenade when trapped against indestructible cover", () => {
  const world = createWorldState()
  const bot = world.bots[0]

  world.aiDifficulty = "hard"
  world.obstacleGrid.solid.fill(0)
  world.obstacleGrid.material.fill(0)
  world.obstacleGrid.hp.fill(0)

  bot.position.set(world.arenaRadius - bot.radius - 0.06, 0)
  bot.velocity.set(0, 0)
  bot.aim.set(1, 0)
  bot.aiDecisionTimer = 0.8
  bot.secondaryMode = "grenade"
  bot.secondaryCooldown = 0
  world.player.position.set(bot.position.x + 3, 0)

  const placeSolid = (x: number, y: number, material = OBSTACLE_MATERIAL_WAREHOUSE) => {
    const cell = worldToObstacleGrid(world.obstacleGrid.size, x, y)
    const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
    world.obstacleGrid.solid[index] = 1
    world.obstacleGrid.material[index] = material
    world.obstacleGrid.hp[index] = 4
  }

  placeSolid(bot.position.x + 0.8, 0)
  placeSolid(bot.position.x - 0.8, 0)
  placeSolid(bot.position.x - 0.8, 0.8)
  placeSolid(bot.position.x - 0.8, -0.8)
  placeSolid(bot.position.x, 0.8)
  placeSolid(bot.position.x, -0.8)

  world.bots = [bot]
  world.units = [world.player, bot]

  let throwCount = 0
  const originalRandom = Math.random
  Math.random = () => 0.999

  try {
    updateAI(world, 1 / 60, {
      firePrimary: () => {},
      continueBurst: () => {},
      throwSecondary: () => {
        throwCount += 1
      },
      finishReload: () => {},
      collectNearbyPickup: () => {},
      nowMs: () => 0,
    })
  } finally {
    Math.random = originalRandom
  }

  assertEquals(throwCount > 0, true)
})
