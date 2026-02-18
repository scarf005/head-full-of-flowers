export type TerrainTile =
  | "grass"
  | "clover"
  | "wild-grass"
  | "dirt"
  | "dirt-road"
  | "road-edge"
  | "gravel"
  | "concrete"

export interface MapObstacleBlueprint {
  kind: "warehouse" | "house" | "hedge" | "wall" | "box" | "high-tier-box"
  x: number
  y: number
  width: number
  height: number
  tiles: boolean[][]
}

export interface PickupSpawnPoint {
  x: number
  y: number
}

export interface TerrainMap {
  size: number
  tiles: TerrainTile[][]
  obstacles: MapObstacleBlueprint[]
  pickupSpawnPoints: PickupSpawnPoint[]
}

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

const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

const gridToWorld = (index: number, size: number) => index - Math.floor(size * 0.5) + 0.5
const gridToWorldOrigin = (index: number, size: number) => index - Math.floor(size * 0.5)
const clampInt = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const hasNeighbor = (mask: boolean[][], x: number, y: number) => {
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) {
        continue
      }

      const nx = x + ox
      const ny = y + oy
      if (ny < 0 || nx < 0 || ny >= mask.length || nx >= mask[ny].length) {
        continue
      }

      if (mask[ny][nx]) {
        return true
      }
    }
  }

  return false
}

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

const circleFitsArena = (gridX: number, gridY: number, size: number, margin: number) => {
  const wx = gridToWorld(gridX, size)
  const wy = gridToWorld(gridY, size)
  const radius = size * 0.5 - margin
  return wx * wx + wy * wy <= radius * radius
}

const rectsOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  padding: number,
) => {
  return !(
    a.x + a.width * 0.5 + padding <= b.x - b.width * 0.5 ||
    a.x - a.width * 0.5 - padding >= b.x + b.width * 0.5 ||
    a.y + a.height * 0.5 + padding <= b.y - b.height * 0.5 ||
    a.y - a.height * 0.5 - padding >= b.y + b.height * 0.5
  )
}

const rectFitsArena = (left: number, top: number, width: number, height: number, size: number, margin: number) => {
  for (let y = top; y < top + height; y += 1) {
    for (let x = left; x < left + width; x += 1) {
      if (!circleFitsArena(x, y, size, margin)) {
        return false
      }
    }
  }

  return true
}

const rectTouchesMask = (
  mask: boolean[][],
  left: number,
  top: number,
  width: number,
  height: number,
  padding: number,
) => {
  for (let y = top - padding; y < top + height + padding; y += 1) {
    if (y < 0 || y >= mask.length) {
      continue
    }

    for (let x = left - padding; x < left + width + padding; x += 1) {
      if (x < 0 || x >= mask[y].length) {
        continue
      }

      if (mask[y][x]) {
        return true
      }
    }
  }

  return false
}

const gridRectToWorldRect = (left: number, top: number, width: number, height: number, size: number) => {
  return {
    x: gridToWorldOrigin(left, size) + width * 0.5,
    y: gridToWorldOrigin(top, size) + height * 0.5,
    width,
    height,
  }
}

const createPerimeterTiles = (width: number, height: number) => {
  return Array.from(
    { length: height },
    (_, row) =>
      Array.from({ length: width }, (_, col) => row === 0 || col === 0 || row === height - 1 || col === width - 1),
  )
}

const carveEntrance = (tiles: boolean[][], side: number, offset = 0) => {
  const height = tiles.length
  const width = tiles[0]?.length ?? 0
  if (width < 3 || height < 3) {
    return
  }

  if (side === 0) {
    const col = clampInt(Math.floor(width * 0.5) + offset, 1, width - 2)
    tiles[0][col] = false
    return
  }
  if (side === 1) {
    const col = clampInt(Math.floor(width * 0.5) + offset, 1, width - 2)
    tiles[height - 1][col] = false
    return
  }
  if (side === 2) {
    const row = clampInt(Math.floor(height * 0.5) + offset, 1, height - 2)
    tiles[row][0] = false
    return
  }

  const row = clampInt(Math.floor(height * 0.5) + offset, 1, height - 2)
  tiles[row][width - 1] = false
}

