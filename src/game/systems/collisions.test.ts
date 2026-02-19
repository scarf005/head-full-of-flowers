/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { Projectile } from "../entities.ts"
import { damageObstaclesByExplosion, hitObstacle } from "./collisions.ts"
import {
  buildObstacleGridFromMap,
  OBSTACLE_FLASH_BLOCKED,
  OBSTACLE_FLASH_DAMAGED,
  obstacleGridIndex,
  worldToObstacleGrid,
} from "../world/obstacle-grid.ts"
import type { TerrainMap, TerrainTile } from "../world/terrain-map.ts"
import { createWorldState } from "../world/state.ts"

const createTiles = (size: number) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => "grass" as TerrainTile))

const createSingleWallMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "wall", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [] }],
  pickupSpawnPoints: [],
})

const createSingleHedgeMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "hedge", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [[true]] }],
  pickupSpawnPoints: [],
})

const createProjectileAtWall = (damage: number, kind: Projectile["kind"] = "ballistic") => {
  const projectile = new Projectile()
  projectile.active = true
  projectile.kind = kind
  projectile.position.set(0.5, 0.5)
  projectile.velocity.set(12, 0)
  projectile.damage = damage
  return projectile
}

const createSingleWarehouseMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "warehouse", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [[true]] }],
  pickupSpawnPoints: [],
})

Deno.test("hitObstacle uses blocked flash and does not emit damage callback on fully blocked hit", () => {
  const world = createWorldState()
  world.obstacleGrid = buildObstacleGridFromMap(createSingleWallMap())
  const projectile = createProjectileAtWall(2)

  let hitSfxCalls = 0
  let damageCallbackCalls = 0

  const hit = hitObstacle(world, projectile, {
    onSfxHit: () => {
      hitSfxCalls += 1
    },
    onObstacleDamaged: () => {
      damageCallbackCalls += 1
    },
  })

  const cell = worldToObstacleGrid(world.obstacleGrid.size, 0.5, 0.5)
  const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
  assertEquals(hit, true)
  assertEquals(hitSfxCalls, 1)
  assertEquals(damageCallbackCalls, 0)
  assertEquals(world.obstacleGrid.flashKind[index], OBSTACLE_FLASH_BLOCKED)
})

Deno.test("hitObstacle emits damage callback and damaged flash for effective damage", () => {
  const world = createWorldState()
  world.obstacleGrid = buildObstacleGridFromMap(createSingleWallMap())
  const projectile = createProjectileAtWall(4)

  let damageCallbackCalls = 0
  let damageValue = 0

  const hit = hitObstacle(world, projectile, {
    onObstacleDamaged: (_x, _y, _material, damage) => {
      damageCallbackCalls += 1
      damageValue = damage
    },
  })

  const cell = worldToObstacleGrid(world.obstacleGrid.size, 0.5, 0.5)
  const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
  assertEquals(hit, true)
  assertEquals(damageCallbackCalls, 1)
  assertEquals(damageValue, 2)
  assertEquals(world.obstacleGrid.flashKind[index], OBSTACLE_FLASH_DAMAGED)
})

Deno.test("hitObstacle prevents flamethrowers from damaging non-bush walls", () => {
  const world = createWorldState()
  world.obstacleGrid = buildObstacleGridFromMap(createSingleWallMap())

  const cell = worldToObstacleGrid(world.obstacleGrid.size, 0.5, 0.5)
  const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
  const hpBefore = world.obstacleGrid.hp[index]

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const hit = hitObstacle(world, createProjectileAtWall(999, "flame"), {})
    assertEquals(hit, true)
  }

  assertEquals(world.obstacleGrid.hp[index], hpBefore)
  assertEquals(world.obstacleGrid.flashKind[index], OBSTACLE_FLASH_BLOCKED)
})

Deno.test("hitObstacle lets flamethrowers damage garden bushes", () => {
  const world = createWorldState()
  world.obstacleGrid = buildObstacleGridFromMap(createSingleHedgeMap())
  const projectile = createProjectileAtWall(2, "flame")

  const cell = worldToObstacleGrid(world.obstacleGrid.size, 0.5, 0.5)
  const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
  const hpBefore = world.obstacleGrid.hp[index]

  const hit = hitObstacle(world, projectile, {})

  assertEquals(hit, true)
  assertEquals(world.obstacleGrid.hp[index] < hpBefore, true)
  assertEquals(world.obstacleGrid.flashKind[index], OBSTACLE_FLASH_DAMAGED)
})

Deno.test("damageObstaclesByExplosion reaches warehouse cells near blast edge", () => {
  const world = createWorldState()
  world.obstacleGrid = buildObstacleGridFromMap(createSingleWarehouseMap())

  const cell = worldToObstacleGrid(world.obstacleGrid.size, 0.5, 0.5)
  const index = obstacleGridIndex(world.obstacleGrid.size, cell.x, cell.y)
  const hpBefore = world.obstacleGrid.hp[index]

  const damaged = damageObstaclesByExplosion(world, 1.7, 0.5, 0.71, {})

  assertEquals(damaged, true)
  assertEquals(world.obstacleGrid.hp[index] < hpBefore, true)
  assertEquals(world.obstacleGrid.flashKind[index], OBSTACLE_FLASH_DAMAGED)
})
