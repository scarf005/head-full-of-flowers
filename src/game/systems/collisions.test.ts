/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import { Projectile, Unit } from "../entities.ts"
import { spawnObstacleDebris, updateObstacleDebris } from "../game-fx.ts"
import { damageObstaclesByExplosion, hitObstacle, resolveUnitCollisions } from "./collisions.ts"
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
  props: [],
})

const createSingleHedgeMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "hedge", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [[true]] }],
  pickupSpawnPoints: [],
  props: [],
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
  props: [],
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

Deno.test("passable flowerbeds take bullets and emit destruction effects across their footprint", () => {
  const world = createWorldState()
  world.terrainMap = {
    size: 8,
    tiles: createTiles(8),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [{ kind: "flowerbed", x: 0, y: 0.5, width: 2, height: 1, solid: false }],
  }
  world.obstacleGrid = buildObstacleGridFromMap(world.terrainMap)
  const grid = world.obstacleGrid
  const cells = [35, 36]
  assertEquals(cells.map((cell) => grid.solid[cell]), [0, 0])
  const unit = new Unit("walker", true, "player")
  unit.position.set(0, 0.5)
  unit.radius = 0.3
  world.units = [unit]
  resolveUnitCollisions(world)
  assertEquals([unit.position.x, unit.position.y], [0, 0.5])
  const projectile = createProjectileAtWall(1, "ballistic")
  const effects: number[][] = []
  const deps = { onObstacleDestroyed: (x: number, y: number) => effects.push([x, y]) }
  assertEquals(hitObstacle(world, projectile, deps), true)
  assertEquals(cells.map((cell) => grid.hp[cell]), [2, 2])
  assertEquals(effects, [])
  assertEquals(cells.map((cell) => grid.solid[cell]), [0, 0])
  projectile.damage = 2
  assertEquals(hitObstacle(world, projectile, deps), true)
  assertEquals(effects, [[-0.5, 0.5], [0.5, 0.5]])
  assertEquals(cells.map((cell) => grid.hp[cell]), [0, 0])
  assertEquals(hitObstacle(world, projectile, deps), false)
  assertEquals(effects.length, 2)
})

Deno.test("explosions damage shared prop health once and emit each destroyed cell only once", () => {
  const world = createWorldState()
  world.terrainMap = {
    size: 8,
    tiles: createTiles(8),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [{ kind: "rug", x: 0, y: 0, width: 2, height: 2, solid: false }],
  }
  world.obstacleGrid = buildObstacleGridFromMap(world.terrainMap)
  const cells = [27, 28, 35, 36]
  for (const cell of cells) world.obstacleGrid.hp[cell] = 20
  const effects: number[][] = []
  let hits = 0
  const deps = {
    onObstacleDamaged: () => hits += 1,
    onObstacleDestroyed: (x: number, y: number) => effects.push([x, y]),
  }
  damageObstaclesByExplosion(world, 0, 0, 2, deps)
  assertEquals(hits, 1)
  assertEquals(effects.length, 0)
  for (const cell of cells) world.obstacleGrid.hp[cell] = 3
  damageObstaclesByExplosion(world, 0, 0, 2, deps)
  assertEquals(effects.length, 4)
  assertEquals(new Set(effects.map(([x, y]) => `${x},${y}`)).size, 4)
  assertEquals(cells.map((cell) => world.obstacleGrid.solid[cell]), [0, 0, 0, 0])
})

Deno.test("destroyed garden props use moving, fading debris from the wall effect pipeline", () => {
  const world = createWorldState()
  world.terrainMap = {
    size: 8,
    tiles: createTiles(8),
    obstacles: [],
    pickupSpawnPoints: [],
    props: [{ kind: "flowerbed", x: 0, y: 0.5, width: 2, height: 1, solid: false }],
  }
  world.obstacleGrid = buildObstacleGridFromMap(world.terrainMap)
  let cursor = 0
  hitObstacle(world, createProjectileAtWall(3), {
    onObstacleDestroyed: (x, y, material) => {
      cursor = spawnObstacleDebris(world, cursor, x, y, material)
    },
  })
  assertEquals(world.activeObstacleDebrisIndices.size, 16)
  const piece = world.obstacleDebris[0]
  const before = { x: piece.position.x, y: piece.position.y, life: piece.life }
  updateObstacleDebris(world, 0.05)
  assertEquals(piece.position.x !== before.x || piece.position.y !== before.y, true)
  assertEquals(piece.life < before.life, true)
  assertEquals(["#9b8568", "#828057", "#d0c09b"].includes(piece.color), true)
  updateObstacleDebris(world, 1)
  assertEquals(world.activeObstacleDebrisIndices.size, 0)
})