export const createWarehouseVariantTiles = (width: number, height: number) => {
  const tiles = createPerimeterTiles(width, height)
  const firstEntrance = randomInt(0, 3)
  const secondEntrance = (firstEntrance + 2) % 4
  carveEntrance(tiles, firstEntrance)
  carveEntrance(tiles, secondEntrance)
  return tiles
}

export const createThreeRoomHouseTiles = (width: number, height: number) => {
  return createThreeRoomHouseLayout(width, height).tiles
}

interface ThreeRoomHousePartition {
  primaryAxis: "vertical" | "horizontal"
  primaryIndex: number
  secondaryIndex: number
  splitOnPositiveSide: boolean
  roomAreas: [number, number, number]
}

export interface ThreeRoomHouseLayout {
  tiles: boolean[][]
  roomAreas: [number, number, number]
}

const chooseThreeRoomHousePartition = (width: number, height: number): ThreeRoomHousePartition => {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    const primaryAxis = Math.random() > 0.5 ? "vertical" : "horizontal"
    const splitOnPositiveSide = Math.random() > 0.5

    if (primaryAxis === "vertical") {
      const primaryIndex = randomInt(2, width - 3)
      const secondaryIndex = randomInt(2, height - 3)
      const branchWidth = splitOnPositiveSide ? width - primaryIndex - 2 : primaryIndex - 1
      const mainWidth = splitOnPositiveSide ? primaryIndex - 1 : width - primaryIndex - 2
      const topHeight = secondaryIndex - 1
      const bottomHeight = height - secondaryIndex - 2
      const roomAreas: [number, number, number] = [
        mainWidth * (height - 2),
        branchWidth * topHeight,
        branchWidth * bottomHeight,
      ]
      if (roomAreas.every((area) => area > 0) && new Set(roomAreas).size === 3) {
        return {
          primaryAxis,
          primaryIndex,
          secondaryIndex,
          splitOnPositiveSide,
          roomAreas,
        }
      }

      continue
    }

    const primaryIndex = randomInt(2, height - 3)
    const secondaryIndex = randomInt(2, width - 3)
    const branchHeight = splitOnPositiveSide ? height - primaryIndex - 2 : primaryIndex - 1
    const mainHeight = splitOnPositiveSide ? primaryIndex - 1 : height - primaryIndex - 2
    const leftWidth = secondaryIndex - 1
    const rightWidth = width - secondaryIndex - 2
    const roomAreas: [number, number, number] = [
      mainHeight * (width - 2),
      branchHeight * leftWidth,
      branchHeight * rightWidth,
    ]
    if (roomAreas.every((area) => area > 0) && new Set(roomAreas).size === 3) {
      return {
        primaryAxis,
        primaryIndex,
        secondaryIndex,
        splitOnPositiveSide,
        roomAreas,
      }
    }
  }

  const fallbackPrimary = clampInt(Math.floor(width * 0.46), 2, width - 3)
  const fallbackSecondary = clampInt(Math.floor(height * 0.42), 2, height - 3)
  const fallbackAreas: [number, number, number] = [
    (fallbackPrimary - 1) * (height - 2),
    (width - fallbackPrimary - 2) * (fallbackSecondary - 1),
    (width - fallbackPrimary - 2) * (height - fallbackSecondary - 2),
  ]
  return {
    primaryAxis: "vertical",
    primaryIndex: fallbackPrimary,
    secondaryIndex: fallbackSecondary,
    splitOnPositiveSide: true,
    roomAreas: fallbackAreas,
  }
}

