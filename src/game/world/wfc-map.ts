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
  kind: "warehouse" | "wall" | "box"
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
  "wild-grass"
]

const WEIGHTS: Record<TerrainTile, number> = {
  grass: 36,
  clover: 24,
  "wild-grass": 18,
  dirt: 8,
  "dirt-road": 6,
  "road-edge": 5,
  gravel: 2,
  concrete: 1
}

const ALLOWED: Record<TerrainTile, TerrainTile[]> = {
  grass: ["grass", "clover", "wild-grass", "dirt", "road-edge", "gravel"],
  clover: ["grass", "clover", "wild-grass", "dirt", "road-edge"],
  "wild-grass": ["grass", "clover", "wild-grass", "dirt", "road-edge", "gravel"],
  dirt: ["grass", "clover", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  "dirt-road": ["dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  "road-edge": ["grass", "clover", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel"],
  gravel: ["grass", "wild-grass", "dirt", "dirt-road", "road-edge", "gravel", "concrete"],
  concrete: ["dirt", "dirt-road", "gravel", "concrete"]
}

const randomInt = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))

const gridToWorld = (index: number, size: number) => index - Math.floor(size * 0.5) + 0.5
const gridToWorldOrigin = (index: number, size: number) => index - Math.floor(size * 0.5)

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
  carveBrush(mask, x, y, randomInt(1, 2))

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

    carveBrush(mask, x, y, Math.random() > 0.75 ? 2 : 1)
  }
}

const buildRoadNetworkMask = (size: number) => {
  const mask = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const center = Math.floor(size * 0.5)
  const hubCount = randomInt(4, 6)
  const hubs: [number, number][] = [[center, center]]

  for (let index = 1; index < hubCount; index += 1) {
    const ring = size * randomInt(20, 44) * 0.01
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
  padding: number
) => {
  return !(
    a.x + a.width * 0.5 + padding <= b.x - b.width * 0.5 ||
    a.x - a.width * 0.5 - padding >= b.x + b.width * 0.5 ||
    a.y + a.height * 0.5 + padding <= b.y - b.height * 0.5 ||
    a.y - a.height * 0.5 - padding >= b.y + b.height * 0.5
  )
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

      if (hasNeighbor(roads, x, y) && (tiles[y][x] === "grass" || tiles[y][x] === "clover" || tiles[y][x] === "wild-grass")) {
        tiles[y][x] = "road-edge"
      }
    }
  }

  return roads
}

const createMazePathMask = (size: number) => {
  const mask = Array.from({ length: size }, () => Array.from({ length: size }, () => false))
  const cellWidth = Math.max(4, Math.floor((size - 6) / 2))
  const cellHeight = Math.max(4, Math.floor((size - 6) / 2))
  const visited = Array.from({ length: cellHeight }, () => Array.from({ length: cellWidth }, () => false))
  const stack: [number, number][] = [[randomInt(0, cellWidth - 1), randomInt(0, cellHeight - 1)]]

  const carveCell = (cellX: number, cellY: number) => {
    const gridX = 3 + cellX * 2
    const gridY = 3 + cellY * 2
    if (gridX >= 0 && gridY >= 0 && gridX < size && gridY < size) {
      mask[gridY][gridX] = true
    }
  }

  while (stack.length > 0) {
    const [cellX, cellY] = stack[stack.length - 1]
    visited[cellY][cellX] = true
    carveCell(cellX, cellY)

    const neighbors: [number, number, number, number][] = []
    if (cellX > 0 && !visited[cellY][cellX - 1]) neighbors.push([cellX - 1, cellY, -1, 0])
    if (cellX < cellWidth - 1 && !visited[cellY][cellX + 1]) neighbors.push([cellX + 1, cellY, 1, 0])
    if (cellY > 0 && !visited[cellY - 1][cellX]) neighbors.push([cellX, cellY - 1, 0, -1])
    if (cellY < cellHeight - 1 && !visited[cellY + 1][cellX]) neighbors.push([cellX, cellY + 1, 0, 1])

    if (neighbors.length === 0) {
      stack.pop()
      continue
    }

    const [nextX, nextY, dirX, dirY] = neighbors[randomInt(0, neighbors.length - 1)]
    const betweenX = 3 + cellX * 2 + dirX
    const betweenY = 3 + cellY * 2 + dirY
    if (betweenX >= 0 && betweenY >= 0 && betweenX < size && betweenY < size) {
      mask[betweenY][betweenX] = true
    }
    stack.push([nextX, nextY])
  }

  const extraLoops = Math.floor(cellWidth * cellHeight * 0.14)
  for (let loop = 0; loop < extraLoops; loop += 1) {
    const cellX = randomInt(1, cellWidth - 2)
    const cellY = randomInt(1, cellHeight - 2)
    const gridX = 3 + cellX * 2
    const gridY = 3 + cellY * 2
    const directions: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]]
    const [dirX, dirY] = directions[randomInt(0, directions.length - 1)]
    const betweenX = gridX + dirX
    const betweenY = gridY + dirY
    if (betweenX >= 2 && betweenY >= 2 && betweenX < size - 2 && betweenY < size - 2) {
      mask[betweenY][betweenX] = true
    }
  }

  return mask
}

