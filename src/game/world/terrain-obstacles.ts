import {
  createGardenHedgeMazeTiles,
  createThreeRoomHouseLayout,
  createWarehouseVariantTiles,
} from "./terrain-layouts.ts"
import { randomFloat } from "../replay.ts"
import type { MapObstacleBlueprint, PickupSpawnPoint, TerrainTile } from "./terrain-types.ts"
import {
  circleFitsArena,
  gridRectToWorldRect,
  gridToWorld,
  hasConnectedOpenTiles,
  hasNeighbor,
  randomInt,
  rectFitsArena,
  rectsOverlap,
  rectTouchesMask,
} from "./terrain-utils.ts"

const carveBrush = (mask: boolean[][], centerX: number, centerY: number, radius: number) => {
  for (let y = centerY - radius; y <= centerY + radius; y += 1) {
    if (y < 0 || y >= mask.length) {
      continue
    }
    for (let x = centerX - radius; x <= centerX + radius; x += 1) {
      if (x < 0 || x >= mask[y].length) {
        continue
      }
      mask[y][x] = true
    }
  }
}

const connectPoints = ({ mask, from, to }: { mask: boolean[][]; from: [number, number]; to: [number, number] }) => {
  const dx = to[0] - from[0]
  const dy = to[1] - from[1]
  const bend = (randomFloat() - 0.5) * 0.65
  const controlX = (from[0] + to[0]) / 2 - dy * bend
  const controlY = (from[1] + to[1]) / 2 + dx * bend
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 3))
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps
    const inverse = 1 - t
    const x = Math.round(inverse * inverse * from[0] + 2 * inverse * t * controlX + t * t * to[0])
    const y = Math.round(inverse * inverse * from[1] + 2 * inverse * t * controlY + t * t * to[1])
    carveBrush(mask, x, y, 1)
  }
}

const buildRoadNetworkMask = (size: number) => {
  const mask = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const center = Math.floor(size * 0.5)
  const hubCount = randomInt(4, 7)
  const rotation = randomFloat() * Math.PI * 2
  const hubs: [number, number][] = Array.from({ length: hubCount }, (_, index) => {
    const radius = size * (0.27 + randomFloat() * 0.09)
    const angle = rotation + Math.PI * 2 * (index + randomFloat() * 0.3) / hubCount
    return [Math.round(center + Math.cos(angle) * radius), Math.round(center + Math.sin(angle) * radius)]
  })

  // A complete outer loop offers flanking routes; alternating spokes leave large building plots.
  for (let index = 0; index < hubs.length; index += 1) {
    connectPoints({ mask, from: hubs[index], to: hubs[(index + 1) % hubs.length] })
    if (index % 2 === 0) connectPoints({ mask, from: [center, center], to: hubs[index] })
    carveBrush(mask, hubs[index][0], hubs[index][1], randomInt(2, 3))
  }

  return mask
}
export const applyRoadNetwork = (tiles: TerrainTile[][]) => {
  const size = tiles.length
  const roads = buildRoadNetworkMask(size)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (roads[y][x]) {
        tiles[y][x] = tiles[y][x] === "dirt" ? "gravel" : "dirt-road"
        continue
      }

      if (
        hasNeighbor(roads, x, y) &&
        (tiles[y][x] === "grass" || tiles[y][x] === "clover" || tiles[y][x] === "wild-grass") &&
        randomFloat() > 0.42
      ) {
        tiles[y][x] = "road-edge"
      }
    }
  }

  return roads
}
export const createWarehouseBlueprints = (size: number, paths: boolean[][]) => {
  const obstacles: MapObstacleBlueprint[] = []
  const warehouseCount = randomInt(6, 10)

  for (let attempt = 0; attempt < 700 && obstacles.length < warehouseCount; attempt += 1) {
    const width = randomInt(4, 8)
    const height = randomInt(3, 6)
    const left = randomInt(3, size - width - 4)
    const top = randomInt(3, size - height - 4)
    if (!rectFitsArena(left, top, width, height, size, 2.8)) {
      continue
    }

    if (rectTouchesMask(paths, left, top, width, height, 0)) {
      continue
    }
    if (!rectTouchesMask(paths, left, top, width, height, 2)) {
      continue
    }

    const worldRect = gridRectToWorldRect(left, top, width, height, size)

    const blocked = obstacles.some((existing) => rectsOverlap(worldRect, existing, 2.2))
    if (blocked) {
      continue
    }

    const tiles = createWarehouseVariantTiles(width, height)

    obstacles.push({
      kind: "warehouse",
      x: worldRect.x,
      y: worldRect.y,
      width,
      height,
      tiles,
    })
  }

  return obstacles
}
export const createHighTierLootBoxBlueprints = (size: number, warehouses: MapObstacleBlueprint[]) => {
  const boxes: MapObstacleBlueprint[] = []

  for (const warehouse of warehouses) {
    const left = Math.floor(warehouse.x - warehouse.width * 0.5 + size * 0.5)
    const top = Math.floor(warehouse.y - warehouse.height * 0.5 + size * 0.5)
    const candidates: [number, number][] = []

    for (let row = 1; row < warehouse.tiles.length - 1; row += 1) {
      for (let col = 1; col < warehouse.tiles[row].length - 1; col += 1) {
        if (warehouse.tiles[row][col]) {
          continue
        }

        const gridX = left + col
        const gridY = top + row
        if (!circleFitsArena(gridX, gridY, size, 2.4)) {
          continue
        }

        candidates.push([gridX, gridY])
      }
    }

    if (candidates.length === 0) {
      continue
    }

    const [gridX, gridY] = candidates[randomInt(0, candidates.length - 1)]
    boxes.push({
      kind: "high-tier-box",
      x: gridToWorld(gridX, size),
      y: gridToWorld(gridY, size),
      width: 1,
      height: 1,
      tiles: [],
    })
  }

  return boxes
}
export const createHouseBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
  const houses: MapObstacleBlueprint[] = []
  const houseCount = randomInt(3, 5)

  for (let attempt = 0; attempt < 1200 && houses.length < houseCount; attempt += 1) {
    const width = randomInt(9, 12)
    const height = randomInt(7, 10)
    const left = randomInt(3, size - width - 4)
    const top = randomInt(3, size - height - 4)

    if (!rectFitsArena(left, top, width, height, size, 2.8)) {
      continue
    }
    if (rectTouchesMask(paths, left, top, width, height, 0)) {
      continue
    }
    if (!rectTouchesMask(paths, left, top, width, height, 2)) {
      continue
    }

    const worldRect = gridRectToWorldRect(left, top, width, height, size)
    const blockedByStructures = blocked.some((structure) => rectsOverlap(worldRect, structure, 2.2)) ||
      houses.some((existing) => rectsOverlap(worldRect, existing, 2.2))
    if (blockedByStructures) {
      continue
    }

    const { tiles, rooms } = createThreeRoomHouseLayout(width, height)
    houses.push({
      kind: "house",
      x: worldRect.x,
      y: worldRect.y,
      width,
      height,
      tiles,
      rooms,
    })
  }

  return houses
}
export const createHouseLootBoxBlueprints = (size: number, houses: MapObstacleBlueprint[]) => {
  const boxes: MapObstacleBlueprint[] = []

  const shuffleCandidates = (values: [number, number][]) => {
    for (let index = values.length - 1; index > 0; index -= 1) {
      const swapIndex = randomInt(0, index)
      const temp = values[index]
      values[index] = values[swapIndex]
      values[swapIndex] = temp
    }
  }

  for (const house of houses) {
    const left = Math.floor(house.x - house.width * 0.5 + size * 0.5)
    const top = Math.floor(house.y - house.height * 0.5 + size * 0.5)
    const candidates: [number, number][] = []

    for (let row = 1; row < house.tiles.length - 1; row += 1) {
      for (let col = 1; col < house.tiles[row].length - 1; col += 1) {
        if (house.tiles[row][col]) {
          continue
        }

        const gridX = left + col
        const gridY = top + row
        if (!circleFitsArena(gridX, gridY, size, 2.4)) {
          continue
        }

        candidates.push([gridX, gridY])
      }
    }

    if (candidates.length === 0) {
      continue
    }

    shuffleCandidates(candidates)
    const spawnCount = Math.min(candidates.length, 1 + (randomFloat() > 0.58 ? 1 : 0))

    const blocked = house.tiles.map((row) => [...row])
    let spawned = 0
    for (const [gridX, gridY] of candidates) {
      if (spawned >= spawnCount) break
      const row = gridY - top
      const col = gridX - left
      blocked[row][col] = true
      if (!hasConnectedOpenTiles(blocked)) {
        blocked[row][col] = false
        continue
      }
      spawned += 1
      const whiteLootChance = 0.78
      const kind: MapObstacleBlueprint["kind"] = randomFloat() < whiteLootChance ? "high-tier-box" : "box"
      boxes.push({
        kind,
        x: gridToWorld(gridX, size),
        y: gridToWorld(gridY, size),
        width: 1,
        height: 1,
        tiles: [],
      })
    }
  }

  return boxes
}

