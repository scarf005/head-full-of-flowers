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
  kind: "warehouse" | "wall"
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
  "dirt",
  "dirt-road",
  "road-edge",
  "gravel",
  "concrete"
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

const createWarehouseBlueprints = (size: number, roads: boolean[][]) => {
  const obstacles: MapObstacleBlueprint[] = []
  const warehouseCount = randomInt(4, 7)

  for (let attempt = 0; attempt < 700 && obstacles.length < warehouseCount; attempt += 1) {
    const width = randomInt(4, 8)
    const height = randomInt(3, 6)
    const left = randomInt(3, size - width - 4)
    const top = randomInt(3, size - height - 4)
    const centerX = left + width * 0.5
    const centerY = top + height * 0.5

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
        if (y < 0 || x < 0 || y >= roads.length || x >= roads[y].length) {
          continue
        }
        if (roads[y][x]) {
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
      x: gridToWorld(Math.floor(centerX), size),
      y: gridToWorld(Math.floor(centerY), size),
      width,
      height
    }

    const blocked = obstacles.some((existing) => rectsOverlap(worldRect, existing, 2.2))
    if (blocked) {
      continue
    }

    const tiles = Array.from({ length: height }, () => Array.from({ length: width }, () => true))
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

const createWallBlueprints = (size: number, roads: boolean[][], warehouses: MapObstacleBlueprint[]) => {
  const walls: MapObstacleBlueprint[] = []
  const wallCount = randomInt(15, 24)

  for (let attempt = 0; attempt < 1000 && walls.length < wallCount; attempt += 1) {
    const gridX = randomInt(4, size - 5)
    const gridY = randomInt(4, size - 5)
    if (!roads[gridY][gridX] && Math.random() > 0.28) {
      continue
    }
    if (!circleFitsArena(gridX, gridY, size, 2.5)) {
      continue
    }

    const horizontal = Math.random() > 0.5
    const length = randomInt(2, 5)
    const width = horizontal ? length : 0.8
    const height = horizontal ? 0.8 : length
    const wall = {
      kind: "wall" as const,
      x: gridToWorld(gridX, size),
      y: gridToWorld(gridY, size),
      width,
      height,
      tiles: [] as boolean[][]
    }

    let valid = true
    for (const warehouse of warehouses) {
      if (rectsOverlap(wall, warehouse, 1.1)) {
        valid = false
        break
      }
    }
    if (!valid) {
      continue
    }

    for (const existing of walls) {
      if (rectsOverlap(wall, existing, 0.65)) {
        valid = false
        break
      }
    }
    if (!valid) {
      continue
    }

    walls.push(wall)
  }

  return walls
}

const createPickupSpawnPoints = (size: number, roads: boolean[][], obstacles: MapObstacleBlueprint[]) => {
  const candidates: PickupSpawnPoint[] = []

  for (let y = 3; y < size - 3; y += 1) {
    for (let x = 3; x < size - 3; x += 1) {
      if (!roads[y][x]) {
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

  const roads = applyRoadNetwork(tiles)
  const warehouseBlueprints = createWarehouseBlueprints(size, roads)
  const wallBlueprints = createWallBlueprints(size, roads, warehouseBlueprints)
  const obstacles = [...warehouseBlueprints, ...wallBlueprints]
  const pickupSpawnPoints = createPickupSpawnPoints(size, roads, obstacles)

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
