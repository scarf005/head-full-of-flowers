import {
  applyRoadNetwork,
  createHedgeMazeBlueprints,
  createHighTierLootBoxBlueprints,
  createHouseBlueprints,
  createHouseLootBoxBlueprints,
  createPickupSpawnPoints,
  createWarehouseBlueprints,
} from "./terrain-obstacles.ts"
import {
  createGardenHedgeMazeTiles,
  createThreeRoomHouseLayout,
  createWarehouseVariantTiles,
} from "./terrain-layouts.ts"
import { createCourtyards } from "./terrain-courtyards.ts"
import { populateGarden } from "./terrain-props.ts"
import { addWetlands, isWetTerrain } from "./terrain-wetlands.ts"
import { randomFloat } from "../replay.ts"
import type { TerrainMap, TerrainTile } from "./terrain-types.ts"

export type { MapObstacleBlueprint, PickupSpawnPoint, TerrainMap, TerrainTile } from "./terrain-types.ts"
export { createGardenHedgeMazeTiles, createThreeRoomHouseLayout, createWarehouseVariantTiles }
export type { ThreeRoomHouseLayout } from "./terrain-layouts.ts"

// Overlapping, warped patches produce readable regions without straight biome borders.
const createGroundTiles = (size: number): TerrainTile[][] => {
  const palette: TerrainTile[] = ["clover", "wild-grass", "dirt", "grass"]
  const phase = randomFloat() * Math.PI * 2
  const patches = Array.from({ length: 16 }, (_, index) => ({
    x: (index % 4 + randomFloat()) * size / 4,
    y: (Math.floor(index / 4) + randomFloat()) * size / 4,
    radius: size * (0.12 + randomFloat() * 0.12),
    tile: palette[(index + Math.floor(index / 4)) % palette.length],
  }))

  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const warpedX = x + Math.sin(y * 0.19 + phase) * size * 0.025
      const warpedY = y + Math.cos(x * 0.17 + phase) * size * 0.025
      let tile: TerrainTile = "grass"
      let strongest = 0
      for (const patch of patches) {
        const strength = 1 - Math.hypot(warpedX - patch.x, warpedY - patch.y) / patch.radius
        if (strength > strongest) {
          strongest = strength
          tile = patch.tile
        }
      }
      return tile
    }))
}

export const createBarrenGardenMap = (size: number) => {
  const tiles = createGroundTiles(size)

  const roads = applyRoadNetwork(tiles)
  addWetlands({ tiles, roads })
  const courtyards = createCourtyards(tiles)
  const half = Math.floor(size / 2)
  const paths = tiles.map((row, y) =>
    row.map((tile, x) =>
      roads[y][x] || tile === "gravel" || isWetTerrain(tile) ||
      courtyards.plots.some((plot) =>
        Math.abs(x - half + 0.5 - plot.x) <= plot.width / 2 + 1 &&
        Math.abs(y - half + 0.5 - plot.y) <= plot.height / 2 + 1
      )
    )
  )
  const warehouseBlueprints = createWarehouseBlueprints(size, paths)
  const highTierLootBoxBlueprints = createHighTierLootBoxBlueprints(size, warehouseBlueprints)
  const houseBlueprints = createHouseBlueprints(size, paths, warehouseBlueprints)
  const houseLootBoxBlueprints = createHouseLootBoxBlueprints(size, houseBlueprints)
  const hedgeMazeBlueprints = createHedgeMazeBlueprints(size, paths, [...warehouseBlueprints, ...houseBlueprints])
  const obstacles = [
    ...courtyards.obstacles,
    ...warehouseBlueprints,
    ...houseBlueprints,
    ...hedgeMazeBlueprints,
    ...highTierLootBoxBlueprints,
    ...houseLootBoxBlueprints,
  ]
  const pickupSpawnPoints = createPickupSpawnPoints(size, roads, obstacles)

  const map: TerrainMap = {
    size,
    tiles,
    obstacles,
    pickupSpawnPoints,
    props: courtyards.props,
  }
  populateGarden(map, courtyards.plots)
  return map
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
