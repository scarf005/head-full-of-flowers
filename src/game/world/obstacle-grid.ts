import type { MapObstacleBlueprint, TerrainMap } from "./terrain-map.ts"

export const OBSTACLE_MATERIAL_NONE = 0
export const OBSTACLE_MATERIAL_WALL = 1
export const OBSTACLE_MATERIAL_WAREHOUSE = 2
export const OBSTACLE_MATERIAL_ROCK = 3
export const OBSTACLE_MATERIAL_BOX = 4
export const OBSTACLE_MATERIAL_HEDGE = 5
export const OBSTACLE_MATERIAL_PROP = 6

export const OBSTACLE_FLASH_NONE = 0
export const OBSTACLE_FLASH_BLOCKED = 1
export const OBSTACLE_FLASH_DAMAGED = 2

export interface ObstacleGridState {
  size: number
  solid: Uint8Array
  hp: Float32Array
  material: Uint8Array
  highTierLoot: Uint8Array
  flash: Float32Array
  flashKind: Uint8Array
  flashActiveIndices: Set<number>
  revision: number
  propCells: Map<number, number[]>
}

const hpForMaterial = (material: number) => {
  if (material === OBSTACLE_MATERIAL_PROP) return 3
  if (material === OBSTACLE_MATERIAL_WALL) {
    return 3
  }
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
    return 4
  }
  if (material === OBSTACLE_MATERIAL_ROCK) {
    return 8
  }
  if (material === OBSTACLE_MATERIAL_BOX) {
    return 8
  }
  if (material === OBSTACLE_MATERIAL_HEDGE) {
    return 2
  }

  return 0
}

export const obstacleArmorForMaterial = (material: number) => {
  if (material === OBSTACLE_MATERIAL_WALL) {
    return 2
  }
  if (material === OBSTACLE_MATERIAL_WAREHOUSE) {
    return 2
  }
  if (material === OBSTACLE_MATERIAL_HEDGE) {
    return 1
  }
  return 0
}

const materialForKind = (kind: MapObstacleBlueprint["kind"]) => {
  if (kind === "wall") {
    return OBSTACLE_MATERIAL_WALL
  }
  if (kind === "warehouse") {
    return OBSTACLE_MATERIAL_WAREHOUSE
  }
  if (kind === "house") {
    return OBSTACLE_MATERIAL_WAREHOUSE
  }
  if (kind === "hedge") {
    return OBSTACLE_MATERIAL_HEDGE
  }
  if (kind === "box") {
    return OBSTACLE_MATERIAL_BOX
  }
  if (kind === "high-tier-box") {
    return OBSTACLE_MATERIAL_BOX
  }
  return OBSTACLE_MATERIAL_NONE
}

export const createObstacleGrid = (size: number): ObstacleGridState => {
  const cellCount = size * size
  return {
    size,
    solid: new Uint8Array(cellCount),
    hp: new Float32Array(cellCount),
    material: new Uint8Array(cellCount),
    highTierLoot: new Uint8Array(cellCount),
    flash: new Float32Array(cellCount),
    flashKind: new Uint8Array(cellCount),
    flashActiveIndices: new Set<number>(),
    revision: 0,
    propCells: new Map(),
  }
}

export const obstacleGridIndex = (size: number, x: number, y: number) => y * size + x

export const isObstacleCellSolid = (grid: ObstacleGridState, x: number, y: number) => {
  if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) {
    return false
  }

  return grid.solid[obstacleGridIndex(grid.size, x, y)] > 0
}

export const isObstacleCellDamageable = (grid: ObstacleGridState, x: number, y: number) =>
  x >= 0 && y >= 0 && x < grid.size && y < grid.size && grid.hp[obstacleGridIndex(grid.size, x, y)] > 0

export const worldToObstacleGrid = (size: number, worldX: number, worldY: number) => {
  const half = Math.floor(size * 0.5)
  return {
    x: Math.floor(worldX) + half,
    y: Math.floor(worldY) + half,
  }
}

export const obstacleGridToWorldCenter = (size: number, x: number, y: number) => {
  const half = Math.floor(size * 0.5)
  return {
    x: x - half + 0.5,
    y: y - half + 0.5,
  }
}

