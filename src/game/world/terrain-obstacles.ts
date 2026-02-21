import {
  createGardenHedgeMazeTiles,
  createThreeRoomHouseTiles,
  createWarehouseVariantTiles,
} from "./terrain-layouts.ts"
import type { MapObstacleBlueprint, PickupSpawnPoint, TerrainTile } from "./terrain-types.ts"
import {
  circleFitsArena,
  gridRectToWorldRect,
  gridToWorld,
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

const connectPoints = (mask: boolean[][], fromX: number, fromY: number, toX: number, toY: number) => {
  let x = fromX
  let y = fromY
  carveBrush(mask, x, y, randomInt(0, 1))

  for (let guard = 0; guard < mask.length * mask.length; guard += 1) {
    if (x === toX && y === toY) {
      break
    }

    const dx = toX - x
    const dy = toY - y
    const preferHorizontal = Math.random() > 0.5
    if (dx !== 0 && (preferHorizontal || dy === 0)) {
      x += Math.sign(dx)
    } else if (dy !== 0) {
      y += Math.sign(dy)
    }

    carveBrush(mask, x, y, Math.random() > 0.88 ? 1 : 0)
  }
}

const buildRoadNetworkMask = (size: number) => {
  const mask = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const center = Math.floor(size * 0.5)
  const hubCount = randomInt(3, 5)
  const hubs: [number, number][] = [[center, center]]

  for (let index = 1; index < hubCount; index += 1) {
    const ring = size * randomInt(18, 40) * 0.01
    const angle = (Math.PI * 2 * index) / hubCount + Math.random() * 0.9
    const x = Math.round(center + Math.cos(angle) * ring)
    const y = Math.round(center + Math.sin(angle) * ring)
    hubs.push([Math.max(4, Math.min(size - 5, x)), Math.max(4, Math.min(size - 5, y))])
  }

  for (let index = 1; index < hubs.length; index += 1) {
    const [fromX, fromY] = hubs[index - 1]
    const [toX, toY] = hubs[index]
    connectPoints(mask, fromX, fromY, toX, toY)
  }

  for (let index = 1; index < hubs.length; index += 1) {
    const [toX, toY] = hubs[index]
    connectPoints(mask, center, center, toX, toY)
  }

  return mask
}
export const applyRoadNetwork = (tiles: TerrainTile[][]) => {
  const size = tiles.length
  const roads = buildRoadNetworkMask(size)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (roads[y][x]) {
        tiles[y][x] = Math.random() > 0.18 ? "dirt-road" : "gravel"
        continue
      }

      if (
        hasNeighbor(roads, x, y) &&
        (tiles[y][x] === "grass" || tiles[y][x] === "clover" || tiles[y][x] === "wild-grass") &&
        Math.random() > 0.42
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

    houses.push({
      kind: "house",
      x: worldRect.x,
      y: worldRect.y,
      width,
      height,
      tiles: createThreeRoomHouseTiles(width, height),
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
    const spawnCount = Math.min(candidates.length, 1 + (Math.random() > 0.58 ? 1 : 0))

    for (let index = 0; index < spawnCount; index += 1) {
      const [gridX, gridY] = candidates[index]
      const whiteLootChance = 0.78
      const kind: MapObstacleBlueprint["kind"] = Math.random() < whiteLootChance ? "high-tier-box" : "box"
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

export const createWallBlueprints = (size: number, paths: boolean[][], blockedStructures: MapObstacleBlueprint[]) => {
  const walls: MapObstacleBlueprint[] = []
  const wallCount = randomInt(150, 220)

  for (let attempt = 0; attempt < 5200 && walls.length < wallCount; attempt += 1) {
    const centerX = randomInt(2, size - 3)
    const centerY = randomInt(2, size - 3)
    const onRoad = paths[centerY][centerX]
    const nearRoad = onRoad || hasNeighbor(paths, centerX, centerY)

    if (!nearRoad && Math.random() > 0.72) {
      continue
    }

    if (!circleFitsArena(centerX, centerY, size, 2.3)) {
      continue
    }

    let width = 1
    let height = 1
    const setLinearWall = (minSpan: number, maxSpan: number, favorLongest = false) => {
      const longestBias = favorLongest && maxSpan > minSpan && Math.random() > 0.42
      const span = longestBias ? maxSpan : randomInt(minSpan, maxSpan)
      if (Math.random() > 0.5) {
        width = span
        height = 1
        return
      }

      width = 1
      height = span
    }

    const shapeRoll = Math.random()
    if (onRoad) {
      if (shapeRoll > 0.2) {
        setLinearWall(2, 4, shapeRoll > 0.68)
      }
    } else if (nearRoad) {
      if (shapeRoll > 0.16) {
        setLinearWall(2, 5, shapeRoll > 0.52)
      } else {
        width = randomInt(2, 3)
        height = randomInt(2, 3)
      }
    } else {
      if (shapeRoll > 0.5) {
        setLinearWall(2, 4, shapeRoll > 0.8)
      } else if (shapeRoll > 0.28) {
        width = randomInt(2, 3)
        height = randomInt(1, 2)
      }
    }

    if (onRoad && width > 1 && height > 1) {
      if (Math.random() > 0.5) {
        width = 1
      } else {
        height = 1
      }
    }

    const left = centerX - Math.floor(width * 0.5)
    const top = centerY - Math.floor(height * 0.5)
    if (left < 2 || top < 2 || left + width > size - 2 || top + height > size - 2) {
      continue
    }
    if (!rectFitsArena(left, top, width, height, size, 2.3)) {
      continue
    }

    if (!nearRoad && Math.random() > 0.42 && !rectTouchesMask(paths, left, top, width, height, 2)) {
      continue
    }

    const wallRect = gridRectToWorldRect(left, top, width, height, size)
    const blockedByStructure = blockedStructures.some((structure) =>
      rectsOverlap(wallRect, structure, onRoad ? 0.35 : 0.55)
    )
    if (blockedByStructure) {
      continue
    }

    const blockedByWall = walls.some((existing) => rectsOverlap(wallRect, existing, onRoad ? 0.05 : 0.14))
    if (blockedByWall) {
      continue
    }

    if (onRoad && Math.random() > 0.5) {
      continue
    }

    walls.push({
      kind: "wall",
      x: wallRect.x,
      y: wallRect.y,
      width,
      height,
      tiles: [],
    })
  }

  return walls
}

export const createRockBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
  const rocks: MapObstacleBlueprint[] = []
  const rockCount = randomInt(56, 92)

  for (let attempt = 0; attempt < 3400 && rocks.length < rockCount; attempt += 1) {
    const gridX = randomInt(3, size - 4)
    const gridY = randomInt(3, size - 4)
    if (!circleFitsArena(gridX, gridY, size, 2.3)) {
      continue
    }

    if (!paths[gridY][gridX] && Math.random() > 0.78) {
      continue
    }

    const rock = {
      kind: "box" as const,
      x: gridToWorld(gridX, size),
      y: gridToWorld(gridY, size),
      width: 1,
      height: 1,
      tiles: [] as boolean[][],
    }

    const overlapsBlocked = blocked.some((obstacle) => rectsOverlap(rock, obstacle, 0.9))
    if (overlapsBlocked) {
      continue
    }

    const overlapsRock = rocks.some((existing) => rectsOverlap(rock, existing, 0.45))
    if (overlapsRock) {
      continue
    }

    rocks.push(rock)
  }

  return rocks
}

export const createPickupSpawnPoints = (size: number, paths: boolean[][], obstacles: MapObstacleBlueprint[]) => {
  const candidates: PickupSpawnPoint[] = []

  for (let y = 3; y < size - 3; y += 1) {
    for (let x = 3; x < size - 3; x += 1) {
      if (!paths[y][x]) {
        continue
      }
      if (Math.random() > 0.08) {
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