export const createThreeRoomHouseLayout = (width: number, height: number): ThreeRoomHouseLayout => {
  const tiles = createPerimeterTiles(width, height)
  const partition = chooseThreeRoomHousePartition(width, height)

  if (partition.primaryAxis === "vertical") {
    for (let row = 1; row < height - 1; row += 1) {
      tiles[row][partition.primaryIndex] = true
    }

    if (partition.splitOnPositiveSide) {
      for (let col = partition.primaryIndex + 1; col < width - 1; col += 1) {
        tiles[partition.secondaryIndex][col] = true
      }

      const upperDoorRow = randomInt(1, partition.secondaryIndex - 1)
      const lowerDoorRow = randomInt(partition.secondaryIndex + 1, height - 2)
      const rightDoorCol = randomInt(partition.primaryIndex + 1, width - 2)
      tiles[upperDoorRow][partition.primaryIndex] = false
      tiles[lowerDoorRow][partition.primaryIndex] = false
      tiles[partition.secondaryIndex][rightDoorCol] = false
    } else {
      for (let col = 1; col < partition.primaryIndex; col += 1) {
        tiles[partition.secondaryIndex][col] = true
      }

      const upperDoorRow = randomInt(1, partition.secondaryIndex - 1)
      const lowerDoorRow = randomInt(partition.secondaryIndex + 1, height - 2)
      const leftDoorCol = randomInt(1, partition.primaryIndex - 1)
      tiles[upperDoorRow][partition.primaryIndex] = false
      tiles[lowerDoorRow][partition.primaryIndex] = false
      tiles[partition.secondaryIndex][leftDoorCol] = false
    }
  } else {
    for (let col = 1; col < width - 1; col += 1) {
      tiles[partition.primaryIndex][col] = true
    }

    if (partition.splitOnPositiveSide) {
      for (let row = partition.primaryIndex + 1; row < height - 1; row += 1) {
        tiles[row][partition.secondaryIndex] = true
      }

      const leftDoorCol = randomInt(1, partition.secondaryIndex - 1)
      const rightDoorCol = randomInt(partition.secondaryIndex + 1, width - 2)
      const lowerDoorRow = randomInt(partition.primaryIndex + 1, height - 2)
      tiles[partition.primaryIndex][leftDoorCol] = false
      tiles[partition.primaryIndex][rightDoorCol] = false
      tiles[lowerDoorRow][partition.secondaryIndex] = false
    } else {
      for (let row = 1; row < partition.primaryIndex; row += 1) {
        tiles[row][partition.secondaryIndex] = true
      }

      const leftDoorCol = randomInt(1, partition.secondaryIndex - 1)
      const rightDoorCol = randomInt(partition.secondaryIndex + 1, width - 2)
      const upperDoorRow = randomInt(1, partition.primaryIndex - 1)
      tiles[partition.primaryIndex][leftDoorCol] = false
      tiles[partition.primaryIndex][rightDoorCol] = false
      tiles[upperDoorRow][partition.secondaryIndex] = false
    }
  }

  const entranceSides = [0, 1, 2, 3]
  const entranceCount = Math.random() > 0.62 ? 3 : 2
  for (let index = 0; index < entranceCount && entranceSides.length > 0; index += 1) {
    const sideIndex = randomInt(0, entranceSides.length - 1)
    const side = entranceSides.splice(sideIndex, 1)[0]
    const offsetSpan = side <= 1 ? Math.max(1, Math.floor(width * 0.26)) : Math.max(1, Math.floor(height * 0.26))
    carveEntrance(tiles, side, randomInt(-offsetSpan, offsetSpan))
  }

  for (let col = 0; col < width; col += 1) {
    if (!tiles[0][col] && tiles[1][col]) {
      tiles[1][col] = false
    }
    if (!tiles[height - 1][col] && tiles[height - 2][col]) {
      tiles[height - 2][col] = false
    }
  }

  for (let row = 1; row < height - 1; row += 1) {
    if (!tiles[row][0] && tiles[row][1]) {
      tiles[row][1] = false
    }
    if (!tiles[row][width - 1] && tiles[row][width - 2]) {
      tiles[row][width - 2] = false
    }
  }

  return { tiles, roomAreas: partition.roomAreas }
}