const applyMazeGarden = (tiles: TerrainTile[][]) => {
  const size = tiles.length
  const mazePaths = createMazePathMask(size)

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (mazePaths[y][x]) {
        tiles[y][x] = Math.random() > 0.18 ? "dirt-road" : "gravel"
        continue
      }

      if (hasNeighbor(mazePaths, x, y) && (tiles[y][x] === "grass" || tiles[y][x] === "clover" || tiles[y][x] === "wild-grass")) {
        tiles[y][x] = "road-edge"
      }
    }
  }

  return mazePaths
}

const mergeMasks = (first: boolean[][], second: boolean[][]) => {
  const size = first.length
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => first[y][x] || second[y][x])
  )
}

const buildMazeWallTiles = (size: number, paths: boolean[][]) => {
  return Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      if (paths[y][x]) {
        return false
      }
      return circleFitsArena(x, y, size, 2.2)
    })
  )
}

const carveBlueprintFromMask = (mask: boolean[][], size: number, blueprint: MapObstacleBlueprint) => {
  const left = Math.floor(blueprint.x - blueprint.width * 0.5 + size * 0.5)
  const top = Math.floor(blueprint.y - blueprint.height * 0.5 + size * 0.5)

  if (blueprint.kind === "warehouse") {
    for (let row = 0; row < blueprint.tiles.length; row += 1) {
      for (let col = 0; col < blueprint.tiles[row].length; col += 1) {
        if (!blueprint.tiles[row][col]) {
          continue
        }

        const gridX = left + col
        const gridY = top + row
        if (gridX < 0 || gridY < 0 || gridY >= size || gridX >= size) {
          continue
        }

        mask[gridY][gridX] = false
      }
    }
    return
  }

  const width = Math.max(1, Math.floor(blueprint.width))
  const height = Math.max(1, Math.floor(blueprint.height))
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const gridX = left + col
      const gridY = top + row
      if (gridX < 0 || gridY < 0 || gridY >= size || gridX >= size) {
        continue
      }
      mask[gridY][gridX] = false
    }
  }
}

const createMazeWallBlueprint = (size: number, paths: boolean[][], blockers: MapObstacleBlueprint[]) => {
  const tiles = buildMazeWallTiles(size, paths)
  for (const blocker of blockers) {
    carveBlueprintFromMask(tiles, size, blocker)
  }

  return {
    kind: "warehouse" as const,
    x: 0,
    y: 0,
    width: size,
    height: size,
    tiles
  }
}

