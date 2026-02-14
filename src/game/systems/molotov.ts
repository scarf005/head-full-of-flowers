import type { Team } from "../types.ts"
import type { Throwable } from "../entities.ts"
import { distSquared } from "../utils.ts"
import type { WorldState } from "../world/state.ts"
import { BURNED_FACTION_ID } from "../factions.ts"

export const igniteMolotov = (world: WorldState, throwable: Throwable, allocMolotovZone: () => WorldState["molotovZones"][number]) => {
  const zone = allocMolotovZone()
  zone.active = true
  zone.ownerId = throwable.ownerId
  zone.ownerTeam = throwable.ownerTeam
  zone.source = "molotov"
  zone.position.copy(throwable.position)
  zone.radius = 2.9
  zone.life = 2.2
  zone.tick = 0
  zone.tickInterval = 0.22
  zone.damagePerTick = 1
}

export const spawnFlamePatch = (
  world: WorldState,
  x: number,
  y: number,
  ownerId: string,
  ownerTeam: Team,
  allocMolotovZone: () => WorldState["molotovZones"][number]
) => {
  const zone = allocMolotovZone()
  zone.active = true
  zone.ownerId = ownerId
  zone.ownerTeam = ownerTeam
  zone.source = "flame"
  zone.position.set(x, y)
  zone.radius = 1.12
  zone.life = 3
  zone.tick = 0
  zone.tickInterval = 1
  zone.damagePerTick = 1
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
  const mapSize = world.terrainMap.size
  const half = Math.floor(mapSize * 0.5)

  for (const zone of world.molotovZones) {
    if (!zone.active) {
      continue
    }

    zone.life -= dt
    zone.tick -= dt
    if (zone.tick <= 0) {
      zone.tick = zone.tickInterval
      const radiusSquared = zone.radius * zone.radius
      for (const unit of world.units) {
        const dsq = distSquared(unit.position.x, unit.position.y, zone.position.x, zone.position.y)
        if (dsq > radiusSquared) {
          continue
        }

        deps.applyDamage(
          unit.id,
          zone.damagePerTick,
          zone.ownerId,
          unit.position.x,
          unit.position.y,
          unit.position.x - zone.position.x,
          unit.position.y - zone.position.y
        )
      }

      if (zone.source === "flame") {
        const minGridX = Math.max(0, Math.floor(zone.position.x - zone.radius) + half - 1)
        const maxGridX = Math.min(mapSize - 1, Math.floor(zone.position.x + zone.radius) + half + 1)
        const minGridY = Math.max(0, Math.floor(zone.position.y - zone.radius) + half - 1)
        const maxGridY = Math.min(mapSize - 1, Math.floor(zone.position.y + zone.radius) + half + 1)

        for (let gridY = minGridY; gridY <= maxGridY; gridY += 1) {
          for (let gridX = minGridX; gridX <= maxGridX; gridX += 1) {
            let flowerIndex = world.flowerCellHead[gridY * mapSize + gridX]
            while (flowerIndex >= 0 && flowerIndex < world.flowers.length) {
              const flower = world.flowers[flowerIndex]
              const nextInCell = flower.nextInCell
              if (flower.active) {
                const dsq = distSquared(flower.position.x, flower.position.y, zone.position.x, zone.position.y)
                if (dsq <= radiusSquared) {
                  if (!flower.scorched) {
                    const previousOwner = flower.ownerId
                    if (previousOwner in world.factionFlowerCounts) {
                      world.factionFlowerCounts[previousOwner] = Math.max(0, world.factionFlowerCounts[previousOwner] - 1)
                    }
                    if (BURNED_FACTION_ID in world.factionFlowerCounts) {
                      world.factionFlowerCounts[BURNED_FACTION_ID] += 1
                    }
                    flower.scorched = true
                  }

                  if (flower.color !== "#4a453d" || flower.accent !== "#29261f") {
                    flower.color = "#4a453d"
                    flower.accent = "#29261f"
                    if (!flower.renderDirty) {
                      flower.renderDirty = true
                      world.flowerDirtyCount += 1
                    }
                  }
                }
              }
              flowerIndex = nextInCell
            }
          }
        }
      }
    }

    if (zone.life <= 0) {
      zone.active = false
    }
  }
}
