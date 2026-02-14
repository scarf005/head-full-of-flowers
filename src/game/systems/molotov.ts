import type { Throwable } from "../entities.ts"
import { distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"

export const igniteMolotov = (world: WorldState, throwable: Throwable, allocMolotovZone: () => WorldState["molotovZones"][number]) => {
  const zone = allocMolotovZone()
  zone.active = true
  zone.ownerId = throwable.ownerId
  zone.ownerTeam = throwable.ownerTeam
  zone.position.copy(throwable.position)
  zone.radius = 2.9
  zone.life = 2.2
  zone.tick = 0
}

export interface MolotovDeps {
  applyDamage: (
    targetId: string,
    amount: number,
    sourceId: string,
    hitX: number,
    hitY: number,
    impactX: number,
    impactY: number
  ) => void
}

export const updateMolotovZones = (world: WorldState, dt: number, deps: MolotovDeps) => {
  for (const zone of world.molotovZones) {
    if (!zone.active) {
      continue
    }

    zone.life -= dt
    zone.tick -= dt
    if (zone.tick <= 0) {
      zone.tick = 0.22
      const radiusSquared = zone.radius * zone.radius
      for (const unit of world.units) {
        if (unit.id === zone.ownerId) {
          continue
        }

        const dsq = distSquared(unit.position.x, unit.position.y, zone.position.x, zone.position.y)
        if (dsq > radiusSquared) {
          continue
        }

        deps.applyDamage(
          unit.id,
          1,
          zone.ownerId,
          unit.position.x,
          unit.position.y,
          unit.position.x - zone.position.x,
          unit.position.y - zone.position.y
        )
      }
    }

    if (zone.life <= 0) {
      zone.active = false
    }
  }
}
