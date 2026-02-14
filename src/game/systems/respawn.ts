import type { Obstacle, Vec2 } from "../entities.ts"
import type { PrimaryWeaponId } from "../types.ts"
import { distSquared, randomInt, randomPointInArena } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import {
  BOT_BASE_SPEED,
  BOT_RADIUS,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  UNIT_BASE_HP
} from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

const isTiledObstacle = (obstacle: Obstacle) => obstacle.kind === "warehouse"

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

const collidesWithObstacle = (x: number, y: number, obstacle: Obstacle, radius: number) => {
  if (!obstacle.active) {
    return false
  }

  if (isTiledObstacle(obstacle)) {
    const originX = obstacle.position.x - obstacle.width * 0.5
    const originY = obstacle.position.y - obstacle.height * 0.5
    for (let row = 0; row < obstacle.tiles.length; row += 1) {
      for (let col = 0; col < obstacle.tiles[row].length; col += 1) {
        if (!obstacle.tiles[row][col]) {
          continue
        }

        if (pointOverlapsRect(x, y, originX + col + 0.5, originY + row + 0.5, 1, 1, radius)) {
          return true
        }
      }
    }
    return false
  }

  return pointOverlapsRect(x, y, obstacle.position.x, obstacle.position.y, obstacle.width, obstacle.height, radius)
}

export const findSafeSpawn = (world: WorldState, occupied: Vec2[]) => {
  for (let attempt = 0; attempt < 42; attempt += 1) {
    const candidate = randomPointInArena(world.arenaRadius)
    let safe = true

    for (const existing of occupied) {
      if (distSquared(candidate.x, candidate.y, existing.x, existing.y) < 3.2 * 3.2) {
        safe = false
        break
      }
    }

    if (safe) {
      for (const obstacle of world.obstacles) {
        if (collidesWithObstacle(candidate.x, candidate.y, obstacle, 0.9)) {
          safe = false
          break
        }
      }
    }

    if (safe) {
      return candidate
    }
  }

  return randomPointInArena(world.arenaRadius)
}

export const spawnAllUnits = (world: WorldState) => {
  const occupied: Vec2[] = []
  for (const unit of world.units) {
    const spawn = findSafeSpawn(world, occupied)
    occupied.push(spawn.clone())
    unit.respawn(spawn)
  }

  world.camera.copy(world.player.position)
}

export interface BreakObstacleDeps {
  spawnExplosion: (x: number, y: number, radius: number) => void
  spawnPickupAt: (position: Vec2) => void
}

export const breakObstacle = (obstacle: Obstacle, deps: BreakObstacleDeps) => {
  obstacle.active = false
  deps.spawnExplosion(obstacle.position.x, obstacle.position.y, Math.max(obstacle.width, obstacle.height) * 0.8)

  if (!obstacle.lootDropped && Math.random() > 0.48) {
    obstacle.lootDropped = true
    deps.spawnPickupAt(obstacle.position)
  }
}

export const spawnObstacles = (world: WorldState) => {
  let cursor = 0

  for (const obstacle of world.obstacles) {
    obstacle.active = false
    obstacle.lootDropped = false
  }

  for (const blueprint of world.terrainMap.obstacles) {
    if (cursor >= world.obstacles.length) {
      break
    }

    const obstacle = world.obstacles[cursor]
    obstacle.kind = blueprint.kind
    obstacle.position.set(blueprint.x, blueprint.y)
    obstacle.width = blueprint.width
    obstacle.height = blueprint.height
    if (isTiledObstacle(obstacle)) {
      obstacle.tiles = blueprint.tiles.map((row) => [...row])
      obstacle.maxHp = obstacle.tiles.reduce((sum, row) => {
        return sum + row.reduce((count, tile) => count + (tile ? 1 : 0), 0)
      }, 0)
    } else {
      obstacle.tiles = []
      obstacle.maxHp = 2
    }
    obstacle.hp = obstacle.maxHp
    obstacle.active = true
    cursor += 1
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
  randomWeapon: () => PrimaryWeaponId,
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
    const weapon = randomWeapon()
    equipPrimary(bot.id, weapon, PRIMARY_WEAPONS[weapon].pickupAmmo)
  }

  spawnAllUnits(world)
}