export const createGardenHedgeMazeTiles = (width: number, height: number) => {
  const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => true))
  const minX = 1
  const maxX = width - 2
  const minY = 1
  const maxY = height - 2

  const oddInRange = (value: number, min: number, max: number) => {
    let normalized = clampInt(value, min, max)
    if (normalized % 2 === 0) {
      normalized = normalized + 1 <= max ? normalized + 1 : normalized - 1
    }
    return clampInt(normalized, min, max)
  }

  const startX = oddInRange(Math.floor(width * 0.5), minX, maxX)
  const startY = oddInRange(Math.floor(height * 0.5), minY, maxY)
  tiles[startY][startX] = false
  const stack: [number, number][] = [[startX, startY]]
  const cardinalOffsets: [number, number][] = [[2, 0], [-2, 0], [0, 2], [0, -2]]

  while (stack.length > 0) {
    const next = stack[stack.length - 1]
    const [x, y] = next
    const candidates: [number, number, number, number][] = []
    for (const [dx, dy] of cardinalOffsets) {
      const targetX = x + dx
      const targetY = y + dy
      if (targetX < minX || targetY < minY || targetX > maxX || targetY > maxY) {
        continue
      }
      if (!tiles[targetY][targetX]) {
        continue
      }
      candidates.push([targetX, targetY, x + Math.sign(dx), y + Math.sign(dy)])
    }

    if (candidates.length === 0) {
      stack.pop()
      continue
    }

    const [targetX, targetY, bridgeX, bridgeY] = candidates[randomInt(0, candidates.length - 1)]
    tiles[bridgeY][bridgeX] = false
    tiles[targetY][targetX] = false
    stack.push([targetX, targetY])
  }

  const centerX = Math.floor(width * 0.5)
  const centerY = Math.floor(height * 0.5)
  const clearingHalfWidth = Math.max(1, Math.floor(width * 0.16))
  const clearingHalfHeight = Math.max(1, Math.floor(height * 0.16))
  for (let row = centerY - clearingHalfHeight; row <= centerY + clearingHalfHeight; row += 1) {
    for (let col = centerX - clearingHalfWidth; col <= centerX + clearingHalfWidth; col += 1) {
      const safeRow = clampInt(row, 1, height - 2)
      const safeCol = clampInt(col, 1, width - 2)
      tiles[safeRow][safeCol] = false
    }
  }

  const entranceRow = oddInRange(centerY, 1, height - 2)
  tiles[entranceRow][0] = false
  tiles[entranceRow][width - 1] = false
  for (let col = 1; col <= centerX; col += 1) {
    tiles[entranceRow][col] = false
  }
  for (let col = centerX; col < width - 1; col += 1) {
    tiles[entranceRow][col] = false
  }

  for (let row = 1; row <= centerY; row += 1) {
    tiles[row][centerX] = false
  }
  for (let row = centerY; row < height - 1; row += 1) {
    tiles[row][centerX] = false
  }

  return tiles
}

const applyRoadNetwork = (tiles: TerrainTile[][]) => {
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

const createWarehouseBlueprints = (size: number, paths: boolean[][]) => {
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

const createHighTierLootBoxBlueprints = (size: number, warehouses: MapObstacleBlueprint[]) => {
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

const createHouseBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
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

const createHouseLootBoxBlueprints = (size: number, houses: MapObstacleBlueprint[]) => {
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

const createHedgeMazeBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
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

const createWallBlueprints = (size: number, paths: boolean[][], blockedStructures: MapObstacleBlueprint[]) => {
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

const createRockBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
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

const createPickupSpawnPoints = (size: number, paths: boolean[][], obstacles: MapObstacleBlueprint[]) => {
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
