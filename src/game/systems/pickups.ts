import { Pickup, type Unit } from "../entities.ts"
import { distSquared, randomPointInArena, randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import type { WorldState } from "../world/state.ts"
import { LOOT_PICKUP_INTERVAL_MAX_SECONDS, LOOT_PICKUP_INTERVAL_MIN_SECONDS } from "../world/constants.ts"
import { isObstacleCellSolid, obstacleGridToWorldCenter, worldToObstacleGrid } from "../world/obstacle-grid.ts"

const pointOverlapsRect = (
  pointX: number,
  pointY: number,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  radius: number,
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
      if (!isObstacleCellSolid(grid, gx, gy)) {
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

export interface PickupDeps {
  randomLootablePrimary: () => "assault" | "shotgun" | "flamethrower"
  force?: boolean
}

export const spawnPickupAt = (world: WorldState, position: { x: number; y: number }, deps: PickupDeps) => {
  let slot = world.pickups.find((pickup) => !pickup.active)
  if (!slot && deps.force) {
    slot = new Pickup()
    world.pickups.push(slot)
  }

  if (!slot) {
    return
  }

  slot.active = true
  slot.position.set(position.x, position.y)
  slot.weapon = deps.randomLootablePrimary()
  slot.radius = 0.8
  slot.bob = randomRange(0, Math.PI * 2)
}

export const spawnPickup = (world: WorldState, deps: PickupDeps) => {
  const spawnRadius = Math.max(0, world.arenaRadius * 0.5)
  const pickupRadius = 0.8
  let spawn = randomPointInArena(spawnRadius, 0)

  for (let attempt = 0; attempt < 32; attempt += 1) {
    if (!collidesWithObstacleGrid(world, spawn.x, spawn.y, pickupRadius)) {
      break
    }
    spawn = randomPointInArena(spawnRadius, 0)
  }

  if (collidesWithObstacleGrid(world, spawn.x, spawn.y, pickupRadius)) {
    return
  }

  spawnPickupAt(world, spawn, deps)
}

export const updatePickups = (world: WorldState, dt: number, deps: PickupDeps) => {
  world.pickupTimer -= dt

  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }
    pickup.bob += dt * 2.3
  }

  if (world.pickupTimer <= 0) {
    spawnPickup(world, deps)
    world.pickupTimer = randomRange(LOOT_PICKUP_INTERVAL_MIN_SECONDS, LOOT_PICKUP_INTERVAL_MAX_SECONDS)
  }
}

export interface CollectPickupDeps {
  equipPrimary: (unit: Unit, weaponId: "pistol" | "assault" | "shotgun" | "flamethrower", ammo: number) => void
  onPlayerPickup: (weaponId: "pistol" | "assault" | "shotgun" | "flamethrower") => void
}

export const collectNearbyPickup = (world: WorldState, unit: Unit, deps: CollectPickupDeps) => {
  for (const pickup of world.pickups) {
    if (!pickup.active) {
      continue
    }

    const limit = unit.radius + pickup.radius
    const dsq = distSquared(unit.position.x, unit.position.y, pickup.position.x, pickup.position.y)
    if (dsq > limit * limit) {
      continue
    }

    pickup.active = false
    const config = PRIMARY_WEAPONS[pickup.weapon]
    deps.equipPrimary(unit, pickup.weapon, config.pickupAmmo)

    if (unit.isPlayer) {
      deps.onPlayerPickup(pickup.weapon)
    }
  }
}