export const buildObstacleGridFromMap = (map: TerrainMap) => {
  const grid = createObstacleGrid(map.size)
  const half = Math.floor(map.size * 0.5)

  const setCell = (gridX: number, gridY: number, material: number, highTierLoot = false) => {
    if (gridX < 0 || gridY < 0 || gridX >= map.size || gridY >= map.size) {
      return
    }

    const index = obstacleGridIndex(map.size, gridX, gridY)
    grid.solid[index] = 1
    grid.material[index] = material
    grid.hp[index] = hpForMaterial(material)
    grid.highTierLoot[index] = highTierLoot ? 1 : 0
    grid.flash[index] = 0
    grid.flashKind[index] = OBSTACLE_FLASH_NONE
  }

  for (const obstacle of map.obstacles) {
    const material = materialForKind(obstacle.kind)
    const highTierLoot = obstacle.kind === "high-tier-box"
    if (material === OBSTACLE_MATERIAL_NONE) {
      continue
    }

    const left = Math.floor(obstacle.x - obstacle.width * 0.5 + half)
    const top = Math.floor(obstacle.y - obstacle.height * 0.5 + half)
    if (obstacle.kind === "warehouse" || obstacle.kind === "house" || obstacle.kind === "hedge") {
      for (let row = 0; row < obstacle.tiles.length; row += 1) {
        for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
          if (!obstacle.tiles[row][col]) {
            continue
          }

          setCell(left + col, top + row, material, highTierLoot)
        }
      }
      continue
    }

    const width = Math.max(1, Math.floor(obstacle.width))
    const height = Math.max(1, Math.floor(obstacle.height))
    for (let row = 0; row < height; row += 1) {
      for (let col = 0; col < width; col += 1) {
        setCell(left + col, top + row, material, highTierLoot)
      }
    }
  }

  for (const prop of map.props) {
    const left = Math.floor(prop.x - prop.width / 2 + half)
    const top = Math.floor(prop.y - prop.height / 2 + half)
    const cells: number[] = []
    for (let y = top; y < top + prop.height; y += 1) {
      for (let x = left; x < left + prop.width; x += 1) {
        setCell(x, y, OBSTACLE_MATERIAL_PROP, false)
        const index = obstacleGridIndex(map.size, x, y)
        grid.solid[index] = prop.solid ? 1 : 0
        cells.push(index)
      }
    }
    for (const cell of cells) grid.propCells.set(cell, cells)
  }
  return grid
}

export const damageObstacleCell = (grid: ObstacleGridState, x: number, y: number, amount: number) => {
  if (!isObstacleCellDamageable(grid, x, y)) {
    return {
      damaged: false,
      destroyed: false,
      damageDealt: 0,
      material: OBSTACLE_MATERIAL_NONE,
      destroyedMaterial: OBSTACLE_MATERIAL_NONE,
      destroyedCells: [] as number[],
    }
  }

  const index = obstacleGridIndex(grid.size, x, y)
  const material = grid.material[index]
  const armor = obstacleArmorForMaterial(material)
  const highTierLoot = grid.highTierLoot[index] > 0
  const hpBefore = grid.hp[index]
  const damageDealt = Math.max(0, amount - armor)
  const affected = grid.propCells.get(index) ?? [index]
  const hpAfter = damageDealt > 0 ? Math.max(0, hpBefore - damageDealt) : hpBefore
  const destroyed = hpBefore > 0 && hpAfter <= 0
  for (const cell of affected) {
    grid.hp[cell] = hpAfter
    grid.flash[cell] = 1
    grid.flashKind[cell] = damageDealt > 0 ? OBSTACLE_FLASH_DAMAGED : OBSTACLE_FLASH_BLOCKED
    grid.flashActiveIndices.add(cell)
    if (destroyed) {
      grid.solid[cell] = 0
      grid.material[cell] = OBSTACLE_MATERIAL_NONE
      grid.highTierLoot[cell] = 0
      grid.flashKind[cell] = OBSTACLE_FLASH_NONE
      grid.propCells.delete(cell)
    }
  }
  if (destroyed) grid.revision += 1
  return {
    damaged: true,
    destroyed,
    damageDealt,
    material,
    destroyedMaterial: destroyed ? material : OBSTACLE_MATERIAL_NONE,
    destroyedHighTierLoot: destroyed && highTierLoot,
    destroyedCells: destroyed ? affected : [],
  }
}

export const decayObstacleFlash = (grid: ObstacleGridState, dt: number) => {
  const decay = dt * 12
  for (const index of grid.flashActiveIndices) {
    if (grid.flashKind[index] === OBSTACLE_FLASH_NONE) {
      grid.flash[index] = 0
      grid.flashActiveIndices.delete(index)
      continue
    }

    const next = grid.flash[index] - decay
    if (next <= 0) {
      grid.flash[index] = 0
      grid.flashKind[index] = OBSTACLE_FLASH_NONE
      grid.flashActiveIndices.delete(index)
      continue
    }

    grid.flash[index] = next
  }
}
