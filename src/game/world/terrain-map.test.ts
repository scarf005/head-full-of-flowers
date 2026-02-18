import { assert, assertEquals } from "jsr:@std/assert"

import {
  createBarrenGardenMap,
  createGardenHedgeMazeTiles,
  createThreeRoomHouseLayout,
  createWarehouseVariantTiles,
} from "./terrain-map.ts"

const countPerimeterOpenings = (tiles: boolean[][]) => {
  const height = tiles.length
  const width = tiles[0]?.length ?? 0
  let openings = 0

  for (let col = 0; col < width; col += 1) {
    if (!tiles[0][col]) {
      openings += 1
    }
    if (!tiles[height - 1][col]) {
      openings += 1
    }
  }

  for (let row = 1; row < height - 1; row += 1) {
    if (!tiles[row][0]) {
      openings += 1
    }
    if (!tiles[row][width - 1]) {
      openings += 1
    }
  }

  return openings
}

const openRegionSizes = (tiles: boolean[][]) => {
  const height = tiles.length
  const width = tiles[0]?.length ?? 0
  const visited = Array.from({ length: height }, () => Array.from({ length: width }, () => false))
  const sizes: number[] = []

  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (tiles[row][col] || visited[row][col]) {
        continue
      }

      const stack: [number, number][] = [[row, col]]
      visited[row][col] = true
      let size = 0
      while (stack.length > 0) {
        const next = stack.pop()
        if (!next) {
          continue
        }

        const [currentRow, currentCol] = next
        size += 1
        const neighbors: [number, number][] = [
          [currentRow - 1, currentCol],
          [currentRow + 1, currentCol],
          [currentRow, currentCol - 1],
          [currentRow, currentCol + 1],
        ]

        for (const [neighborRow, neighborCol] of neighbors) {
          if (neighborRow < 0 || neighborCol < 0 || neighborRow >= height || neighborCol >= width) {
            continue
          }
          if (tiles[neighborRow][neighborCol] || visited[neighborRow][neighborCol]) {
            continue
          }

          visited[neighborRow][neighborCol] = true
          stack.push([neighborRow, neighborCol])
        }
      }

      sizes.push(size)
    }
  }

  return sizes
}

const withSeededRandom = (seed: number, run: () => void) => {
  const originalRandom = Math.random
  let state = seed >>> 0
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }

  try {
    run()
  } finally {
    Math.random = originalRandom
  }
}

const isObstacleInsideHouseInterior = (
  house: { x: number; y: number; width: number; height: number; tiles: boolean[][] },
  obstacle: { x: number; y: number },
  mapHalf: number,
) => {
  const left = Math.floor(house.x - house.width * 0.5 + mapHalf)
  const top = Math.floor(house.y - house.height * 0.5 + mapHalf)
  const gridX = Math.floor(obstacle.x) + mapHalf
  const gridY = Math.floor(obstacle.y) + mapHalf
  const localCol = gridX - left
  const localRow = gridY - top
  if (localRow < 0 || localCol < 0 || localRow >= house.tiles.length || localCol >= house.tiles[localRow].length) {
    return false
  }

  return !house.tiles[localRow][localCol]
}

Deno.test("createWarehouseVariantTiles creates a two-entrance shell", () => {
  const tiles = createWarehouseVariantTiles(8, 6)
  assertEquals(countPerimeterOpenings(tiles), 2)
})

Deno.test("createThreeRoomHouseLayout keeps 3-room connectivity while varying room sizes procedurally", () => {
  withSeededRandom(90210, () => {
    const signatures = new Set<string>()
    for (let iteration = 0; iteration < 18; iteration += 1) {
      const layout = createThreeRoomHouseLayout(11, 9)
      assertEquals(openRegionSizes(layout.tiles).length, 1)
      assertEquals(new Set(layout.roomAreas).size, 3)
      assert(layout.roomAreas.every((area) => area > 0))
      const openings = countPerimeterOpenings(layout.tiles)
      assert(openings >= 2 && openings <= 3)
      signatures.add(layout.roomAreas.join("-"))
    }

    assert(signatures.size >= 4)
  })
})

Deno.test("createGardenHedgeMazeTiles creates a connected maze with two entrances and center clearing", () => {
  const tiles = createGardenHedgeMazeTiles(13, 11)
  const centerRow = Math.floor(tiles.length * 0.5)
  const centerCol = Math.floor(tiles[0].length * 0.5)

  assertEquals(countPerimeterOpenings(tiles), 2)
  assertEquals(openRegionSizes(tiles).length, 1)
  assertEquals(tiles[centerRow][centerCol], false)
  assertEquals(tiles[centerRow - 1][centerCol], false)
  assertEquals(tiles[centerRow + 1][centerCol], false)
  assertEquals(tiles[centerRow][centerCol - 1], false)
  assertEquals(tiles[centerRow][centerCol + 1], false)

  const hedgeTiles = tiles.flat().filter((tile) => tile).length
  assert(hedgeTiles > 20)
})

Deno.test("createBarrenGardenMap includes houses and hedge mazes", () => {
  withSeededRandom(424242, () => {
    const map = createBarrenGardenMap(112)
    const hasHouse = map.obstacles.some((obstacle) => obstacle.kind === "house")
    const hasHedgeMaze = map.obstacles.some((obstacle) => obstacle.kind === "hedge")

    assert(hasHouse)
    assert(hasHedgeMaze)
  })
})

Deno.test("createBarrenGardenMap favors white loot crates inside houses", () => {
  let totalHouses = 0
  let housesWithCrate = 0
  let totalHouseCrates = 0
  let whiteHouseCrates = 0

  for (let seed = 8100; seed < 8110; seed += 1) {
    withSeededRandom(seed, () => {
      const map = createBarrenGardenMap(80)
      const houses = map.obstacles.filter((obstacle) => obstacle.kind === "house")
      const houseCrates = map.obstacles.filter((obstacle) =>
        obstacle.kind === "box" || obstacle.kind === "high-tier-box"
      )
      const mapHalf = Math.floor(map.size * 0.5)

      for (const house of houses) {
        totalHouses += 1
        let houseLocalCrateCount = 0

        for (const crate of houseCrates) {
          if (!isObstacleInsideHouseInterior(house, crate, mapHalf)) {
            continue
          }

          houseLocalCrateCount += 1
          totalHouseCrates += 1
          if (crate.kind === "high-tier-box") {
            whiteHouseCrates += 1
          }
        }

        if (houseLocalCrateCount > 0) {
          housesWithCrate += 1
        }
      }
    })
  }

  assert(totalHouses > 0)
  assertEquals(housesWithCrate, totalHouses)
  assert(totalHouseCrates >= totalHouses)
  assert(whiteHouseCrates / totalHouseCrates >= 0.65)
})
