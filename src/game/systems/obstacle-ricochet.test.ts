/// <reference lib="deno.ns" />

import { assertAlmostEquals } from "jsr:@std/assert"

import { applyObstacleRicochet } from "./obstacle-ricochet.ts"
import { createObstacleGrid, obstacleGridIndex } from "../world/obstacle-grid.ts"

Deno.test("applyObstacleRicochet reflects across the face entered by a diagonal projectile", () => {
  const obstacleGrid = createObstacleGrid(8)
  obstacleGrid.solid[obstacleGridIndex(obstacleGrid.size, 4, 4)] = 1
  const position = { x: 0.25, y: 0.35 }
  const velocity = { x: 10, y: 6 }

  applyObstacleRicochet({
    obstacleGrid,
    previousX: -0.5,
    previousY: -0.1,
    position,
    velocity,
    restitution: 1,
    tangentFriction: 1,
    jitterRadians: 0,
    separation: 0.02,
  })

  assertAlmostEquals(velocity.x, -10, 0.000001)
  assertAlmostEquals(velocity.y, 6, 0.000001)
  assertAlmostEquals(position.x, -0.02, 0.000001)
  assertAlmostEquals(position.y, 0.2, 0.000001)
})
