import {
  applyRoadNetwork,
  createHedgeMazeBlueprints,
  createHighTierLootBoxBlueprints,
  createHouseBlueprints,
  createHouseLootBoxBlueprints,
  createPickupSpawnPoints,
  createRockBlueprints,
  createWallBlueprints,
  createWarehouseBlueprints,
} from "./terrain-obstacles.ts"
import {
  createGardenHedgeMazeTiles,
  createThreeRoomHouseLayout,
  createWarehouseVariantTiles,
} from "./terrain-layouts.ts"
import type { TerrainMap, TerrainTile } from "./terrain-types.ts"

export type { MapObstacleBlueprint, PickupSpawnPoint, TerrainMap, TerrainTile } from "./terrain-types.ts"
export { createGardenHedgeMazeTiles, createThreeRoomHouseLayout, createWarehouseVariantTiles }
export type { ThreeRoomHouseLayout } from "./terrain-layouts.ts"

const TILE_IDS: TerrainTile[] = [
  "grass",
  "clover",
  "wild-grass",
]

const WEIGHTS: Record<TerrainTile, number> = {
  grass: 36,
  clover: 24,
  "wild-grass": 18,
  dirt: 8,
  "dirt-road": 6,
  "road-edge": 5,
  gravel: 2,
  concrete: 1,
}

const ALLOWED: Record<TerrainTile, TerrainTile[]> = {
  grass: ["grass", "clover", "wild-grass", "dirt", "road-edge", "gravel"],
  clover: ["grass", "clover", "wild-grass", "dirt", "road-edge"],
  "wild-grass": ["grass", "clover", "wild-grass", "dirt", "road-edge", "gravel"],
  dirt: ["grass", "clover", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  "dirt-road": ["dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  "road-edge": ["grass", "clover", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel"],
  gravel: ["grass", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  concrete: ["dirt", "dirt-road", "gravel", "concrete"],
}

const pickWeighted = (choices: TerrainTile[]) => {
  let total = 0
  for (const tile of choices) {
    total += WEIGHTS[tile]
  }

  let roll = Math.random() * total
  for (const tile of choices) {
    roll -= WEIGHTS[tile]
    if (roll <= 0) {
      return tile
    }
  }

  return choices[0] ?? "grass"
}

const neighbors = (x: number, y: number, size: number) => {
  const out: [number, number][] = []
  if (x > 0) out.push([x - 1, y])
  if (x < size - 1) out.push([x + 1, y])
  if (y > 0) out.push([x, y - 1])
  if (y < size - 1) out.push([x, y + 1])
  return out
}

export const createBarrenGardenMap = (size: number) => {
  const wave = Array.from({ length: size }, () => Array.from({ length: size }, () => new Set<TerrainTile>(TILE_IDS)))

  const collapse = (startX: number, startY: number) => {
    const queue: [number, number][] = [[startX, startY]]
    while (queue.length > 0) {
      const next = queue.shift()
      if (!next) {
        continue
      }

      const [x, y] = next
      const self = wave[y][x]
      for (const [nx, ny] of neighbors(x, y, size)) {
        const allowedSet = new Set<TerrainTile>()
        for (const selfTile of self) {
          for (const allowedTile of ALLOWED[selfTile]) {
            allowedSet.add(allowedTile)
          }
        }

        const neighborSet = wave[ny][nx]
        const before = neighborSet.size
        for (const option of [...neighborSet]) {
          if (!allowedSet.has(option)) {
            neighborSet.delete(option)
          }
        }

        if (neighborSet.size === 0) {
          neighborSet.add("grass")
        }

        if (neighborSet.size < before) {
          queue.push([nx, ny])
        }
      }
    }
  }

  for (let iter = 0; iter < size * size; iter += 1) {
    let pickX = -1
    let pickY = -1
    let minEntropy = Number.POSITIVE_INFINITY

    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const entropy = wave[y][x].size
        if (entropy <= 1 || entropy >= minEntropy) {
          continue
        }

        minEntropy = entropy
        pickX = x
        pickY = y
      }
    }

    if (pickX < 0 || pickY < 0) {
      break
    }

    const options = [...wave[pickY][pickX]]
    const chosen = pickWeighted(options)
    wave[pickY][pickX] = new Set([chosen])
    collapse(pickX, pickY)
  }

  const tiles = Array.from(
    { length: size },
    (_, y) => Array.from({ length: size }, (_, x) => [...wave[y][x]][0] ?? "grass"),
  )

  const roads = applyRoadNetwork(tiles)
  const paths = roads
  const warehouseBlueprints = createWarehouseBlueprints(size, paths)
  const highTierLootBoxBlueprints = createHighTierLootBoxBlueprints(size, warehouseBlueprints)
  const houseBlueprints = createHouseBlueprints(size, paths, warehouseBlueprints)
  const houseLootBoxBlueprints = createHouseLootBoxBlueprints(size, houseBlueprints)
  const hedgeMazeBlueprints = createHedgeMazeBlueprints(size, paths, [...warehouseBlueprints, ...houseBlueprints])
  const wallBlueprints = createWallBlueprints(size, paths, [
    ...warehouseBlueprints,
    ...houseBlueprints,
    ...hedgeMazeBlueprints,
  ])
  const rockBlueprints = createRockBlueprints(size, paths, [
    ...warehouseBlueprints,
    ...houseBlueprints,
    ...hedgeMazeBlueprints,
    ...highTierLootBoxBlueprints,
    ...houseLootBoxBlueprints,
    ...wallBlueprints,
  ])
  const structuralObstacles = [
    ...warehouseBlueprints,
    ...houseBlueprints,
    ...hedgeMazeBlueprints,
    ...highTierLootBoxBlueprints,
    ...houseLootBoxBlueprints,
    ...wallBlueprints,
    ...rockBlueprints,
  ]
  const obstacles = structuralObstacles
  const pickupSpawnPoints = createPickupSpawnPoints(size, paths, structuralObstacles)

  return {
    size,
    tiles,
    obstacles,
    pickupSpawnPoints,
  } satisfies TerrainMap
}

export const terrainAt = (map: TerrainMap, worldX: number, worldY: number): TerrainTile => {
  const half = Math.floor(map.size * 0.5)
  const gridX = Math.floor(worldX) + half
  const gridY = Math.floor(worldY) + half
  if (gridX < 0 || gridY < 0 || gridX >= map.size || gridY >= map.size) {
    return "grass"
  }

  return map.tiles[gridY][gridX]
}
