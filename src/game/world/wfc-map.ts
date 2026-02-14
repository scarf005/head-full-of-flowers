export type TerrainTile =
  | "dust"
  | "cracked"
  | "dead-grass"
  | "stone"
  | "rubble"
  | "thorns"
  | "shrub"
  | "fence"

export interface TerrainMap {
  size: number
  tiles: TerrainTile[][]
}

const TILE_IDS: TerrainTile[] = [
  "dust",
  "cracked",
  "dead-grass",
  "stone",
  "rubble",
  "thorns",
  "shrub",
  "fence"
]

const WEIGHTS: Record<TerrainTile, number> = {
  dust: 20,
  cracked: 14,
  "dead-grass": 6,
  stone: 5,
  rubble: 5,
  thorns: 3,
  shrub: 3,
  fence: 2
}

const ALLOWED: Record<TerrainTile, TerrainTile[]> = {
  dust: ["dust", "cracked", "dead-grass", "rubble", "thorns", "shrub", "stone", "fence"],
  cracked: ["dust", "cracked", "dead-grass", "rubble", "stone", "fence"],
  "dead-grass": ["dust", "cracked", "dead-grass", "rubble", "shrub"],
  stone: ["stone", "rubble", "cracked", "dust", "fence"],
  rubble: ["rubble", "stone", "cracked", "dust", "thorns", "shrub"],
  thorns: ["dust", "cracked", "rubble", "thorns", "shrub"],
  shrub: ["dust", "cracked", "dead-grass", "rubble", "thorns", "shrub"],
  fence: ["fence", "cracked", "stone", "dust"]
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

  return choices[0] ?? "dust"
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

  for (let index = 0; index < size; index += 1) {
    wave[0][index] = new Set(["fence"])
    wave[size - 1][index] = new Set(["fence"])
    wave[index][0] = new Set(["fence"])
    wave[index][size - 1] = new Set(["fence"])
  }

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
          neighborSet.add("dust")
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
    Array.from({ length: size }, (_, x) => [...wave[y][x]][0] ?? "dust")
  )

  return {
    size,
    tiles
  } satisfies TerrainMap
}

export const terrainAt = (map: TerrainMap, worldX: number, worldY: number): TerrainTile => {
  const half = Math.floor(map.size * 0.5)
  const gridX = Math.floor(worldX) + half
  const gridY = Math.floor(worldY) + half
  if (gridX < 0 || gridY < 0 || gridX >= map.size || gridY >= map.size) {
    return "dust"
  }

  return map.tiles[gridY][gridX]
}
