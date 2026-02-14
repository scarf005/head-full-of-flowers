import type { Unit } from "../entities.ts"
import { distSquared, randomPointInArena, randomRange } from "../utils.ts"
import { PRIMARY_WEAPONS } from "../weapons.ts"
import type { WorldState } from "../world/state.ts"
import { LOOT_PICKUP_INTERVAL_SECONDS } from "../world/constants.ts"

export interface PickupDeps {
  randomLootablePrimary: () => "assault" | "shotgun" | "flamethrower"
}

export const spawnPickupAt = (world: WorldState, position: { x: number; y: number }, deps: PickupDeps) => {
  const slot = world.pickups.find((pickup) => !pickup.active)
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
  spawnPickupAt(world, randomPointInArena(spawnRadius, 0), deps)
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
    world.pickupTimer = LOOT_PICKUP_INTERVAL_SECONDS
  }
}

export interface CollectPickupDeps {
  equipPrimary: (unit: Unit, weaponId: "pistol" | "assault" | "shotgun" | "flamethrower", ammo: number) => void
  onPlayerPickup: (label: string) => void
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
      deps.onPlayerPickup(config.name)
    }
  }
}
