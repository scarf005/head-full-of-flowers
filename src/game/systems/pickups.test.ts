/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { updatePickups } from "./pickups.ts"
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
