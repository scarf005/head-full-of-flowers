import type { Obstacle, Vec2 } from "../entities.ts"
import type { PrimaryWeaponId } from "../types.ts"
import { distSquared, randomInt, randomPointInArena, randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import {
  BOT_BASE_SPEED,
  BOT_RADIUS,
  OBSTACLE_COUNT_MAX,
  OBSTACLE_COUNT_MIN,
  PLAYER_BASE_SPEED,
  PLAYER_RADIUS,
  UNIT_BASE_HP
} from "../world/constants.ts"
import type { WorldState } from "../world/state.ts"

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
  const obstacleCount = randomInt(OBSTACLE_COUNT_MIN, OBSTACLE_COUNT_MAX)
  const occupied = world.units.map((unit) => unit.position)
  let cursor = 0

  for (const obstacle of world.obstacles) {
    obstacle.active = false
    obstacle.lootDropped = false
  }

  while (cursor < obstacleCount && cursor < world.obstacles.length) {
    const obstacle = world.obstacles[cursor]
    obstacle.kind = Math.random() > 0.73 ? "house" : "box"
    if (obstacle.kind === "house") {
      const cols = randomInt(3, 6)
      const rows = randomInt(3, 5)
      obstacle.width = cols
      obstacle.height = rows
      obstacle.tiles = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true))
      obstacle.maxHp = cols * rows
    } else {
      obstacle.width = randomRange(1.1, 1.9)
      obstacle.height = randomRange(1.1, 1.9)
      obstacle.tiles = []
      obstacle.maxHp = 9
    }
    obstacle.hp = obstacle.maxHp

    let candidate = randomPointInArena(world.arenaRadius - 2)
    let attempts = 0
    while (attempts < 30) {
      let safe = true
      for (const point of occupied) {
        if (distSquared(point.x, point.y, candidate.x, candidate.y) < 4.4 * 4.4) {
          safe = false
          break
        }
      }

      if (safe) {
        break
      }

      candidate = randomPointInArena(world.arenaRadius - 2)
      attempts += 1
    }

    obstacle.active = true
    obstacle.position.copy(candidate)
    occupied.push(candidate.clone())
    cursor += 1
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
