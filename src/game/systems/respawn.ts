import { Vec2, type Obstacle } from "../entities.ts"
import type { PrimaryWeaponId } from "../types.ts"
import { distSquared, randomInt, randomPointInArena } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import { buildObstacleGridFromMap, obstacleGridToWorldCenter, worldToObstacleGrid } from "../world/obstacle-grid.ts"
import {
  BOT_BASE_SPEED,
  BOT_RADIUS,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  UNIT_BASE_HP
} from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

const pointOverlapsRect = (
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  radius: number
) => {
  const halfWidth = width * 0.5
  const halfHeight = height * 0.5
  const nearestX = Math.max(centerX - halfWidth, Math.min(pointX, centerX + halfWidth))
  const nearestY = Math.max(centerY - halfHeight, Math.min(pointY, centerY + halfHeight))
  const dx = pointX - nearestX
  const dy = pointY - nearestY
  return dx * dx + dy * dy < radius * radius
}

const collidesWithObstacleGrid = (world: WorldState, x: number, y: number, radius: number) => {
  const grid = world.obstacleGrid
  const min = worldToObstacleGrid(grid.size, x - radius, y - radius)
  const max = worldToObstacleGrid(grid.size, x + radius, y + radius)

  const minX = Math.max(0, min.x)
  const maxX = Math.min(grid.size - 1, max.x)
  const minY = Math.max(0, min.y)
  const maxY = Math.min(grid.size - 1, max.y)

  for (let gy = minY; gy <= maxY; gy += 1) {
    for (let gx = minX; gx <= maxX; gx += 1) {
      const index = gy * grid.size + gx
      if (grid.solid[index] <= 0) {
        continue
      }

      const center = obstacleGridToWorldCenter(grid.size, gx, gy)
      if (pointOverlapsRect(x, y, center.x, center.y, 1, 1, radius)) {
        return true
      }
    }
  }

  return false
}

export const findSafeSpawn = (world: WorldState, occupied: Vec2[]) => {
  let bestCandidate: Vec2 | null = null
  let bestDistanceScore = -1

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = randomPointInArena(world.arenaRadius)
    if (collidesWithObstacleGrid(world, candidate.x, candidate.y, 0.9)) {
      continue
    }

    let minDistanceScore = Number.POSITIVE_INFINITY
    for (const existing of occupied) {
      const score = distSquared(candidate.x, candidate.y, existing.x, existing.y)
      if (score < minDistanceScore) {
        minDistanceScore = score
      }
    }

    if (minDistanceScore > bestDistanceScore) {
      bestDistanceScore = minDistanceScore
      bestCandidate = candidate
    }
  }

  if (bestCandidate) {
    return bestCandidate
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = randomPointInArena(world.arenaRadius)
    if (!collidesWithObstacleGrid(world, candidate.x, candidate.y, 0.9)) {
      return candidate
    }
  }

  return randomPointInArena(world.arenaRadius)
}

export const spawnAllUnits = (world: WorldState) => {
  const octagonVertexCount = 8
  const stepAngle = (Math.PI * 2) / octagonVertexCount
  const startAngle = Math.random() * Math.PI * 2

  for (let index = 0; index < world.units.length; index += 1) {
    const unit = world.units[index]
    const angle = startAngle + stepAngle * (index % octagonVertexCount)
    const spawnRadius = Math.max(1, world.arenaRadius - unit.radius - 3)
    const spawn = new Vec2(Math.cos(angle) * spawnRadius, Math.sin(angle) * spawnRadius)
    unit.respawn(spawn)
  }

  world.camera.copy(world.player.position)
}

export interface BreakObstacleDeps {
  spawnPickupAt: (position: Vec2) => void
}

export const breakObstacle = (obstacle: Obstacle, deps: BreakObstacleDeps) => {
  obstacle.active = false

  if (!obstacle.lootDropped && Math.random() > 0.48) {
    obstacle.lootDropped = true
    deps.spawnPickupAt(obstacle.position)
  }
}

export const spawnObstacles = (world: WorldState) => {
  world.obstacleGrid = buildObstacleGridFromMap(world.terrainMap)
  for (const obstacle of world.obstacles) {
    obstacle.active = false
    obstacle.lootDropped = false
  }
}

export interface SpawnMapLootDeps {
  spawnPickupAt: (x: number, y: number) => void
}

export const spawnMapLoot = (world: WorldState, deps: SpawnMapLootDeps) => {
  const points = [...world.terrainMap.pickupSpawnPoints]
  if (points.length === 0) {
    return
  }

  for (let index = points.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(0, index)
    const temp = points[index]
    points[index] = points[swapIndex]
    points[swapIndex] = temp
  }

  const minSpawn = Math.min(2, points.length)
  const spawnCount = randomInt(minSpawn, Math.min(5, points.length))
  for (let index = 0; index < spawnCount; index += 1) {
    deps.spawnPickupAt(points[index].x, points[index].y)
  }
}

export interface RespawnDeps {
  equipPrimary: (unitId: string, weaponId: PrimaryWeaponId, ammo: number) => void
  randomLootablePrimary: () => PrimaryWeaponId
}

export const respawnUnit = (world: WorldState, unitId: string, deps: RespawnDeps) => {
  const unit = world.units.find((candidate) => candidate.id === unitId)
  if (!unit) {
    return
  }

  const occupied = world.units.filter((current) => current.id !== unit.id).map((current) => current.position)
  unit.respawn(findSafeSpawn(world, occupied))

  if (!unit.isPlayer) {
    const maybeLoot = Math.random() > 0.54
    if (maybeLoot) {
      const weapon = deps.randomLootablePrimary()
      deps.equipPrimary(unit.id, weapon, PRIMARY_WEAPONS[weapon].pickupAmmo)
    } else {
      deps.equipPrimary(unit.id, "pistol", Number.POSITIVE_INFINITY)
    }
  }
}

export const setupWorldUnits = (
  world: WorldState,
  equipPrimary: (unitId: string, weaponId: PrimaryWeaponId, ammo: number) => void
) => {
  world.player.secondaryMode = "grenade"
  world.player.radius = PLAYER_RADIUS
  world.player.speed = PLAYER_BASE_SPEED
  world.player.maxHp = UNIT_BASE_HP
  world.player.hp = UNIT_BASE_HP
  equipPrimary(world.player.id, "pistol", Number.POSITIVE_INFINITY)

  for (const bot of world.bots) {
    bot.speed = BOT_BASE_SPEED
    bot.radius = BOT_RADIUS
    bot.maxHp = UNIT_BASE_HP
    bot.hp = UNIT_BASE_HP
    equipPrimary(bot.id, "pistol", Number.POSITIVE_INFINITY)
  }

  spawnAllUnits(world)
}