export const createHedgeMazeBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
  const mazes: MapObstacleBlueprint[] = []
  const mazeCount = randomInt(2, 4)

  for (let attempt = 0; attempt < 1400 && mazes.length < mazeCount; attempt += 1) {
    const width = randomInt(11, 15)
    const height = randomInt(9, 13)
    const left = randomInt(3, size - width - 4)
    const top = randomInt(3, size - height - 4)

    if (!rectFitsArena(left, top, width, height, size, 2.5)) {
      continue
    }
    if (rectTouchesMask(paths, left, top, width, height, 0)) {
      continue
    }
    if (!rectTouchesMask(paths, left, top, width, height, 3)) {
      continue
    }

    const worldRect = gridRectToWorldRect(left, top, width, height, size)
    const blockedByStructures = blocked.some((structure) => rectsOverlap(worldRect, structure, 1.8)) ||
      mazes.some((existing) => rectsOverlap(worldRect, existing, 1.8))
    if (blockedByStructures) {
      continue
    }

    mazes.push({
      kind: "hedge",
      x: worldRect.x,
      y: worldRect.y,
      width,
      height,
      tiles: createGardenHedgeMazeTiles(width, height),
    })
  }

  return mazes
}

export const createPickupSpawnPoints = (size: number, paths: boolean[][], obstacles: MapObstacleBlueprint[]) => {
  const candidates: PickupSpawnPoint[] = []

  for (let y = 3; y < size - 3; y += 1) {
    for (let x = 3; x < size - 3; x += 1) {
      if (!paths[y][x]) {
        continue
      }
      if (randomFloat() > 0.08) {
        continue
      }

      const point = { x: gridToWorld(x, size), y: gridToWorld(y, size) }
      const blocked = obstacles.some((obstacle) => rectsOverlap({ ...point, width: 0.8, height: 0.8 }, obstacle, 0.45))
      if (!blocked) {
        candidates.push(point)
      }
    }
  }

  const filtered: PickupSpawnPoint[] = []
  for (const candidate of candidates) {
    const tooClose = filtered.some((existing) => {
      const dx = existing.x - candidate.x
      const dy = existing.y - candidate.y
      return dx * dx + dy * dy < 4.2 * 4.2
    })
    if (!tooClose) {
      filtered.push(candidate)
    }
    if (filtered.length >= 12) {
      break
    }
  }

  return filtered
}