const createWarehouseBlueprints = (size: number, paths: boolean[][]) => {
  const obstacles: MapObstacleBlueprint[] = []
  const warehouseCount = randomInt(6, 10)

  for (let attempt = 0; attempt < 700 && obstacles.length < warehouseCount; attempt += 1) {
    const width = randomInt(4, 8)
    const height = randomInt(3, 6)
    const left = randomInt(3, size - width - 4)
    const top = randomInt(3, size - height - 4)
    let inArena = true
    for (let y = top; y < top + height; y += 1) {
      for (let x = left; x < left + width; x += 1) {
        if (!circleFitsArena(x, y, size, 2.8)) {
          inArena = false
          break
        }
      }
      if (!inArena) {
        break
      }
    }

    if (!inArena) {
      continue
    }

    let nearRoad = false
    for (let y = top - 2; y < top + height + 2; y += 1) {
      for (let x = left - 2; x < left + width + 2; x += 1) {
        if (y < 0 || x < 0 || y >= paths.length || x >= paths[y].length) {
          continue
        }
        if (paths[y][x]) {
          nearRoad = true
          break
        }
      }
      if (nearRoad) {
        break
      }
    }

    if (!nearRoad) {
      continue
    }

    const worldRect = {
      x: gridToWorldOrigin(left, size) + width * 0.5,
      y: gridToWorldOrigin(top, size) + height * 0.5,
      width,
      height
    }

    const blocked = obstacles.some((existing) => rectsOverlap(worldRect, existing, 2.2))
    if (blocked) {
      continue
    }

    const tiles = Array.from({ length: height }, (_, row) =>
      Array.from({ length: width }, (_, col) =>
        row === 0 || col === 0 || row === height - 1 || col === width - 1
      )
    )
    const entrance = randomInt(0, 3)
    if (entrance === 0) {
      tiles[0][Math.floor(width * 0.5)] = false
    }
    if (entrance === 1) {
      tiles[height - 1][Math.floor(width * 0.5)] = false
    }
    if (entrance === 2) {
      tiles[Math.floor(height * 0.5)][0] = false
    }
    if (entrance === 3) {
      tiles[Math.floor(height * 0.5)][width - 1] = false
    }

    obstacles.push({
      kind: "warehouse",
      x: worldRect.x,
      y: worldRect.y,
      width,
      height,
      tiles
    })
  }

  return obstacles
}

const createWallBlueprints = (size: number, paths: boolean[][], warehouses: MapObstacleBlueprint[]) => {
  const walls: MapObstacleBlueprint[] = []
  const wallCount = randomInt(24, 48)

  for (let y = 2; y < size - 2 && walls.length < wallCount; y += 1) {
    for (let x = 2; x < size - 2 && walls.length < wallCount; x += 1) {
      if (paths[y][x]) {
        continue
      }
      if (!hasNeighbor(paths, x, y)) {
        continue
      }
      if (Math.random() > 0.34) {
        continue
      }
      if (!circleFitsArena(x, y, size, 2.3)) {
        continue
      }

      const wall = {
        kind: "wall" as const,
        x: gridToWorld(x, size),
        y: gridToWorld(y, size),
        width: 1,
        height: 1,
        tiles: [] as boolean[][]
      }

      const blockedByWarehouse = warehouses.some((warehouse) => rectsOverlap(wall, warehouse, 0.4))
      if (blockedByWarehouse) {
        continue
      }

      walls.push(wall)
    }
  }

  return walls
}

const createRockBlueprints = (size: number, paths: boolean[][], blocked: MapObstacleBlueprint[]) => {
  const rocks: MapObstacleBlueprint[] = []
  const rockCount = randomInt(14, 24)

  for (let attempt = 0; attempt < 900 && rocks.length < rockCount; attempt += 1) {
    const gridX = randomInt(3, size - 4)
    const gridY = randomInt(3, size - 4)
    if (!circleFitsArena(gridX, gridY, size, 2.3)) {
      continue
    }

    if (!paths[gridY][gridX] && Math.random() > 0.5) {
      continue
    }

    const rock = {
      kind: "box" as const,
      x: gridToWorld(gridX, size),
      y: gridToWorld(gridY, size),
      width: 1,
      height: 1,
      tiles: [] as boolean[][]
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
  const wave = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => new Set<TerrainTile>(TILE_IDS))
  )

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

  const tiles = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => [...wave[y][x]][0] ?? "grass")
  )

  const roads = buildRoadNetworkMask(size)
  const mazePaths = createMazePathMask(size)
  const paths = mergeMasks(roads, mazePaths)
  const warehouseBlueprints = createWarehouseBlueprints(size, paths)
  const wallBlueprints = createWallBlueprints(size, paths, warehouseBlueprints)
  const rockBlueprints = createRockBlueprints(size, paths, [...warehouseBlueprints, ...wallBlueprints])
  const structuralObstacles = [...warehouseBlueprints, ...wallBlueprints, ...rockBlueprints]
  const mazeWallBlueprint = createMazeWallBlueprint(size, paths, structuralObstacles)
  const obstacles = [mazeWallBlueprint, ...structuralObstacles]
  const pickupSpawnPoints = createPickupSpawnPoints(size, paths, structuralObstacles)

  return {
    size,
    tiles,
    obstacles,
    pickupSpawnPoints
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
