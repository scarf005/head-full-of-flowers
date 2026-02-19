/// <reference lib="deno.ns" />

import { assertEquals } from "jsr:@std/assert"

import {
  buildObstacleGridFromMap,
  damageObstacleCell,
  OBSTACLE_FLASH_BLOCKED,
  OBSTACLE_FLASH_DAMAGED,
  OBSTACLE_MATERIAL_HEDGE,
  obstacleGridIndex,
  worldToObstacleGrid,
} from "./obstacle-grid.ts"
import type { TerrainMap, TerrainTile } from "./terrain-map.ts"

const createTiles = (size: number) =>
  Array.from({ length: size }, () => Array.from({ length: size }, () => "grass" as TerrainTile))

const createWallMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "wall", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [] }],
  pickupSpawnPoints: [],
})

const createHedgeMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "hedge", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [[true]] }],
  pickupSpawnPoints: [],
})

const createWarehouseMap = (): TerrainMap => ({
  size: 8,
  tiles: createTiles(8),
  obstacles: [{ kind: "warehouse", x: 0.5, y: 0.5, width: 1, height: 1, tiles: [[true]] }],
  pickupSpawnPoints: [],
})

Deno.test("buildObstacleGridFromMap sets brick wall hp to 3", () => {
  const map = createWallMap()
  const grid = buildObstacleGridFromMap(map)
  const cell = worldToObstacleGrid(map.size, 0.5, 0.5)
  const index = obstacleGridIndex(map.size, cell.x, cell.y)

  assertEquals(grid.hp[index], 3)
})

Deno.test("damageObstacleCell can fully block low wall damage", () => {
  const map = createWallMap()
  const grid = buildObstacleGridFromMap(map)
  const cell = worldToObstacleGrid(map.size, 0.5, 0.5)
  const index = obstacleGridIndex(map.size, cell.x, cell.y)

  damageObstacleCell(grid, cell.x, cell.y, 2)
  assertEquals(grid.hp[index], 3)
  assertEquals(grid.flashKind[index], OBSTACLE_FLASH_BLOCKED)

  damageObstacleCell(grid, cell.x, cell.y, 0.4)
  assertEquals(grid.hp[index], 3)
  assertEquals(grid.flashKind[index], OBSTACLE_FLASH_BLOCKED)

  damageObstacleCell(grid, cell.x, cell.y, 3)
  assertEquals(grid.hp[index], 2)
  assertEquals(grid.flashKind[index], OBSTACLE_FLASH_DAMAGED)

  const result = damageObstacleCell(grid, cell.x, cell.y, 6)
  assertEquals(result.destroyed, true)
  assertEquals(grid.hp[index], 0)
})

Deno.test("damageObstacleCell makes warehouse walls shotgun-proof", () => {
  const map = createWarehouseMap()
  const grid = buildObstacleGridFromMap(map)
  const cell = worldToObstacleGrid(map.size, 0.5, 0.5)
  const index = obstacleGridIndex(map.size, cell.x, cell.y)

  damageObstacleCell(grid, cell.x, cell.y, 2)
  assertEquals(grid.hp[index], 4)
  assertEquals(grid.flashKind[index], OBSTACLE_FLASH_BLOCKED)

  damageObstacleCell(grid, cell.x, cell.y, 3)
  assertEquals(grid.hp[index], 3)
  assertEquals(grid.flashKind[index], OBSTACLE_FLASH_DAMAGED)
})

Deno.test("buildObstacleGridFromMap sets hedge hp to 2", () => {
  const map = createHedgeMap()
  const grid = buildObstacleGridFromMap(map)
  const cell = worldToObstacleGrid(map.size, 0.5, 0.5)
  const index = obstacleGridIndex(map.size, cell.x, cell.y)

  assertEquals(grid.material[index], OBSTACLE_MATERIAL_HEDGE)
  assertEquals(grid.hp[index], 2)
})

Deno.test("damageObstacleCell applies hedge armor and destroys at zero hp", () => {
  const map = createHedgeMap()
  const grid = buildObstacleGridFromMap(map)
  const cell = worldToObstacleGrid(map.size, 0.5, 0.5)
  const index = obstacleGridIndex(map.size, cell.x, cell.y)

  damageObstacleCell(grid, cell.x, cell.y, 2)
  assertEquals(grid.hp[index], 1)

  const result = damageObstacleCell(grid, cell.x, cell.y, 2)
  assertEquals(result.destroyed, true)
  assertEquals(grid.hp[index], 0)
})
