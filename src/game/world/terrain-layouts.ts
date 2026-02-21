import { clampInt, randomInt } from "./terrain-utils.ts"

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
